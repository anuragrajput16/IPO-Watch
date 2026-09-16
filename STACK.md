# IPO Watch — full stack

The single-page tracker (`index.html`) rebuilt as three deployable pieces sharing
one database. The static page still works and is untouched; this lives alongside it.

```
backend/   Node 20 · Express · TypeScript · PostgreSQL     :4000
web/       React 18 · Vite · TypeScript  — user dashboard  :5173
admin/     React 18 · Vite · TypeScript  — admin console   :5174
docker-compose.yml   Postgres 18                           :5433
```

Both front ends talk to the same API and are separated by role, not by backend.

---

## Running it

```bash
docker compose up -d          # Postgres on 5433 (5432 is left to your local install)

cd backend && npm install
npm run setup:env             # writes .env with freshly generated secrets
npm run seed                  # migrates, then loads 18 IPOs and two accounts
npm run dev                   # API on :4000

cd ../web   && npm install && npm run dev     # :5173
cd ../admin && npm install && npm run dev     # :5174
```

Seeded accounts: `demo@ipowatch.local` / `demo12345` and
`admin@ipowatch.local` / `admin12345`.

`npm run scrape` in `backend/` pulls GMP once — the entry point for cron or a
GitHub Action, replacing `scripts/scrape_gmp.py`.

---

## Schema

Nine tables, in `backend/migrations/001_init.sql`. The split that matters: **IPO and
GMP data is shared master data only admins write; everything else hangs off
`users.id`** and is filtered by it in every query.

| Table | Holds |
|---|---|
| `users` | email, bcrypt hash, `role` (`user`/`admin`), active flag |
| `refresh_tokens` | hashed tokens, expiry, revocation, `rotated_to` rotation chain |
| `ipos` | the old `DEFAULTS` array — dates, band, quota, four ratings, verdict, registrar, scrape key |
| `gmp_quotes` | every scrape appends a row, so history is kept rather than overwritten |
| `gmp_runs` | scrape attempts with status, match count and error text |
| `applicants` | the people you apply for — name plus an **encrypted** PAN |
| `applications` | one row per (IPO, applicant), with amount and allotment status |
| `application_funders` | who actually funded an application, when it wasn't the applicant |
| `audit_log` | admin writes, with actor and a JSON detail blob |

Ratings are `numeric(2,1)`, so half stars (3.5) are real values and `NULL` means
"not rated yet" — the `?` in the UI.

### PAN handling

A PAN is personal data, and the original app kept it on-device. Moving it to a
server means:

- **`pan_encrypted`** — AES-256-GCM, key from `PAN_ENCRYPTION_KEY`, stored as
  `iv:tag:ciphertext`.
- **`pan_hash`** — an HMAC so uniqueness can be enforced and a PAN looked up
  without decrypting anything.
- **`pan_last4`** — what the UI shows (`•••••234F`).

Full PANs are returned only for `GET /api/applicants?reveal=1`, and never to the
admin console at all. Losing `PAN_ENCRYPTION_KEY` makes stored PANs unreadable.

---

## Auth

Email/password with bcrypt (cost 12). On success you get a **15-minute access
token** in memory and a **30-day refresh token** in an httpOnly cookie.

- The access token is never in `localStorage`, so an XSS can't read it.
- The refresh token is stored **hashed** — a database leak doesn't hand out sessions.
- Refresh **rotates**: the presented token is revoked and a new one issued.
- Replaying an already-rotated token is treated as a leak and **revokes every
  session for that user** (`rotated_to` makes the chain detectable).
- The API client retries a 401 once through `/auth/refresh`, collapsing parallel
  401s into a single refresh, so a expiring token never interrupts the user.
- Demoting or deactivating someone revokes their live sessions immediately.

---

## API

All routes are under `/api`; everything except `/api/health` and the auth entry
points needs `Authorization: Bearer <access token>`.

| | |
|---|---|
| `POST /auth/register` · `/auth/login` · `/auth/refresh` · `/auth/logout` · `/auth/logout-all` | rate-limited 20 / 15 min |
| `GET /auth/me` | current user |
| `GET /ipos` · `/ipos/:id` · `/ipos/:id/gmp` | IPOs with their latest quote, and quote history |
| `GET/POST/PATCH/DELETE /applicants` | your people; PAN validated against `[A-Z]{5}[0-9]{4}[A-Z]` |
| `GET/POST/PATCH/DELETE /applications` | create is an upsert on (IPO, applicant) |
| `GET /applications/lookup/:applicantId/:ipoId` | **is it allotted?** → one of five states |
| `GET /applications/summary/by-person` | the contribution table |
| `GET/POST/PATCH/DELETE /admin/ipos` | master data; delete refuses while applications reference it unless `?force=1` |
| `GET/PATCH /admin/users` | roles and activation; you can't demote yourself |
| `POST /admin/gmp/refresh` · `GET /admin/gmp/runs` · `POST /admin/gmp/:ipoId` | scrape now, run log, manual override |
| `GET /admin/stats` · `GET /admin/audit` | aggregates and the admin audit trail |

The lookup returns `not_applied`, `not_out_yet`, `allotted`, `not_allotted` or
`unchecked` — the same five the static page grew, now server-side.

---

## What carried over, and what didn't

Carried over: the 18 IPOs, window grouping, rank medals, `EXPIRED` pills, half
stars, the four rating columns, verdict tones, GMP with its rupee sub-line,
per-person contribution totals, and the allotment lookup.

Not carried over yet:

- **Funder splits** have tables and API support (`application_funders`, validated
  so the parts sum to the whole) but no UI — the web app always funds an
  application from the applicant.
- **The closed-IPO lock** — the static page froze a recorded, closed IPO behind a
  🔒. Here a closed IPO just shows `+ Late`.
- **The PAN reveal toggle** (the eye button) — the API supports `?reveal=1`, the
  UI doesn't call it.
- **`GET /admin/audit`** returns the audit trail but has no admin screen.

---

## Notes

- `docker-compose.yml` mounts the volume at `/var/lib/postgresql`, not
  `/var/lib/postgresql/data` — postgres:18 changed this and the old path makes the
  container restart-loop.
- `backend/.env` is gitignored; `npm run setup:env` generates it, and
  `npm run setup:env -- --force` rotates the secrets (which invalidates every live
  session, and makes already-encrypted PANs unreadable if the PAN key changes).
- CORS allows exactly `WEB_ORIGIN` and `ADMIN_ORIGIN`, with credentials on for the
  refresh cookie.
