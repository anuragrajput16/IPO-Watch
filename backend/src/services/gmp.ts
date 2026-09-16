import { env } from "../config/env.js";
import { one, query } from "../db/pool.js";

// Ported from scripts/scrape_gmp.py. The GMP table is server-rendered, so a plain
// GET and a regex pass is enough — no headless browser.
const RUP_RE = /₹\s*([\d,]+)/;
const PCT_RE = /\(([\d.]+)%\)/;
const MIN_MATCHES = 3;

const stripTags = (html: string) =>
  html.replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#8377;/g, "₹")
      .trim();

/** Rows of the first table whose header mentions GMP — the live one, not the archive. */
function parseRows(html: string): string[][] {
  for (const table of html.match(/<table[\s\S]*?<\/table>/g) ?? []) {
    const trs = table.match(/<tr[\s\S]*?<\/tr>/g) ?? [];
    if (!trs.length) continue;
    const header = (trs[0]!.match(/<t[dh][\s\S]*?<\/t[dh]>/g) ?? []).map(stripTags);
    if (!header.some((c) => c.toLowerCase().includes("gmp"))) continue;

    return trs.slice(1)
      .map((tr) => (tr.match(/<t[dh][\s\S]*?<\/t[dh]>/g) ?? []).map(stripTags))
      .filter((cells) => cells.length > 0);
  }
  return [];
}

export type ScrapeResult = { matched: number; stamp: string | null; updated: string[] };

export async function runScrape(triggeredBy?: string): Promise<ScrapeResult> {
  const run = await one<{ id: string }>(
    `INSERT INTO gmp_runs (triggered_by) VALUES ($1) RETURNING id`, [triggeredBy ?? null]);
  const runId = run!.id;

  try {
    const res = await fetch(env.GMP_SOURCE_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`source returned HTTP ${res.status}`);

    const rows = parseRows(await res.text());
    if (!rows.length) throw new Error("GMP table not found — the source layout probably changed");

    const ipos = await query<{ id: string; name: string; scrape_key: string | null }>(
      `SELECT id, name, scrape_key FROM ipos`);

    let matched = 0;
    let stamp: string | null = null;
    const updated: string[] = [];

    for (const ipo of ipos) {
      const key = (ipo.scrape_key ?? ipo.name).toLowerCase();
      const cells = rows.find((c) => {
        const cell = (c[0] ?? "").trim().toLowerCase();
        // Short keys must match the whole name: "nse" as a substring hits everything.
        return key.length <= 4 ? cell === key : cell.includes(key);
      });
      if (!cells) continue;

      const rup = RUP_RE.exec(cells[1] ?? "");
      if (!rup) continue;
      const pct = PCT_RE.exec(cells[4] ?? "");

      matched++;
      stamp = cells[7] ?? stamp;
      updated.push(ipo.name);
      await query(
        `INSERT INTO gmp_quotes (ipo_id, gmp_pct, gmp_rupees, source_stamp)
         VALUES ($1,$2,$3,$4)`,
        [ipo.id, pct ? Number(pct[1]) : null, Number(rup[1]!.replace(/,/g, "")), cells[7] ?? null]
      );
    }

    // Too few matches means the page changed shape; recording that beats writing junk.
    if (matched < MIN_MATCHES) throw new Error(`only ${matched} rows matched (need ${MIN_MATCHES})`);

    await query(
      `UPDATE gmp_runs SET status = 'ok', matched_count = $2, finished_at = now() WHERE id = $1`,
      [runId, matched]);
    return { matched, stamp, updated };
  } catch (e) {
    await query(
      `UPDATE gmp_runs SET status = 'failed', error = $2, finished_at = now() WHERE id = $1`,
      [runId, (e as Error).message]);
    throw e;
  }
}
