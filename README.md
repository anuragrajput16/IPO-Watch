# IPO Watch — auto-refreshing GMP tracker

A single-page IPO dashboard whose grey-market-premium (GMP) numbers refresh
automatically. A scheduled GitHub Action scrapes GMP from ipowatch.in every few
hours, writes `gmp.json`, and your page reads it. A **Refresh GMP** button
re-reads the latest at any time.

---

## What's in here

| File | What it does |
|------|--------------|
| `index.html` | The dashboard. Reads `gmp.json`, has the Refresh button. |
| `gmp.json` | The live data file. Seeded with today's numbers; the Action overwrites it. |
| `scripts/scrape_gmp.py` | Scrapes GMP for your tracked IPOs. Won't overwrite good data on a bad scrape. |
| `.github/workflows/update-gmp.yml` | Runs the scraper on a schedule and commits `gmp.json`. |

---

## Setup (about 10 minutes, one time)

1. **Create the repo.** On GitHub → **New repository** → name it e.g. `ipo-watch`.
   **Make it Public** (recommended — see Safety below). Create.
2. **Upload these files.** On the repo page → **Add file → Upload files** →
   drag in everything, keeping the folders (`scripts/…`, `.github/…`) → **Commit**.
3. **Turn on Pages.** Repo → **Settings → Pages** → *Build and deployment* →
   Source: **Deploy from a branch** → Branch: **main** / **/(root)** → **Save**.
   After a minute you get a URL like `https://<you>.github.io/ipo-watch/`.
   **Open the page from that URL** (not the local file) so live data loads.
4. **Enable Actions.** Repo → **Actions** tab → if prompted, **enable workflows**.
   Open **Update IPO GMP** → **Run workflow** to test it once. It should finish
   in under a minute and (if GMP changed) commit an updated `gmp.json`.

That's it. From now on the data refreshes on its own; the button pulls the newest.

---

## Safety — how to make sure you're never charged

**The simplest safety is a Public repo:** for public repositories, GitHub Actions
minutes are **free and unlimited**, and GitHub Pages hosting is free. There is
nothing to bill. A GMP tracker has no secrets, so public is fine.

If you prefer a **Private** repo, you get **2,000 free Actions minutes/month**.
This project uses roughly:

> 8 runs/day × ~1 min/run × 30 days ≈ **~240 min/month** — about a tenth of the free quota.

To be certain private usage can never cost money, do both of these once:

1. **Set the spending limit to $0.** GitHub → your **Settings → Billing →
   Spending limit** → make sure it is **$0** (this is the default). At $0, GitHub
   simply **stops** running paid minutes when the free quota is gone — it does
   **not** charge you.
2. **Turn on usage alerts.** Same Billing area → set an email alert at 75% so you
   get a heads-up long before the limit.

Extra guards already built into the workflow:

- `timeout-minutes: 3` — no single run can burn more than 3 minutes, even if the
  site hangs.
- `concurrency … cancel-in-progress` — two runs never overlap.
- Runs only **8×/day**. Want fewer? Edit the `cron` line (examples are in the file).

---

## Tuning / troubleshooting

- **Fewer/more refreshes:** edit the `cron` in `.github/workflows/update-gmp.yml`.
- **The page says "showing saved snapshot":** you opened the local file. Open the
  **Pages URL** instead.
- **GMP shows "TBD" for an IPO:** the source has no quote yet, or the IPO name
  didn't match. Names to match live are listed in `scripts/scrape_gmp.py`
  (`TRACKED`). Add or adjust an entry and commit.
- **The scrape finds nothing** (site changed its layout): the script exits without
  wiping `gmp.json`, so your last good data stays. It may need a small selector fix.

---

*GMP is unofficial grey-market data — a rough sentiment signal, not a forecast,
and different sources disagree. Nothing here is financial advice.*
