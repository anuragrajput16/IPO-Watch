# Deploying free of cost

Four free services, no card required, no trial clock:

| Piece | Host | Free tier | Catch |
|---|---|---|---|
| Postgres | **Neon** | 0.5 GB, always free | scales to zero, auto-resumes in ~1s |
| API | **Render** web service | free forever | **sleeps after 15 min idle, ~50s cold start** |
| Web + Admin | **GitHub Pages** | free on public repos | one Pages site, apps live in subfolders |
| GMP scrape | **GitHub Actions** | free on public repos | — |

Everything except the API is driven by GitHub Actions, so the only extra accounts
you need are Neon and Render.

**Why not Cloudflare Pages?** It works too, and `web/public/_redirects` plus the
`vercel.json` files are there if you ever want it. GitHub Pages wins here because
it's one less account and these apps have no client-side routing — so they don't
need the URL rewrites that Pages can't do.

The scrape runs on GitHub's machines, not the API, so it keeps working while the
API is asleep.

---

## 1 · Database (Neon)

1. neon.tech → new project, region closest to you.
2. Copy the **pooled** connection string (it has `-pooler` in the host).
3. Load the schema and data from your machine:

```bash
cd backend
DATABASE_URL="postgres://...-pooler.../neondb?sslmode=require" \
DATABASE_SSL=true \
ADMIN_EMAIL="you@example.com" \
ADMIN_PASSWORD="<a real password>" \
SKIP_DEMO_USER=true \
npm run seed
```

`ADMIN_PASSWORD` matters: without it the seed creates `admin12345`, and the admin
console is on the public internet.

## 2 · Generate production secrets

```bash
for k in JWT_ACCESS_SECRET JWT_REFRESH_SECRET PAN_ENCRYPTION_KEY PAN_HASH_SECRET; do
  echo "$k=$(openssl rand -hex 32)"
done
```

Keep these. **`PAN_ENCRYPTION_KEY` can never change** once PANs are stored — a new
key makes every stored PAN unreadable.

## 3 · API (Render)

Render → **New → Blueprint** → pick this repo. [render.yaml](render.yaml) sets
everything except the secrets; add these in the dashboard:

```
DATABASE_URL        the Neon pooled string
JWT_ACCESS_SECRET   ┐
JWT_REFRESH_SECRET  │ from step 2
PAN_ENCRYPTION_KEY  │
PAN_HASH_SECRET     ┘
WEB_ORIGIN          https://<web>.pages.dev      (fill in after step 4)
ADMIN_ORIGIN        https://<admin>.pages.dev
```

`NODE_ENV=production`, `COOKIE_SAMESITE=none` and `DATABASE_SSL=true` come from the
blueprint. All three are required — see *Why the cookie settings matter* below.

## 4 · Front ends (GitHub Pages, via Actions)

Two settings, then it's automatic on every push to `main`:

1. Settings → **Pages** → Source = **GitHub Actions** (not "Deploy from a branch")
2. Settings → Secrets and variables → Actions → **Variables** → new variable
   `API_URL` = `https://<your-api>.onrender.com/api`

[.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml) builds both
apps and publishes all three things under one Pages site:

| | URL |
|---|---|
| Original single-file tracker | `https://anuragrajput16.github.io/IPO-Watch/` |
| React dashboard | `https://anuragrajput16.github.io/IPO-Watch/app/` |
| Admin console | `https://anuragrajput16.github.io/IPO-Watch/admin/` |

The workflow fails loudly if `API_URL` is unset — otherwise the apps would build
pointing at `localhost:4000` and break for everyone but you. `API_URL` is baked in
at **build time**, so changing it needs a re-run, not just a restart.

Then set both `WEB_ORIGIN` and `ADMIN_ORIGIN` on Render to
`https://anuragrajput16.github.io` — same value, because both apps share one origin.
CORS allows exactly those origins; a typo shows up as every request failing in the
browser while `curl` still works.

## 4b · API deploys (optional)

Render auto-deploys on push by default, which is fine. If you'd rather a broken
build never reach it: Render → Settings → **Deploy Hook**, copy the URL into the
`RENDER_DEPLOY_HOOK` secret, turn **Auto-Deploy off**, and
[deploy-api.yml](.github/workflows/deploy-api.yml) takes over — it typechecks and
builds first, and only then asks Render to deploy.

**Actions cannot host the API.** Runners are short-lived job containers and Pages
serves static files only, so something has to run the server. Actions can gate and
trigger that deploy, not replace it.

## 5 · Scheduled scrape (GitHub Actions)

Repo → Settings → Secrets and variables → Actions, add `DATABASE_URL`,
`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `PAN_ENCRYPTION_KEY`, `PAN_HASH_SECRET`.

[.github/workflows/scrape-gmp-db.yml](.github/workflows/scrape-gmp-db.yml) then runs
4×/day. Trigger it once by hand from the Actions tab to confirm it works.

The old `update-gmp.yml` commits `gmp.json` for the static page. Keep it if you
still use that page; delete it if you don't.

---

## Why the cookie settings matter

The refresh token is an httpOnly cookie. Deployed, the API is on `onrender.com` and
the front ends on `pages.dev` — **different sites**, so a `SameSite=Lax` cookie is
simply not sent. Sign-in appears to work, then the session dies after 15 minutes
when the first silent refresh fails.

`COOKIE_SAMESITE=none` fixes it, and browsers only accept `SameSite=None` on a
`Secure` cookie, which needs HTTPS. Render and Pages are both HTTPS, so this works
deployed but **will not work over plain `http://`** — which is why local dev stays
on `lax`.

## Cost control

Nothing here can bill you: Neon and Cloudflare Pages have no paid overflow on the
free plan, Render free services stop rather than charge, and Actions minutes are
unlimited on public repos. If the repo is **private**, Actions bills against the
2,000 free minutes/month — this job uses roughly 8.

## The cold start

A free Render service sleeps after 15 minutes. The first visit afterwards waits
~50 seconds while it wakes, during which the app shows its loading state.

Pinging it on a schedule to keep it awake defeats the purpose of the sleep and is
discouraged by Render. If the wait bothers you, the honest fixes are Render's paid
tier, or moving the API to a serverless host where cold starts are ~1s.

## Security before you expose this

- [ ] Admin password is not `admin12345` (`ADMIN_PASSWORD` at seed, or
      `POST /api/auth/change-password` after)
- [ ] `SKIP_DEMO_USER=true`, or the demo account deactivated in the admin console
- [ ] All four secrets are freshly generated, not the ones from `backend/.env`
- [ ] The admin console URL is only as private as its password — anyone who finds
      it gets a login form
