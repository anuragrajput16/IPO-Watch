import { Router } from "express";
import { z } from "zod";
import { one, query, tx } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { AppError, wrap } from "../middleware/error.js";
import { validateBody } from "../middleware/validate.js";

export const applicationRouter = Router();
applicationRouter.use(requireAuth);

/* eslint-disable @typescript-eslint/no-explicit-any */
const toDTO = (r: any) => ({
  id: r.id,
  ipoId: r.ipo_id,
  ipoName: r.ipo_name,
  applicantId: r.applicant_id,
  applicantName: r.applicant_name,
  applicantPanLast4: r.pan_last4,
  amount: r.amount,
  allotment: r.allotment as "pending" | "allotted" | "not_allotted",
  allotmentAt: r.allotment_at ? new Date(r.allotment_at).toISOString() : null,
  funders: r.funders ?? [],
});

const SELECT = `
  SELECT a.*, i.name AS ipo_name, p.name AS applicant_name, p.pan_last4,
         COALESCE((
           SELECT json_agg(json_build_object(
                    'applicantId', f.applicant_id,
                    'name', fp.name,
                    'amount', f.amount) ORDER BY fp.name)
             FROM application_funders f
             JOIN applicants fp ON fp.id = f.applicant_id
            WHERE f.application_id = a.id
         ), '[]'::json) AS funders
    FROM applications a
    JOIN ipos i       ON i.id = a.ipo_id
    JOIN applicants p ON p.id = a.applicant_id`;

applicationRouter.get("/", wrap(async (req, res) => {
  const rows = await query(`${SELECT} WHERE a.user_id = $1 ORDER BY i.close_date NULLS LAST, p.name`,
    [req.user!.sub]);
  res.json({ applications: rows.map(toDTO) });
}));

const createSchema = z.object({
  ipoId: z.string().uuid(),
  applicantId: z.string().uuid(),
  amount: z.number().int().min(0).max(100_000_000),
  funders: z.array(z.object({
    applicantId: z.string().uuid(),
    amount: z.number().int().min(0),
  })).optional(),
});

/** Create or update in one call — the UI toggles people on and off a given IPO. */
applicationRouter.post("/", validateBody(createSchema), wrap(async (req, res) => {
  const { ipoId, applicantId, amount, funders } = req.body as z.infer<typeof createSchema>;
  const userId = req.user!.sub;

  // Both sides must belong to the caller; otherwise one user could attach
  // someone else's PAN to their own application.
  const owned = await one(
    `SELECT 1 FROM applicants WHERE id = $1 AND user_id = $2`, [applicantId, userId]);
  if (!owned) throw new AppError(404, "No such person on your list");
  const ipo = await one(`SELECT 1 FROM ipos WHERE id = $1`, [ipoId]);
  if (!ipo) throw new AppError(404, "No such IPO");

  if (funders?.length) {
    const total = funders.reduce((s, f) => s + f.amount, 0);
    if (total !== amount)
      throw new AppError(422, `Funder amounts add up to ${total}, but the application is ${amount}`);
  }

  const id = await tx(async (c) => {
    const ins = await c.query(
      `INSERT INTO applications (user_id, ipo_id, applicant_id, amount)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (ipo_id, applicant_id)
         DO UPDATE SET amount = EXCLUDED.amount
       RETURNING id`,
      [userId, ipoId, applicantId, amount]
    );
    const appId = ins.rows[0]!.id as string;
    await c.query(`DELETE FROM application_funders WHERE application_id = $1`, [appId]);
    for (const f of funders ?? []) {
      await c.query(
        `INSERT INTO application_funders (application_id, applicant_id, amount) VALUES ($1,$2,$3)`,
        [appId, f.applicantId, f.amount]
      );
    }
    return appId;
  });

  const row = await one(`${SELECT} WHERE a.id = $1`, [id]);
  res.status(201).json({ application: toDTO(row) });
}));

applicationRouter.patch("/:id",
  validateBody(z.object({
    amount: z.number().int().min(0).optional(),
    allotment: z.enum(["pending", "allotted", "not_allotted"]).optional(),
  })),
  wrap(async (req, res) => {
    const { amount, allotment } = req.body;
    const updated = await one(
      `UPDATE applications SET
         amount       = COALESCE($3, amount),
         allotment    = COALESCE($4::allotment_status, allotment),
         allotment_at = CASE WHEN $4 IS NULL OR $4 = 'pending' THEN allotment_at ELSE now() END
       WHERE id = $1 AND user_id = $2 RETURNING id`,
      [req.params.id, req.user!.sub, amount ?? null, allotment ?? null]
    );
    if (!updated) throw new AppError(404, "No such application");
    res.json({ application: toDTO(await one(`${SELECT} WHERE a.id = $1`, [req.params.id])) });
  }));

applicationRouter.delete("/:id", wrap(async (req, res) => {
  const row = await one(`DELETE FROM applications WHERE id = $1 AND user_id = $2 RETURNING id`,
    [req.params.id, req.user!.sub]);
  if (!row) throw new AppError(404, "No such application");
  res.status(204).end();
}));

/** "Is this PAN allotted for this IPO?" — the lookup the static page grew. */
applicationRouter.get("/lookup/:applicantId/:ipoId", wrap(async (req, res) => {
  const { applicantId, ipoId } = req.params;
  const ipo = await one<{ name: string; close_date: string | null; expired: boolean }>(
    `SELECT name, close_date,
            (close_date IS NOT NULL AND close_date < CURRENT_DATE) AS expired
       FROM ipos WHERE id = $1`, [ipoId]);
  if (!ipo) throw new AppError(404, "No such IPO");

  const person = await one<{ name: string }>(
    `SELECT name FROM applicants WHERE id = $1 AND user_id = $2`, [applicantId, req.user!.sub]);
  if (!person) throw new AppError(404, "No such person on your list");

  const app = await one(`${SELECT} WHERE a.ipo_id = $1 AND a.applicant_id = $2 AND a.user_id = $3`,
    [ipoId, applicantId, req.user!.sub]);

  let state: "not_applied" | "not_out_yet" | "allotted" | "not_allotted" | "unchecked";
  if (!app) state = "not_applied";
  else if (!ipo.expired) state = "not_out_yet";
  else if (app.allotment === "allotted") state = "allotted";
  else if (app.allotment === "not_allotted") state = "not_allotted";
  else state = "unchecked";

  res.json({
    state,
    ipo: { id: ipoId, name: ipo.name, closeDate: ipo.close_date, isExpired: ipo.expired },
    applicant: { id: applicantId, name: person.name },
    application: app ? toDTO(app) : null,
  });
}));

/** Per-person totals — the "Contribution by person" table. */
applicationRouter.get("/summary/by-person", wrap(async (req, res) => {
  const rows = await query(
    `SELECT p.id, p.name, p.pan_last4, p.is_self,
            COUNT(a.id)::int                                            AS ipos,
            COALESCE(SUM(a.amount), 0)::int                             AS blocked,
            COUNT(*) FILTER (WHERE a.allotment = 'allotted')::int       AS allotted,
            COUNT(*) FILTER (WHERE a.allotment = 'not_allotted')::int   AS not_allotted,
            COUNT(*) FILTER (WHERE a.allotment = 'pending')::int        AS pending
       FROM applicants p
       LEFT JOIN applications a ON a.applicant_id = p.id
      WHERE p.user_id = $1
      GROUP BY p.id, p.name, p.pan_last4, p.is_self
      ORDER BY p.is_self DESC, p.name`,
    [req.user!.sub]
  );
  res.json({
    people: rows.map((r) => ({
      id: r.id, name: r.name, panLast4: r.pan_last4, isSelf: r.is_self,
      ipos: r.ipos, blocked: r.blocked,
      allotted: r.allotted, notAllotted: r.not_allotted, pending: r.pending,
    })),
  });
}));
