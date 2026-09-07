#!/usr/bin/env python3
"""
Scrape live IPO GMP from ipowatch.in and write gmp.json.

Design notes:
- Plain HTTP GET (requests) — the GMP table is server-rendered HTML,
  no headless browser needed.
- Matches only the IPOs we track (TRACKED below) by a lowercase name key,
  so unrelated IPOs on the page are ignored. NSE is matched by exact name
  since "nse" as a plain substring would false-positive on unrelated names.
- SAFETY: if it can't find the table or matches too few rows, it exits
  WITHOUT overwriting gmp.json, so a bad scrape never wipes good data.
"""

import json, re, sys, datetime, pathlib, html
import requests

URL = "https://ipowatch.in/ipo-grey-market-premium-latest-ipo-gmp/"
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
    ("NSE",                   "nse"),  # exact-matched below, not substring
]

RUP_RE = re.compile(r"₹\s*([\d,]+)")
PCT_RE = re.compile(r"\(([\d.]+)%\)")


def get_html():
    r = requests.get(URL, timeout=30, headers={
        "User-Agent": ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"),
    })
    r.raise_for_status()
    return r.text


def strip_tags(cell_html):
    return html.unescape(re.sub(r"<[^>]+>", "", cell_html)).strip()


def parse_rows(page_html):
    """Return the data rows of the first table whose header mentions GMP
    (the live Mainboard table appears before the historical archive table,
    which also has "GMP" in its header)."""
    for table_html in re.findall(r"<table.*?</table>", page_html, re.S):
        rows_html = re.findall(r"<tr>(.*?)</tr>", table_html, re.S)
        if not rows_html:
            continue
        header_cells = [strip_tags(c) for c in
                         re.findall(r"<td.*?>(.*?)</td>", rows_html[0], re.S)]
        if not any("gmp" in c.lower() for c in header_cells):
            continue
        rows = []
        for row_html in rows_html[1:]:
            cells = [strip_tags(c) for c in
                     re.findall(r"<td.*?>(.*?)</td>", row_html, re.S)]
            if cells:
                rows.append(cells)
        return rows
    return []


def extract(cells):
    """cells: [name, gmp, trend, price band, est. listing, date, status, last updated]
    Return (gmp_pct, gmp_rupees)."""
    gmp_rupees = None
    if len(cells) > 1:
        m = RUP_RE.search(cells[1])
        if m:
            gmp_rupees = int(m.group(1).replace(",", ""))

    gmp_pct = None
    if len(cells) > 4 and "₹-" not in cells[4].replace(" ", ""):
        m = PCT_RE.search(cells[4])
        if m:
            gmp_pct = float(m.group(1))

    return gmp_pct, gmp_rupees


def main():
    try:
        page_html = get_html()
    except Exception as e:
        print(f"[error] could not load page: {e}", file=sys.stderr)
        sys.exit(1)

    rows = parse_rows(page_html)
    if not rows:
        print("[error] GMP table not found — keeping existing gmp.json",
              file=sys.stderr)
        sys.exit(1)

    items, matched, last_updated = [], 0, None
    for canon, key in TRACKED:
        found = None
        for cells in rows:
            name_cell = cells[0].strip().lower()
            is_match = name_cell == "nse" if canon == "NSE" else key in name_cell
            if is_match:
                found = cells
                break
        if found:
            pct, rup = extract(found)
            if rup is not None:
                matched += 1
                if len(found) > 7:
                    last_updated = found[7]
            items.append({"name": canon, "gmp_pct": pct, "gmp_rupees": rup})
        else:
            items.append({"name": canon, "gmp_pct": None, "gmp_rupees": None})

    if matched < MIN_MATCHES:
        print(f"[warn] only {matched} matches (< {MIN_MATCHES}); "
              f"keeping existing gmp.json", file=sys.stderr)
        sys.exit(1)

    data = {
        "source": URL,
        "source_stamp": last_updated,
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
