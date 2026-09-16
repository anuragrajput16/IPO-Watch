import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export const notFound = (_req: Request, res: Response) =>
  res.status(404).json({ error: "Not found" });

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(422).json({ error: "Validation failed", fields: err.flatten().fieldErrors });
  }
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  // Unique violation — surface the conflict rather than a bare 500.
  if (typeof err === "object" && err && (err as { code?: string }).code === "23505") {
    return res.status(409).json({ error: "That already exists" });
  }
  console.error(err);
  return res.status(500).json({ error: "Something went wrong" });
}

/** Wraps an async handler so a rejected promise reaches the error middleware. */
export function wrap<T extends Request>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    void fn(req as T, res, next).catch(next);
  };
}
