import { query } from "../db/pool.js";

export type IpoDTO = {
  id: string; name: string; slug: string;
  openDate: string | null; closeDate: string | null;
  priceMin: number | null; priceMax: number | null;
  lotAmount: number | null; retailQuota: string | null; quotaIndicative: boolean;
  rank: number | null;
  fundamentals: number | null; valuation: number | null;
  longTerm: number | null; listing: number | null;
  verdict: string; verdictTone: "go" | "wait" | "stop";
  registrarName: string | null; registrarUrl: string | null;
  scrapeKey: string | null;
  gmpPct: number | null; gmpRupees: number | null; gmpAt: string | null;
  isExpired: boolean;
};

// The latest quote per IPO, via DISTINCT ON — cheaper than a window function
// and it uses the (ipo_id, captured_at DESC) index directly.
const SELECT_IPOS = `
  SELECT i.*, g.gmp_pct, g.gmp_rupees, g.captured_at AS gmp_at,
         (i.close_date IS NOT NULL AND i.close_date < CURRENT_DATE) AS is_expired
    FROM ipos i
    LEFT JOIN LATERAL (
      SELECT gmp_pct, gmp_rupees, captured_at
        FROM gmp_quotes q WHERE q.ipo_id = i.id
       ORDER BY captured_at DESC LIMIT 1
    ) g ON true`;

/* eslint-disable @typescript-eslint/no-explicit-any */
export function toDTO(r: any): IpoDTO {
  return {
    id: r.id, name: r.name, slug: r.slug,
    openDate: r.open_date ? String(r.open_date).slice(0, 10) : null,
    closeDate: r.close_date ? String(r.close_date).slice(0, 10) : null,
    priceMin: r.price_min, priceMax: r.price_max,
    lotAmount: r.lot_amount, retailQuota: r.retail_quota, quotaIndicative: r.quota_indicative,
    rank: r.rank,
    fundamentals: r.fundamentals, valuation: r.valuation,
    longTerm: r.long_term, listing: r.listing,
    verdict: r.verdict, verdictTone: r.verdict_tone,
    registrarName: r.registrar_name, registrarUrl: r.registrar_url,
    scrapeKey: r.scrape_key,
    gmpPct: r.gmp_pct ?? null, gmpRupees: r.gmp_rupees ?? null,
    gmpAt: r.gmp_at ? new Date(r.gmp_at).toISOString() : null,
    isExpired: r.is_expired,
  };
}

export async function listIpos(): Promise<IpoDTO[]> {
  const rows = await query(`${SELECT_IPOS} ORDER BY i.close_date NULLS LAST, i.rank NULLS LAST, i.name`);
  return rows.map(toDTO);
}

export async function getIpo(id: string): Promise<IpoDTO | null> {
  const rows = await query(`${SELECT_IPOS} WHERE i.id = $1`, [id]);
  return rows[0] ? toDTO(rows[0]) : null;
}

export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
