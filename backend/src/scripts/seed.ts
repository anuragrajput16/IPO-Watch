/**
 * Seeds the IPO master data that used to live in the DEFAULTS array of index.html,
 * plus an admin and a demo user. Idempotent: re-running updates rows by name.
 *
 *   npm run seed
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "../db/migrate.js";
import { one, pool, query } from "../db/pool.js";
import { hashPassword } from "../services/crypto.js";
import { slugify } from "../services/ipos.js";

const KFIN = { name: "KFin Technologies", url: "https://ipostatus.kfintech.com/" };
const MUFG = { name: "MUFG Intime", url: "https://in.mpms.mufg.com/Initial_Offer/public-issues.html" };

type Seed = {
  name: string; open: string; close: string;
  min: number | null; max: number | null; lot: number | null;
  quota: string; quotaIndicative?: boolean; rank?: number;
  f: number | null; v: number | null; lt: number | null; l: number | null;
  verdict: string; tone: "go" | "wait" | "stop";
  reg: { name: string; url: string } | null; key: string;
};

// Ratings are out of 5 in half steps; null is "not rated yet" (the ? in the UI).
const IPOS: Seed[] = [
  { name: "Pranav Constructions",  open: "2026-09-07", close: "2026-09-09", min: 118, max: 124, lot: 14880, quota: "45%", f: 4, v: 4, lt: null, l: 5, verdict: "Apply", tone: "go", reg: KFIN, key: "pranav constructions" },
  { name: "Kanohar Electricals",   open: "2026-09-08", close: "2026-09-10", min: 601, max: 632, lot: 14536, quota: "35%", f: 5, v: 3, lt: null, l: 5, verdict: "Apply", tone: "go", reg: MUFG, key: "kanohar electricals" },
  { name: "Prasol Chemicals",      open: "2026-09-08", close: "2026-09-10", min: 643, max: 676, lot: 14872, quota: "35%", f: 4, v: 3, lt: null, l: 4, verdict: "Cautious Apply", tone: "wait", reg: KFIN, key: "prasol chemicals" },
  { name: "Glass Wall Systems",    open: "2026-09-08", close: "2026-09-10", min: 172, max: 182, lot: 14924, quota: "35%", f: 4, v: 2, lt: null, l: 3, verdict: "Skip", tone: "wait", reg: MUFG, key: "glass wall systems" },
  { name: "Rentomojo",             open: "2026-09-09", close: "2026-09-11", min: 384, max: 404, lot: 14948, quota: "10%", f: 5, v: 3, lt: null, l: 5, verdict: "Apply", tone: "go", reg: KFIN, key: "rentomojo" },
  { name: "Karamtara Engineering", open: "2026-09-09", close: "2026-09-11", min: 241, max: 254, lot: 14986, quota: "35%", f: 5, v: 4, lt: null, l: 4, verdict: "Strong Apply", tone: "go", reg: MUFG, key: "karamtara engineering" },
  { name: "LCC Projects",          open: "2026-09-09", close: "2026-09-11", min: 139, max: 146, lot: 14892, quota: "35%", f: 5, v: 4, lt: null, l: 4, verdict: "Apply", tone: "go", reg: KFIN, key: "lcc projects" },
  { name: "Asset Reconstruction",  open: "2026-09-09", close: "2026-09-11", min: 132, max: 139, lot: 14873, quota: "35%", f: 5, v: 4, lt: null, l: 2, verdict: "Long-term", tone: "wait", reg: MUFG, key: "asset reconstruction" },
  { name: "Manipal Payment",       open: "2026-09-09", close: "2026-09-11", min: 322, max: 339, lot: 14916, quota: "35%", f: null, v: null, lt: null, l: 3, verdict: "Wait", tone: "wait", reg: MUFG, key: "manipal payment" },
  { name: "Steamhouse India",      open: "2026-09-09", close: "2026-09-11", min: 77,  max: 81,  lot: 14900, quota: "35%", f: 3, v: null, lt: null, l: 2, verdict: "Skip", tone: "stop", reg: KFIN, key: "steamhouse india" },
  { name: "Veegaland Developers",  open: "2026-09-10", close: "2026-09-15", min: 130, max: 140, lot: 14980, quota: "35%", rank: 6, f: 4, v: 3, lt: 4, l: 3, verdict: "Watch", tone: "wait", reg: MUFG, key: "veegaland developers" },
  { name: "Manika Plastech",       open: "2026-09-11", close: "2026-09-16", min: 40,  max: 43,  lot: 14964, quota: "35%", rank: 5, f: 3.5, v: 4, lt: 3.5, l: 4, verdict: "Selective", tone: "wait", reg: MUFG, key: "manika plastech" },
  { name: "SS Retail",             open: "2026-09-16", close: "2026-09-18", min: 403, max: 424, lot: 14840, quota: "35%", rank: 2, f: 4, v: 3, lt: 4, l: 5, verdict: "Apply", tone: "go", reg: null, key: "ss retail" },
  { name: "Hero Motors",           open: "2026-09-16", close: "2026-09-18", min: 79,  max: 84,  lot: 14952, quota: "35%", rank: 3, f: 4, v: 4, lt: 4, l: 5, verdict: "Apply", tone: "go", reg: null, key: "hero motors" },
  { name: "Jindal Supreme",        open: "2026-09-16", close: "2026-09-18", min: 88,  max: 93,  lot: 14973, quota: "35%", rank: 4, f: 3.5, v: 4, lt: 3.5, l: 5, verdict: "Selective Apply", tone: "go", reg: null, key: "jindal supreme" },
  { name: "NSE",                   open: "2026-09-17", close: "2026-09-21", min: 1700, max: 1785, lot: 14280, quota: "35%", rank: 1, f: 5, v: 4, lt: 5, l: 4, verdict: "Strong Apply", tone: "go", reg: MUFG, key: "nse" },
  { name: "Sonaselection India",   open: "2026-09-17", close: "2026-09-21", min: 94,  max: 99,  lot: 14850, quota: "35%", rank: 7, f: 4, v: 3, lt: 3.5, l: 2, verdict: "Wait", tone: "wait", reg: null, key: "sonaselection" },
  { name: "A-One Steels",          open: "2026-09-24", close: "2026-09-28", min: null, max: null, lot: null, quota: "35%", quotaIndicative: true, rank: 8, f: 3.5, v: null, lt: 3.5, l: 2, verdict: "Wait", tone: "wait", reg: null, key: "one steels" },
];

async function upsertIpo(s: Seed): Promise<string> {
  const row = await one<{ id: string }>(
    `INSERT INTO ipos (name, slug, open_date, close_date, price_min, price_max, lot_amount,
                       retail_quota, quota_indicative, rank, fundamentals, valuation,
                       long_term, listing, verdict, verdict_tone,
                       registrar_name, registrar_url, scrape_key)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     ON CONFLICT (name) DO UPDATE SET
       open_date = EXCLUDED.open_date, close_date = EXCLUDED.close_date,
       price_min = EXCLUDED.price_min, price_max = EXCLUDED.price_max,
       lot_amount = EXCLUDED.lot_amount, retail_quota = EXCLUDED.retail_quota,
       quota_indicative = EXCLUDED.quota_indicative, rank = EXCLUDED.rank,
       fundamentals = EXCLUDED.fundamentals, valuation = EXCLUDED.valuation,
       long_term = EXCLUDED.long_term, listing = EXCLUDED.listing,
       verdict = EXCLUDED.verdict, verdict_tone = EXCLUDED.verdict_tone,
       registrar_name = EXCLUDED.registrar_name, registrar_url = EXCLUDED.registrar_url,
       scrape_key = EXCLUDED.scrape_key
     RETURNING id`,
    [s.name, slugify(s.name), s.open, s.close, s.min, s.max, s.lot, s.quota,
     s.quotaIndicative ?? false, s.rank ?? null, s.f, s.v, s.lt, s.l, s.verdict, s.tone,
     s.reg?.name ?? null, s.reg?.url ?? null, s.key]
  );
  return row!.id;
}

/** Carry the last scraped numbers over from the static site's gmp.json, if it's there. */
async function seedQuotes(ids: Map<string, string>): Promise<number> {
  const path = join(dirname(fileURLToPath(import.meta.url)), "../../../gmp.json");
  let file: { source_stamp?: string; items?: { name: string; gmp_pct: number | null; gmp_rupees: number | null }[] };
  try {
    file = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    console.log("  (no gmp.json next door — skipping quote seed)");
    return 0;
  }
  let n = 0;
  for (const item of file.items ?? []) {
    const id = ids.get(item.name);
    if (!id || item.gmp_rupees === null) continue;
    await query(
      `INSERT INTO gmp_quotes (ipo_id, gmp_pct, gmp_rupees, source_stamp) VALUES ($1,$2,$3,$4)`,
      [id, item.gmp_pct, item.gmp_rupees, file.source_stamp ?? null]);
    n++;
  }
  return n;
}

async function upsertUser(email: string, name: string, pw: string, role: "user" | "admin") {
  const row = await one<{ id: string }>(
    `INSERT INTO users (email, password_hash, name, role) VALUES ($1,$2,$3,$4)
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role
     RETURNING id`,
    [email, await hashPassword(pw), name, role]);
  return row!.id;
}

async function main() {
  await migrate();

  const ids = new Map<string, string>();
  for (const s of IPOS) ids.set(s.name, await upsertIpo(s));
  console.log(`  ${ids.size} IPOs`);

  console.log(`  ${await seedQuotes(ids)} GMP quotes`);

  // Deployments set ADMIN_EMAIL/ADMIN_PASSWORD; locally the defaults are fine.
  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@ipowatch.local";
  const adminPw = process.env.ADMIN_PASSWORD ?? "admin12345";
  if (adminPw.length < 8) throw new Error("ADMIN_PASSWORD must be at least 8 characters");

  await upsertUser(adminEmail, "Admin", adminPw, "admin");
  console.log(`  admin: ${adminEmail}`);

  if (process.env.SKIP_DEMO_USER === "true") {
    console.log("  demo user skipped");
  } else {
    await upsertUser("demo@ipowatch.local", "Demo User", "demo12345", "user");
    console.log("  demo: demo@ipowatch.local / demo12345");
  }
  if (adminPw === "admin12345")
    console.log("  ⚠  default admin password in use — change it before exposing this.");
}

main()
  .then(() => { console.log("seed complete"); return pool.end(); })
  .catch(async (e) => { console.error(e); await pool.end(); process.exit(1); });
