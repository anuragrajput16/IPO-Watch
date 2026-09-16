import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod";

/** Replaces req.body with the parsed value, so handlers get typed, trimmed input. */
export const validateBody =
  (schema: ZodSchema) => (req: Request, _res: Response, next: NextFunction) => {
    req.body = schema.parse(req.body);
    next();
  };
