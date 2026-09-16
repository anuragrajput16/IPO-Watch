import jwt from "jsonwebtoken";
import { ACCESS_TTL, REFRESH_TTL_DAYS, env } from "../config/env.js";
import { one, query } from "../db/pool.js";
import { randomToken, sha256 } from "./crypto.js";

export type AccessClaims = { sub: string; role: "user" | "admin"; email: string };

export function signAccess(claims: AccessClaims): string {
  return jwt.sign(claims, env.JWT_ACCESS_SECRET, { expiresIn: ACCESS_TTL });
}

export function verifyAccess(token: string): AccessClaims {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessClaims;
}

/** Issues a refresh token, storing only its hash. The raw value goes to the cookie. */
export async function issueRefresh(userId: string, userAgent?: string): Promise<string> {
  const raw = randomToken();
  const expires = new Date(Date.now() + REFRESH_TTL_DAYS * 864e5);
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent)
     VALUES ($1,$2,$3,$4)`,
    [userId, sha256(raw), expires, userAgent ?? null]
  );
  return raw;
}

type TokenRow = { id: string; user_id: string; revoked_at: Date | null; expires_at: Date };

/**
 * Rotates a refresh token: the presented one is revoked and a fresh one issued.
 * Presenting an already-revoked token means it leaked and was replayed, so every
 * session for that user is dropped.
 */
export async function rotateRefresh(raw: string, userAgent?: string):
  Promise<{ userId: string; token: string } | null> {
  const row = await one<TokenRow>(
    `SELECT id, user_id, revoked_at, expires_at FROM refresh_tokens WHERE token_hash = $1`,
    [sha256(raw)]
  );
  if (!row) return null;

  if (row.revoked_at) {
    await query(`UPDATE refresh_tokens SET revoked_at = now()
                 WHERE user_id = $1 AND revoked_at IS NULL`, [row.user_id]);
    return null;
  }
  if (row.expires_at.getTime() < Date.now()) return null;

  const next = randomToken();
  const expires = new Date(Date.now() + REFRESH_TTL_DAYS * 864e5);
  const inserted = await one<{ id: string }>(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent)
     VALUES ($1,$2,$3,$4) RETURNING id`,
    [row.user_id, sha256(next), expires, userAgent ?? null]
  );
  await query(`UPDATE refresh_tokens SET revoked_at = now(), rotated_to = $2 WHERE id = $1`,
    [row.id, inserted!.id]);

  return { userId: row.user_id, token: next };
}

export async function revokeRefresh(raw: string): Promise<void> {
  await query(`UPDATE refresh_tokens SET revoked_at = now()
               WHERE token_hash = $1 AND revoked_at IS NULL`, [sha256(raw)]);
}

export async function revokeAllForUser(userId: string): Promise<void> {
  await query(`UPDATE refresh_tokens SET revoked_at = now()
               WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);
}
