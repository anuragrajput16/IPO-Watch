import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { errorHandler, notFound } from "./middleware/error.js";
import { adminRouter } from "./routes/admin.js";
import { applicantRouter } from "./routes/applicants.js";
import { applicationRouter } from "./routes/applications.js";
import { authRouter } from "./routes/auth.js";
import { ipoRouter } from "./routes/ipos.js";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(helmet());
  // Both front ends share this API; credentials are on for the refresh cookie.
  const origins = [env.WEB_ORIGIN, env.ADMIN_ORIGIN,
                   ...env.EXTRA_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)];
  app.use(cors({ origin: origins, credentials: true }));
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());

  app.get("/api/health", (_req, res) => res.json({ ok: true, env: env.NODE_ENV }));
  app.use("/api/auth", authRouter);
  app.use("/api/ipos", ipoRouter);
  app.use("/api/applicants", applicantRouter);
  app.use("/api/applications", applicationRouter);
  app.use("/api/admin", adminRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
