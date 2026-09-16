import type { NextFunction, Request, Response } from "express";
import { AppError } from "./error.js";
import { verifyAccess, type AccessClaims } from "../services/tokens.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { user?: AccessClaims }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw new AppError(401, "Sign in to continue");
  try {
    req.user = verifyAccess(header.slice(7));
    next();
  } catch {
    // A distinct code lets the client tell "refresh me" from "sign in again".
    throw new AppError(401, "Session expired", "TOKEN_EXPIRED");
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role !== "admin") throw new AppError(403, "Admins only");
  next();
}
