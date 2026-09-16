import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { migrate } from "./db/migrate.js";
import { pool } from "./db/pool.js";

const app = createApp();

// Migrate on boot so a fresh clone plus `npm run dev` is a working server.
await migrate();

const server = app.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}  (${env.NODE_ENV})`);
});

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    server.close(() => { void pool.end().then(() => process.exit(0)); });
  });
}
