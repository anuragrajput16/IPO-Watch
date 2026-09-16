import { Router } from "express";
import { z } from "zod";
import { one, query } from "../db/pool.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { AppError, wrap } from "../middleware/error.js";
import { validateBody } from "../middleware/validate.js";
import { runScrape } from "../services/gmp.js";
import { getIpo, listIpos, slugify } from "../services/ipos.js";
import { revokeAllForUser } from "../services/tokens.js";

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

async function audit(actorId: string, action: string, entity: string, entityId?: string, detail: unknown = {}) {
  await query(
    `INSERT INTO audit_log (actor_id, action, entity, entity_id, detail) VALUES ($1,$2,$3,$4,$5)`,
    [actorId, action, entity, entityId ?? null, JSON.stringify(detail)]);
}

// ---------- IPO master data ----------

const rating = z.number().min(0).max(5).nullable().optional();
const ipoSchema = z.object({
  name: z.string().min(1).max(120).trim(),
  openDate: z.string().date().nullable().optional(),
  closeDate: z.string().date().nullable().optional(),
  priceMin: z.number().nonnegative().nullable().optional(),
  priceMax: z.number().nonnegative().nullable().optional(),
  lotAmount: z.number().int().nonnegative().nullable().optional(),
  retailQuota: z.string().max(20).nullable().optional(),
  quotaIndicative: z.boolean().optional(),
  rank: z.number().int().nullable().optional(),
  fundamentals: rating, valuation: rating, longTerm: rating, listing: rating,
  verdict: z.string().max(40).optional(),
  verdictTone: z.enum(["go", "wait", "stop"]).optional(),
  registrarName: z.string().max(80).nullable().optional(),
  registrarUrl: z.string().url().nullable().optional(),
  scrapeKey: z.string().max(80).nullable().optional(),
});

adminRouter.get("/ipos", wrap(async (_req, res) => res.json({ ipos: await listIpos() })));

adminRouter.post("/ipos", validateBody(ipoSchema), wrap(async (req, res) => {
  const b = req.body as z.infer<typeof ipoSchema>;
  const row = await one<{ id: string }>(
    `INSERT INTO ipos (name, slug, open_date, close_date, price_min, price_max, lot_amount,
                       retail_quota, quota_indicative, rank, fundamentals, valuation,
                       long_term, listing, verdict, verdict_tone, registrar_name,
                       registrar_url, scrape_key)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     RETURNING id`,
    [b.name, slugify(b.name), b.openDate ?? null, b.closeDate ?? null, b.priceMin ?? null,
     b.priceMax ?? null, b.lotAmount ?? null, b.retailQuota ?? null, b.quotaIndicative ?? false,
     b.rank ?? null, b.fundamentals ?? null, b.valuation ?? null, b.longTerm ?? null,
     b.listing ?? null, b.verdict ?? "Wait", b.verdictTone ?? "wait", b.registrarName ?? null,
     b.registrarUrl ?? null, b.scrapeKey ?? null]
  );
  await audit(req.user!.sub, "create", "ipo", row!.id, { name: b.name });
  res.status(201).json({ ipo: await getIpo(row!.id) });
}));

adminRouter.patch("/ipos/:id", validateBody(ipoSchema.partial()), wrap(async (req, res) => {
  const b = req.body as Partial<z.infer<typeof ipoSchema>>;
  const existing = await getIpo(req.params.id!);
  if (!existing) throw new AppError(404, "No such IPO");

  const row = await one<{ id: string }>(
    `UPDATE ipos SET
       name             = COALESCE($2, name),
       slug             = COALESCE($3, slug),
       open_date        = COALESCE($4, open_date),
       close_date       = COALESCE($5, close_date),
       price_min        = COALESCE($6, price_min),
       price_max        = COALESCE($7, price_max),
       lot_amount       = COALESCE($8, lot_amount),
       retail_quota     = COALESCE($9, retail_quota),
       quota_indicative = COALESCE($10, quota_indicative),
       rank             = COALESCE($11, rank),
       fundamentals     = COALESCE($12, fundamentals),
       valuation        = COALESCE($13, valuation),
       long_term        = COALESCE($14, long_term),
       listing          = COALESCE($15, listing),
       verdict          = COALESCE($16, verdict),
       verdict_tone     = COALESCE($17::verdict_tone, verdict_tone),
       registrar_name   = COALESCE($18, registrar_name),
       registrar_url    = COALESCE($19, registrar_url),
       scrape_key       = COALESCE($20, scrape_key)
     WHERE id = $1 RETURNING id`,
    [req.params.id, b.name ?? null, b.name ? slugify(b.name) : null, b.openDate ?? null,
     b.closeDate ?? null, b.priceMin ?? null, b.priceMax ?? null, b.lotAmount ?? null,
     b.retailQuota ?? null, b.quotaIndicative ?? null, b.rank ?? null, b.fundamentals ?? null,
     b.valuation ?? null, b.longTerm ?? null, b.listing ?? null, b.verdict ?? null,
     b.verdictTone ?? null, b.registrarName ?? null, b.registrarUrl ?? null, b.scrapeKey ?? null]
  );
  await audit(req.user!.sub, "update", "ipo", row!.id, b);
  res.json({ ipo: await getIpo(req.params.id!) });
}));

adminRouter.delete("/ipos/:id", wrap(async (req, res) => {
  const inUse = await one<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM applications WHERE ipo_id = $1`, [req.params.id]);
  // Deleting would cascade away real user applications, so require an explicit force.
  if (inUse!.n > 0 && req.query.force !== "1")
    throw new AppError(409, `${inUse!.n} application(s) reference this IPO. Re-send with ?force=1 to delete both.`);

  const row = await one(`DELETE FROM ipos WHERE id = $1 RETURNING name`, [req.params.id]);
  if (!row) throw new AppError(404, "No such IPO");
  await audit(req.user!.sub, "delete", "ipo", req.params.id, { name: row.name, cascaded: inUse!.n });
  res.status(204).end();
}));

// ---------- users ----------

adminRouter.get("/users", wrap(async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  const rows = await query(
    `SELECT u.id, u.email, u.name, u.role, u.is_active, u.created_at, u.last_login_at,
            (SELECT COUNT(*)::int FROM applicants  p WHERE p.user_id = u.id) AS applicants,
            (SELECT COUNT(*)::int FROM applications a WHERE a.user_id = u.id) AS applications
       FROM users u
      WHERE ($1 = '' OR u.email ILIKE '%'||$1||'%' OR u.name ILIKE '%'||$1||'%')
      ORDER BY u.created_at DESC LIMIT 200`, [q]);
  res.json({
    users: rows.map((r) => ({
      id: r.id, email: r.email, name: r.name, role: r.role, isActive: r.is_active,
      createdAt: new Date(r.created_at as string).toISOString(),
      lastLoginAt: r.last_login_at ? new Date(r.last_login_at as string).toISOString() : null,
      applicants: r.applicants, applications: r.applications,
    })),
  });
}));

adminRouter.patch("/users/:id",
  validateBody(z.object({
    role: z.enum(["user", "admin"]).optional(),
    isActive: z.boolean().optional(),
  })),
  wrap(async (req, res) => {
    const { role, isActive } = req.body;
    // Locking yourself out of the only admin account is unrecoverable from the UI.
    if (req.params.id === req.user!.sub && (role === "user" || isActive === false))
      throw new AppError(409, "You can't demote or deactivate your own admin account");

    const row = await one(
      `UPDATE users SET role = COALESCE($2::user_role, role), is_active = COALESCE($3, is_active)
       WHERE id = $1 RETURNING id, email, name, role, is_active`,
      [req.params.id, role ?? null, isActive ?? null]);
    if (!row) throw new AppError(404, "No such user");

    // A deactivated or demoted user must not keep a live session.
    if (isActive === false || role === "user") await revokeAllForUser(req.params.id!);
    await audit(req.user!.sub, "update", "user", req.params.id, { role, isActive });
    res.json({ user: { id: row.id, email: row.email, name: row.name, role: row.role, isActive: row.is_active } });
  }));

// ---------- GMP control ----------

adminRouter.post("/gmp/refresh", wrap(async (req, res) => {
  try {
    res.json({ ok: true, ...(await runScrape(req.user!.sub)) });
  } catch (e) {
    throw new AppError(502, `Scrape failed: ${(e as Error).message}`);
  }
}));

adminRouter.get("/gmp/runs", wrap(async (_req, res) => {
  const rows = await query(
    `SELECT r.*, u.email AS triggered_by_email
       FROM gmp_runs r LEFT JOIN users u ON u.id = r.triggered_by
      ORDER BY r.started_at DESC LIMIT 50`);
  res.json({
    runs: rows.map((r) => ({
      id: r.id, status: r.status, matchedCount: r.matched_count, error: r.error,
      triggeredBy: r.triggered_by_email ?? "schedule",
      startedAt: new Date(r.started_at as string).toISOString(),
      finishedAt: r.finished_at ? new Date(r.finished_at as string).toISOString() : null,
    })),
  });
}));

/** Manual override when the source is plainly wrong; recorded as is_manual. */
adminRouter.post("/gmp/:ipoId",
  validateBody(z.object({
    gmpPct: z.number().nullable(),
    gmpRupees: z.number().int().nullable(),
  })),
  wrap(async (req, res) => {
    const ipo = await one(`SELECT 1 FROM ipos WHERE id = $1`, [req.params.ipoId]);
    if (!ipo) throw new AppError(404, "No such IPO");
    await query(
      `INSERT INTO gmp_quotes (ipo_id, gmp_pct, gmp_rupees, source, source_stamp, is_manual)
       VALUES ($1,$2,$3,'manual','entered by admin',true)`,
      [req.params.ipoId, req.body.gmpPct, req.body.gmpRupees]);
    await audit(req.user!.sub, "override", "gmp", req.params.ipoId, req.body);
    res.status(201).json({ ipo: await getIpo(req.params.ipoId!) });
  }));

// ---------- stats ----------

adminRouter.get("/stats", wrap(async (_req, res) => {
  const totals = await one(
    `SELECT (SELECT COUNT(*)::int FROM users)                          AS users,
            (SELECT COUNT(*)::int FROM users WHERE is_active)          AS active_users,
            (SELECT COUNT(*)::int FROM ipos)                           AS ipos,
            (SELECT COUNT(*)::int FROM applications)                   AS applications,
            (SELECT COALESCE(SUM(amount),0)::bigint FROM applications) AS money_tracked,
            (SELECT COUNT(*)::int FROM applications WHERE allotment = 'allotted')     AS allotted,
            (SELECT COUNT(*)::int FROM applications WHERE allotment = 'not_allotted') AS not_allotted`);

  const perIpo = await query(
    `SELECT i.id, i.name, i.close_date,
            COUNT(a.id)::int                                          AS applications,
            COALESCE(SUM(a.amount),0)::bigint                         AS money,
            COUNT(*) FILTER (WHERE a.allotment = 'allotted')::int      AS allotted,
            COUNT(*) FILTER (WHERE a.allotment = 'not_allotted')::int  AS not_allotted
       FROM ipos i LEFT JOIN applications a ON a.ipo_id = i.id
      GROUP BY i.id, i.name, i.close_date
      ORDER BY applications DESC, i.name LIMIT 30`);

  const signups = await query(
    `SELECT date_trunc('day', created_at)::date AS day, COUNT(*)::int AS n
       FROM users WHERE created_at > now() - interval '30 days'
      GROUP BY 1 ORDER BY 1`);

  const decided = (totals!.allotted as number) + (totals!.not_allotted as number);
  res.json({
    totals: {
      users: totals!.users, activeUsers: totals!.active_users, ipos: totals!.ipos,
      applications: totals!.applications, moneyTracked: Number(totals!.money_tracked),
      allotted: totals!.allotted, notAllotted: totals!.not_allotted,
      hitRate: decided ? Math.round((totals!.allotted as number) / decided * 100) : null,
    },
    perIpo: perIpo.map((r) => ({
      id: r.id, name: r.name, closeDate: r.close_date ? String(r.close_date).slice(0, 10) : null,
      applications: r.applications, money: Number(r.money),
      allotted: r.allotted, notAllotted: r.not_allotted,
    })),
    signups: signups.map((r) => ({ day: String(r.day).slice(0, 10), count: r.n })),
  });
}));

adminRouter.get("/audit", wrap(async (_req, res) => {
  const rows = await query(
    `SELECT l.*, u.email FROM audit_log l LEFT JOIN users u ON u.id = l.actor_id
      ORDER BY l.created_at DESC LIMIT 100`);
  res.json({
    entries: rows.map((r) => ({
      id: String(r.id), actor: r.email ?? "system", action: r.action, entity: r.entity,
      entityId: r.entity_id, detail: r.detail,
      createdAt: new Date(r.created_at as string).toISOString(),
    })),
  });
}));
