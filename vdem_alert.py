#!/usr/bin/env python3
"""
OI V-DEM Weekday Breach Alert
=============================
Runs every weekday morning. Compares the current V-DEM indicator snapshot
against the snapshot stored from the prior run, flags any single-indicator
shift of >= CRITICAL_THRESHOLD (default 1.5 on the 0-4 ordinal scale) for a
country on the ACTIVE MONITORING LIST, and posts a one-line Slack summary per
breach with a deep-link to that country's dashboard on the static site.

Design goals:
  * Zero paid-API cost. No LLM calls. Pure diff + Slack webhook.
  * Silent when nothing breaches (no noise, no ping).
  * Deterministic and auditable — the snapshot it diffs against is a file.

WHY A LOCAL SNAPSHOT, NOT "the official V-Dem repo":
  The official V-Dem Country-Year dataset is released ANNUALLY (v16 = Mar 2026,
  v17 expected Mar 2027). There is no weekly-updating official CSV, so a true
  week-over-week diff must run against a working CSV that YOU control/update.
  Point DATA_CSV at that file. On the annual release, swap in the new official
  export and the job will surface every breach at once.

CONFIG: edit the block below, then schedule `python3 vdem_alert.py` weekdays 9am.
"""

import csv, json, os, sys, datetime, urllib.request
try:
    from zoneinfo import ZoneInfo  # py3.9+
except ImportError:
    ZoneInfo = None

# ------------------------- CONFIG -------------------------
# Path to the working indicator CSV you maintain (interim/expert estimates or
# the latest official export). Expected columns: ISO3, Country, then one column
# per indicator code (values on each indicator's native scale).
DATA_CSV = os.environ.get("VDEM_DATA_CSV", "./vdem_current.csv")

# Where the prior-run snapshot is stored (created automatically on first run).
SNAPSHOT = os.environ.get("VDEM_SNAPSHOT", "./vdem_snapshot.json")

# Breach threshold: shift on any single indicator (0-4 ordinal scale).
CRITICAL_THRESHOLD = float(os.environ.get("VDEM_THRESHOLD", "1.5"))

# Active monitoring list — ISO3 codes. Only breaches in these countries ping.
MONITOR = {"BGD","MMR","NPL","PHL","PAK","IND","LKA","THA","IDN","KHM","CAN"}

# Base URL of your DEPLOYED static site. The alert deep-links ?c=ISO3.
# >>> REPLACE THIS PLACEHOLDER with your live URL before going live. <<<
SITE_BASE = os.environ.get("OSI_SITE_BASE", "https://REPLACE-ME.example.com/index.html")

# Slack incoming webhook URL (set as an env var; do not hard-code secrets).
SLACK_WEBHOOK = os.environ.get("SLACK_WEBHOOK_URL", "")

# Indicators to watch (0-4 ordinal). Add/remove as needed.
WATCH_INDICATORS = [
    "v2psoppaut","v2lgoppart","v2lginvstp","v2lgqstexp","v2lgotovst",
    "v2psbantar","v2psbars","v2pscohesv","v2psprlnks","v2pscomprg",
    "v2elfrfair","v2elintim","v2elirreg","v2elembaut","v2elembcap",
]
# ----------------------------------------------------------


def load_current(path):
    """Read the working CSV into {iso3: {indicator: value}} plus country names."""
    rows, names = {}, {}
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            iso = (r.get("ISO3") or "").strip().upper()
            if not iso:
                continue
            names[iso] = (r.get("Country") or iso).strip()
            vals = {}
            for code in WATCH_INDICATORS:
                v = r.get(code, "")
                if v not in (None, ""):
                    try:
                        vals[code] = float(v)
                    except ValueError:
                        pass
            rows[iso] = vals
    return rows, names


def load_snapshot(path):
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_snapshot(path, current):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(current, f, indent=0)


def dashboard_link(iso):
    sep = "&" if "?" in SITE_BASE else "?"
    return f"{SITE_BASE}{sep}c={iso}"


def find_breaches(current, prior, names):
    breaches = []
    for iso, vals in current.items():
        if iso not in MONITOR:
            continue
        prev = prior.get(iso, {})
        for code, now in vals.items():
            was = prev.get(code)
            if was is None:
                continue
            delta = now - was
            if abs(delta) >= CRITICAL_THRESHOLD:
                breaches.append({
                    "iso": iso, "country": names.get(iso, iso),
                    "indicator": code, "was": was, "now": now,
                    "delta": delta,
                })
    return breaches


def format_line(b):
    arrow = "▼" if b["delta"] < 0 else "▲"
    sign = "" if b["delta"] < 0 else "+"
    return (f"{arrow} *{b['country']}* — `{b['indicator']}` "
            f"{b['was']:.2f} → {b['now']:.2f} ({sign}{b['delta']:.2f}) "
            f"| <{dashboard_link(b['iso'])}|dashboard>")


def post_slack(text):
    if not SLACK_WEBHOOK:
        print("[dry-run] SLACK_WEBHOOK_URL not set. Would have posted:\n" + text)
        return
    data = json.dumps({"text": text}).encode("utf-8")
    req = urllib.request.Request(SLACK_WEBHOOK, data=data,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        resp.read()


def local_hour_guard():
    """On scheduled runs, only proceed at 09:00 America/Toronto.
    Because GitHub cron is UTC-only we fire at both 13:00 and 14:00 UTC; this
    makes the off-hour a no-op so the alert lands at 09:00 Toronto year-round.
    Manual runs (GITHUB_EVENT_NAME=workflow_dispatch) and local runs bypass it."""
    if os.environ.get("GITHUB_EVENT_NAME") == "workflow_dispatch":
        return True
    if os.environ.get("VDEM_SKIP_HOUR_GUARD") == "1":
        return True
    if ZoneInfo is None:
        return True  # can't determine tz; don't block
    hour = datetime.datetime.now(ZoneInfo("America/Toronto")).hour
    if hour != 9:
        print(f"Local Toronto hour is {hour}, not 9 — skipping this run.")
        return False
    return True


def main():
    if not local_hour_guard():
        return
    if not os.path.exists(DATA_CSV):
        print(f"ERROR: data CSV not found at {DATA_CSV}", file=sys.stderr)
        sys.exit(1)

    current, names = load_current(DATA_CSV)
    prior = load_snapshot(SNAPSHOT)

    # First run: no prior snapshot to diff against. Store baseline, stay silent.
    if not prior:
        save_snapshot(SNAPSHOT, current)
        print("First run: baseline snapshot stored, no diff performed.")
        return

    breaches = find_breaches(current, prior, names)
    save_snapshot(SNAPSHOT, current)  # advance the baseline for next week

    if not breaches:
        print(f"{datetime.date.today()}: no breaches >= {CRITICAL_THRESHOLD} on monitored countries. No ping.")
        return

    header = (f"*V-DEM breach alert — {datetime.date.today():%a %d %b %Y}* "
              f"(shift ≥ {CRITICAL_THRESHOLD} on monitored countries)")
    body = "\n".join(format_line(b) for b in breaches)
    footer = "\n_Decide if any of these warrant a deeper analysis report for the team._"
    post_slack(f"{header}\n{body}{footer}")
    print(f"Posted {len(breaches)} breach line(s) to Slack.")


if __name__ == "__main__":
    main()
