import { Router } from "express";
import { query } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { AppError, wrap } from "../middleware/error.js";
import { getIpo, listIpos } from "../services/ipos.js";

export const ipoRouter = Router();

// IPO master data is the same for everyone, but still behind auth — this app has
// no anonymous surface, and it keeps one rule instead of two.
ipoRouter.use(requireAuth);

ipoRouter.get("/", wrap(async (_req, res) => {
  res.json({ ipos: await listIpos() });
}));

ipoRouter.get("/:id", wrap(async (req, res) => {
  const ipo = await getIpo(req.params.id!);
  if (!ipo) throw new AppError(404, "No such IPO");
  res.json({ ipo });
}));

/** GMP history for one IPO — drives the sparkline in the web app. */
ipoRouter.get("/:id/gmp", wrap(async (req, res) => {
  const rows = await query(
    `SELECT gmp_pct, gmp_rupees, captured_at, is_manual
       FROM gmp_quotes WHERE ipo_id = $1
      ORDER BY captured_at DESC LIMIT 100`,
    [req.params.id]
  );
  res.json({
    quotes: rows.map((r) => ({
      gmpPct: r.gmp_pct, gmpRupees: r.gmp_rupees,
      capturedAt: new Date(r.captured_at as string).toISOString(),
      isManual: r.is_manual,
    })),
  });
}));
