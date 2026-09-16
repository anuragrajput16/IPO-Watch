import type { Server } from "node:http";
import { createApp } from "../app.js";
import { migrate } from "../db/migrate.js";
import { pool, query } from "../db/pool.js";

let server: Server;
let base: string;

export async function startTestServer(): Promise<string> {
  await migrate();
  // Every run starts from a known-empty state. TRUNCATE ... CASCADE reaches the
  // child tables through their foreign keys.
  await query(`TRUNCATE users, ipos, gmp_runs, audit_log RESTART IDENTITY CASCADE`);
  server = createApp().listen(0);
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("could not bind test server");
  base = `http://127.0.0.1:${addr.port}`;
  return base;
}

export async function stopTestServer(): Promise<void> {
  await new Promise<void>((r) => server.close(() => r()));
  await pool.end();
}

export type Res<T = any> = { status: number; body: T; cookies: string[] };

export async function call<T = any>(
  path: string,
  opts: { method?: string; body?: unknown; token?: string; cookie?: string } = {}
): Promise<Res<T>> {
  const res = await fetch(base + path, {
    method: opts.method ?? "GET",
    headers: {
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.cookie ? { Cookie: opts.cookie } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const cookies = res.headers.getSetCookie?.() ?? [];
  const text = await res.text();
  if (!text) return { status: res.status, body: null as T, cookies };
  try {
    return { status: res.status, body: JSON.parse(text) as T, cookies };
  } catch {
    // Rate-limit and proxy errors come back as plain text; surface that rather
    // than a bare SyntaxError from deep inside the helper.
    throw new Error(`${opts.method ?? "GET"} ${path} → ${res.status}, non-JSON body: ${text.slice(0, 120)}`);
  }
}

/** Pulls the refresh cookie value out of a Set-Cookie list. */
export const refreshCookie = (cookies: string[]): string =>
  cookies.find((c) => c.startsWith("ipw_refresh="))?.split(";")[0] ?? "";

export async function makeUser(email: string, role: "user" | "admin" = "user") {
  const r = await call<{ user: { id: string }; accessToken: string }>("/api/auth/register", {
    method: "POST",
    body: { email, password: "password123", name: email.split("@")[0] },
  });
  if (role === "admin") {
    await query(`UPDATE users SET role = 'admin' WHERE id = $1`, [r.body.user.id]);
    // The role is baked into the access token, so re-issue it by logging in again.
    const again = await call<{ accessToken: string }>("/api/auth/login", {
      method: "POST", body: { email, password: "password123" },
    });
    return { id: r.body.user.id, token: again.body.accessToken, cookies: again.cookies };
  }
  return { id: r.body.user.id, token: r.body.accessToken, cookies: r.cookies };
}

export async function makeIpo(name: string, closeDate: string) {
  const rows = await query<{ id: string }>(
    `INSERT INTO ipos (name, slug, open_date, close_date, lot_amount, verdict, verdict_tone)
     VALUES ($1,$2,$3,$4,14000,'Apply','go') RETURNING id`,
    [name, name.toLowerCase().replace(/\W+/g, "-"), closeDate, closeDate]);
  return rows[0]!.id;
}
