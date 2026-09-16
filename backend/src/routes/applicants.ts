import { Router } from "express";
import { z } from "zod";
import { one, query } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { AppError, wrap } from "../middleware/error.js";
import { validateBody } from "../middleware/validate.js";
import { PAN_RE, decryptPan, encryptPan, hashPan, panLast4 } from "../services/crypto.js";

export const applicantRouter = Router();
applicantRouter.use(requireAuth);

const bodySchema = z.object({
  name: z.string().min(1).max(80).trim(),
  pan: z.string().trim().toUpperCase().regex(PAN_RE, "PAN looks like ABCDE1234F"),
  isSelf: z.boolean().optional(),
});

/* eslint-disable @typescript-eslint/no-explicit-any */
// The full PAN is only returned when explicitly asked for (?reveal=1), so an
// ordinary list response can't leak one into a log or a cached payload.
const toDTO = (r: any, reveal = false) => ({
  id: r.id,
  name: r.name,
  panLast4: r.pan_last4,
  pan: reveal ? decryptPan(r.pan_encrypted) : null,
  isSelf: r.is_self,
  createdAt: new Date(r.created_at).toISOString(),
});

applicantRouter.get("/", wrap(async (req, res) => {
  const reveal = req.query.reveal === "1";
  const rows = await query(
    `SELECT * FROM applicants WHERE user_id = $1 ORDER BY is_self DESC, created_at`,
    [req.user!.sub]
  );
  res.json({ applicants: rows.map((r) => toDTO(r, reveal)) });
}));

applicantRouter.post("/", validateBody(bodySchema), wrap(async (req, res) => {
  const { name, pan, isSelf } = req.body;
  const dup = await one(`SELECT 1 FROM applicants WHERE user_id = $1 AND pan_hash = $2`,
    [req.user!.sub, hashPan(pan)]);
  if (dup) throw new AppError(409, "That PAN is already on your list");

  // "This is me" is exclusive, enforced by a partial unique index — clear the old one first.
  if (isSelf) await query(`UPDATE applicants SET is_self = false WHERE user_id = $1`, [req.user!.sub]);

  const row = await one(
    `INSERT INTO applicants (user_id, name, pan_encrypted, pan_hash, pan_last4, is_self)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.user!.sub, name, encryptPan(pan), hashPan(pan), panLast4(pan), isSelf ?? false]
  );
  res.status(201).json({ applicant: toDTO(row) });
}));

applicantRouter.patch("/:id", validateBody(bodySchema.partial()), wrap(async (req, res) => {
  const existing = await one(`SELECT * FROM applicants WHERE id = $1 AND user_id = $2`,
    [req.params.id, req.user!.sub]);
  if (!existing) throw new AppError(404, "No such person");

  const { name, pan, isSelf } = req.body as z.infer<typeof bodySchema>;
  if (isSelf) await query(`UPDATE applicants SET is_self = false WHERE user_id = $1`, [req.user!.sub]);

  const row = await one(
    `UPDATE applicants SET
       name          = COALESCE($3, name),
       pan_encrypted = COALESCE($4, pan_encrypted),
       pan_hash      = COALESCE($5, pan_hash),
       pan_last4     = COALESCE($6, pan_last4),
       is_self       = COALESCE($7, is_self)
     WHERE id = $1 AND user_id = $2 RETURNING *`,
    [req.params.id, req.user!.sub, name ?? null,
     pan ? encryptPan(pan) : null, pan ? hashPan(pan) : null, pan ? panLast4(pan) : null,
     isSelf ?? null]
  );
  res.json({ applicant: toDTO(row) });
}));

applicantRouter.delete("/:id", wrap(async (req, res) => {
  const row = await one(`DELETE FROM applicants WHERE id = $1 AND user_id = $2 RETURNING id`,
    [req.params.id, req.user!.sub]);
  if (!row) throw new AppError(404, "No such person");
  res.status(204).end();   // applications cascade
}));
