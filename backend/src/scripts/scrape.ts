import { pool } from "../db/pool.js";
import { runScrape } from "../services/gmp.js";

// Entry point for cron / the GitHub Action: `npm run scrape`.
runScrape()
  .then((r) => { console.log(`[ok] ${r.matched} quotes: ${r.updated.join(", ")}`); return pool.end(); })
  .catch(async (e) => { console.error(`[fail] ${e.message}`); await pool.end(); process.exit(1); });
