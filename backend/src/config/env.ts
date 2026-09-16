import "dotenv/config";
import { z } from "zod";

// Fail at boot with a readable message rather than at the first request with
// an undefined secret quietly signing tokens nobody can verify.
const schema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  PAN_ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/, "must be 32 bytes of hex"),
  PAN_HASH_SECRET: z.string().min(16),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  ADMIN_ORIGIN: z.string().url().default("http://localhost:5174"),
  GMP_SOURCE_URL: z.string().url(),
  // Deployed, the API and the front ends sit on different sites, so the refresh
  // cookie has to be SameSite=None — which browsers only accept when Secure.
  COOKIE_SAMESITE: z.enum(["lax", "none"]).default("lax"),
  // Managed Postgres (Neon, Supabase, Render) requires TLS; local Docker doesn't.
  // Parsed by hand, not z.coerce.boolean(): coercion is Boolean(value), so the
  // string "false" out of a shell or CI would come through as true.
  DATABASE_SSL: z.enum(["true", "false", "1", "0"]).default("false")
    .transform((v) => v === "true" || v === "1"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Bad environment:\n" + JSON.stringify(parsed.error.flatten().fieldErrors, null, 2));
  process.exit(1);
}

export const env = parsed.data;

if (env.COOKIE_SAMESITE === "none" && env.NODE_ENV !== "production") {
  console.warn("[env] COOKIE_SAMESITE=none needs Secure cookies, which need HTTPS. " +
               "Set NODE_ENV=production when deploying, or sign-in will not persist.");
}
export const ACCESS_TTL = "15m";
export const REFRESH_TTL_DAYS = 30;
