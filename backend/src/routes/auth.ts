import { Router, type Request } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { REFRESH_TTL_DAYS, env } from "../config/env.js";
import { one, query } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { AppError, wrap } from "../middleware/error.js";
import { validateBody } from "../middleware/validate.js";
import { hashPassword, verifyPassword } from "../services/crypto.js";
import { issueRefresh, revokeAllForUser, revokeRefresh, rotateRefresh, signAccess } from "../services/tokens.js";

export const authRouter = Router();
const COOKIE = "ipw_refresh";

// Brute-force guard on the two endpoints that take a password.
const authLimit = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  // The test suite registers dozens of accounts in seconds; limiting it would
  // only test the limiter. Never skipped outside tests.
  skip: () => env.NODE_ENV === "test",
});

// SameSite=None is required once the front ends are on a different site from the
// API, and browsers reject it without Secure — so the two move together.
const crossSite = env.COOKIE_SAMESITE === "none";
const cookieOpts = {
  httpOnly: true,
  sameSite: env.COOKIE_SAMESITE,
  secure: crossSite || env.NODE_ENV === "production",
  maxAge: REFRESH_TTL_DAYS * 864e5,
  path: "/api/auth",
};

type UserRow = {
  id: string; email: string; name: string; role: "user" | "admin";
  password_hash: string; is_active: boolean;
};

const publicUser = (u: UserRow) => ({ id: u.id, email: u.email, name: u.name, role: u.role });

/**
 * Browsers keep the refresh token in an httpOnly cookie, which JavaScript cannot
 * read — that is the point. React Native has no such cookie, so a native client
 * sends `X-Client: mobile` and gets the token in the response body to hold in
 * secure device storage. Opt-in by header, so browser responses are unchanged
 * and a web client can never accidentally receive it.
 */
const isMobile = (req: Request) =>
  String(req.headers["x-client"] ?? "").toLowerCase() === "mobile";

/** The refresh token, from the cookie for browsers or the body for mobile. */
const presentedRefresh = (req: Request): string | undefined =>
  req.cookies?.[COOKIE] || (typeof req.body?.refreshToken === "string" ? req.body.refreshToken : undefined);

authRouter.post("/register", authLimit,
  validateBody(z.object({
    email: z.string().email().transform((v) => v.toLowerCase()),
    password: z.string().min(8, "At least 8 characters"),
    name: z.string().min(1).max(80).trim(),
  })),
  wrap(async (req, res) => {
    const { email, password, name } = req.body;
    const exists = await one(`SELECT 1 FROM users WHERE email = $1`, [email]);
    if (exists) throw new AppError(409, "That email is already registered");

    const user = await one<UserRow>(
      `INSERT INTO users (email, password_hash, name) VALUES ($1,$2,$3)
       RETURNING id, email, name, role, password_hash, is_active`,
      [email, await hashPassword(password), name]
    );
    const refresh = await issueRefresh(user!.id, req.headers["user-agent"]);
    res.cookie(COOKIE, refresh, cookieOpts);
    res.status(201).json({
      user: publicUser(user!),
      accessToken: signAccess({ sub: user!.id, role: user!.role, email: user!.email }),
      ...(isMobile(req) ? { refreshToken: refresh } : {}),
    });
  }));

authRouter.post("/login", authLimit,
  validateBody(z.object({
    email: z.string().email().transform((v) => v.toLowerCase()),
    password: z.string().min(1),
  })),
  wrap(async (req, res) => {
    const user = await one<UserRow>(
      `SELECT id, email, name, role, password_hash, is_active FROM users WHERE email = $1`,
      [req.body.email]
    );
    // Same message either way, so this can't be used to enumerate accounts.
    if (!user || !(await verifyPassword(req.body.password, user.password_hash)))
      throw new AppError(401, "Email or password is wrong");
    if (!user.is_active) throw new AppError(403, "This account is deactivated");

    await query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [user.id]);
    const refresh = await issueRefresh(user.id, req.headers["user-agent"]);
    res.cookie(COOKIE, refresh, cookieOpts);
    res.json({
      user: publicUser(user),
      accessToken: signAccess({ sub: user.id, role: user.role, email: user.email }),
      ...(isMobile(req) ? { refreshToken: refresh } : {}),
    });
  }));

authRouter.post("/refresh", wrap(async (req, res) => {
  const raw = presentedRefresh(req);
  if (!raw) throw new AppError(401, "No session");

  const rotated = await rotateRefresh(raw, req.headers["user-agent"]);
  if (!rotated) {
    res.clearCookie(COOKIE, { path: cookieOpts.path });
    throw new AppError(401, "Session expired, sign in again");
  }
  const user = await one<UserRow>(
    `SELECT id, email, name, role, password_hash, is_active FROM users WHERE id = $1`,
    [rotated.userId]
  );
  if (!user || !user.is_active) throw new AppError(403, "This account is deactivated");

  res.cookie(COOKIE, rotated.token, cookieOpts);
  res.json({
    user: publicUser(user),
    accessToken: signAccess({ sub: user.id, role: user.role, email: user.email }),
    ...(isMobile(req) ? { refreshToken: rotated.token } : {}),
  });
}));

authRouter.post("/logout", wrap(async (req, res) => {
  const raw = presentedRefresh(req);
  if (raw) await revokeRefresh(raw);
  res.clearCookie(COOKIE, { path: cookieOpts.path });
  res.status(204).end();
}));

authRouter.post("/logout-all", requireAuth, wrap(async (req, res) => {
  await revokeAllForUser(req.user!.sub);
  res.clearCookie(COOKIE, { path: cookieOpts.path });
  res.status(204).end();
}));

authRouter.post("/change-password", requireAuth, authLimit,
  validateBody(z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8, "At least 8 characters"),
  })),
  wrap(async (req, res) => {
    const user = await one<UserRow>(`SELECT id, password_hash FROM users WHERE id = $1`, [req.user!.sub]);
    if (!user || !(await verifyPassword(req.body.currentPassword, user.password_hash)))
      throw new AppError(401, "Current password is wrong");

    await query(`UPDATE users SET password_hash = $2 WHERE id = $1`,
      [user.id, await hashPassword(req.body.newPassword)]);

    // A password change should end every other session, then hand this one a
    // fresh pair so the person changing it isn't logged out of their own tab.
    await revokeAllForUser(user.id);
    const refresh = await issueRefresh(user.id, req.headers["user-agent"]);
    res.cookie(COOKIE, refresh, cookieOpts);
    res.json({ ok: true });
  }));

authRouter.get("/me", requireAuth, wrap(async (req, res) => {
  const user = await one<UserRow>(
    `SELECT id, email, name, role, password_hash, is_active FROM users WHERE id = $1`,
    [req.user!.sub]
  );
  if (!user) throw new AppError(404, "User not found");
  res.json({ user: publicUser(user) });
}));
