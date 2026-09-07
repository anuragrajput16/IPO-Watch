#!/usr/bin/env python3
"""
Scrape live IPO GMP from ipoji.com and write gmp.json.

Design notes:
- Uses Playwright (headless Chromium) because the GMP table is rendered
  client-side; a plain requests.get often returns an empty shell.
- Matches only the IPOs we track (TRACKED below) by a lowercase name key,
  so unrelated IPOs on the page are ignored.
- SAFETY: if it can't find the table or matches too few rows, it exits
  WITHOUT overwriting gmp.json, so a bad scrape never wipes good data.
"""

import json, re, sys, datetime, pathlib
from bs4 import BeautifulSoup

URL = "https://www.ipoji.com/ipo-gmp"
OUT = pathlib.Path(__file__).resolve().parent.parent / "gmp.json"
MIN_MATCHES = 4  # require at least this many tracked rows, else keep old file

# canonical name  ->  lowercase substring to find in the page's IPO name
TRACKED = [
    ("Pranav Constructions",  "pranav constructions"),
    ("Kanohar Electricals",   "kanohar electricals"),
    ("Prasol Chemicals",      "prasol chemicals"),
    ("Glass Wall Systems",    "glass wall systems"),
    ("Rentomojo",             "rentomojo"),
    ("Karamtara Engineering", "karamtara engineering"),
    ("LCC Projects",          "lcc projects"),
    ("Asset Reconstruction",  "asset reconstruction"),
    ("Manipal Payment",       "manipal payment"),
    ("Steamhouse India",      "steamhouse india"),
    ("Veegaland Developers",  "veegaland developers"),
    ("Manika Plastech",       "manika plastech"),
    ("NSE",                   "national stock exchange"),
]

PCT_RE = re.compile(r"^[+-]?\d+%$")
RUP_RE = re.compile(r"₹\s*([\d,]+)")
INT_RE = re.compile(r"-?\d+")


def get_html():
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(user_agent=(
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"))
        page.goto(URL, wait_until="networkidle", timeout=60000)
        page.wait_for_selector("table", timeout=30000)
        html = page.content()
        browser.close()
        return html


def parse_rows(html):
    soup = BeautifulSoup(html, "html.parser")
    # pick the table whose header mentions GMP
    target = None
    for table in soup.find_all("table"):
        head = " ".join(th.get_text(" ", strip=True).lower()
                        for th in table.find_all("th"))
        if "gmp" in head:
            target = table
            break
    if target is None:
        return []
    out = []
    for tr in target.find_all("tr"):
        cells = [td.get_text(" ", strip=True)
                 for td in tr.find_all(["td", "th"])]
        if len(cells) >= 4:
            out.append(cells)
    return out


def extract(cells):
    """Return (gmp_pct, gmp_rupees) from a row's cells, or (None, None)."""
    pct = None
    rup = None
    for c in cells:
        t = c.replace(" ", "")
        if pct is None and PCT_RE.match(t):
            m = INT_RE.search(t)
            if m:
                pct = int(m.group())
        if rup is None:
            m = RUP_RE.search(c)
            if m:
                try:
                    rup = int(m.group(1).replace(",", ""))
                except ValueError:
                    pass
    return pct, rup


def main():
    try:
        html = get_html()
    except Exception as e:
        print(f"[error] could not load page: {e}", file=sys.stderr)
        sys.exit(1)

    rows = parse_rows(html)
    if not rows:
        print("[error] GMP table not found — keeping existing gmp.json",
              file=sys.stderr)
        sys.exit(1)

    items, matched = [], 0
    for canon, key in TRACKED:
        found = None
        for cells in rows:
            name_cell = cells[0].lower()
            if key in name_cell:
                found = cells
                break
        if found:
            pct, rup = extract(found)
            if pct is not None or rup is not None:
                matched += 1
            items.append({"name": canon, "gmp_pct": pct, "gmp_rupees": rup})
        else:
            items.append({"name": canon, "gmp_pct": None, "gmp_rupees": None})

    if matched < MIN_MATCHES:
        print(f"[warn] only {matched} matches (< {MIN_MATCHES}); "
              f"keeping existing gmp.json", file=sys.stderr)
        sys.exit(1)

    # try to lift the "As of ... IST" stamp from the page
    stamp = None
    m = re.search(r"As of ([^—\n]+IST)", BeautifulSoup(html, "html.parser")
                  .get_text(" ", strip=True))
    if m:
        stamp = m.group(1).strip()

    data = {
        "source": URL,
        "source_stamp": stamp,
        "generated_at": datetime.datetime.now(datetime.timezone.utc)
                        .strftime("%Y-%m-%dT%H:%M:%SZ"),
        "note": "GMP is unofficial grey-market data, for reference only.",
        "items": items,
    }
    OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n",
                   encoding="utf-8")
    print(f"[ok] wrote {OUT} with {matched} live values")


if __name__ == "__main__":
    main()
