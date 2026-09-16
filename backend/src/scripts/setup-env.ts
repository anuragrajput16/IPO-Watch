/**
 * Writes backend/.env from .env.example with freshly generated secrets.
 *
 *   npm run setup:env            # refuses to clobber an existing .env
 *   npm run setup:env -- --force # regenerates (invalidates every live session)
 *
 * Generating beats shipping placeholder secrets: nobody can accidentally run
 * with a value that's public in the repo's history.
 */
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const target = join(root, ".env");
const example = join(root, ".env.example");
const force = process.argv.includes("--force");

if (existsSync(target) && !force) {
  console.log(".env already exists — leaving it alone. Use --force to regenerate.");
  process.exit(0);
}
if (existsSync(target)) {
  copyFileSync(target, target + ".bak");
  console.log("backed up the old .env to .env.bak");
}

const hex = (bytes: number) => randomBytes(bytes).toString("hex");

const filled = readFileSync(example, "utf8")
  .replace(/^JWT_ACCESS_SECRET=.*$/m,  `JWT_ACCESS_SECRET=${hex(32)}`)
  .replace(/^JWT_REFRESH_SECRET=.*$/m, `JWT_REFRESH_SECRET=${hex(32)}`)
  .replace(/^PAN_ENCRYPTION_KEY=.*$/m, `PAN_ENCRYPTION_KEY=${hex(32)}`)
  .replace(/^PAN_HASH_SECRET=.*$/m,    `PAN_HASH_SECRET=${hex(32)}`);

writeFileSync(target, filled, { mode: 0o600 });
console.log("wrote backend/.env with generated secrets");
if (force) console.log("NOTE: rotating PAN_ENCRYPTION_KEY makes existing encrypted PANs unreadable.");
