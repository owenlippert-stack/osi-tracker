# OSI Tracker + V-DEM Weekday Alert

One free repo that does two things at once:

1. **Hosts your Opposition Strength Index (OSI) tracker** as a static site on GitHub Pages (free, permanent URL).
2. **Runs a weekday-morning V-DEM breach alert** via GitHub Actions (free) that DMs you on Slack with a deep-link straight to the affected country's dashboard on that same site.

No paid hosting. No Perplexity credits. The two halves share one repo, which is what makes the dashboard links work: the alert links to `https://<you>.github.io/<repo>/index.html?c=<ISO3>`.

---

## How the hard blocker was solved
The alert needs a public dashboard URL, and V-Dem has no live feed. Both are handled here:
- **URL:** GitHub Pages serves `index.html` at a known, permanent address the moment you push — so the alert can build correct `?c=ISO3` links before the site is even "deployed" in the usual sense.
- **Data cadence:** the official V-Dem dataset is annual, so the alert diffs against a **working CSV you control** (`vdem_current.csv`). You update that file (interim estimates, or the fresh official export on release); the job computes week-over-week deltas from it.

---

## Files
| File | Role |
|------|------|
| `index.html` | The tracker page. Fetches `osi_selfscan.json`; supports `?c=ISO3` deep-links. |
| `osi_selfscan.json` | 179-country OSI data layer (V-Dem v16, CC-BY). |
| `vdem_alert.py` | The breach alert. No LLM/API cost; Slack webhook only; silent when nothing breaches. |
| `vdem_current.csv.sample` | Example working data file — copy to `vdem_current.csv` and maintain. |
| `.github/workflows/vdem-alert.yml` | Free scheduler: weekdays, fires at 13:00 & 14:00 UTC; the script's guard keeps only the 09:00-Toronto run. |
| `.nojekyll` | Ensures Pages serves the JSON as-is. |

---

## One-time setup (~10 min, all free)

**1. Push this repo to GitHub** (public or private; Pages works on both with a free account for public).

**2. Turn on Pages.** Repo → Settings → Pages → Source: *Deploy from a branch* → `main` / root. Your site goes live at:
`https://<username>.github.io/<repo>/index.html`
Confirm a country deep-link works, e.g. append `?c=BGD`.

**3. Create a Slack Incoming Webhook** pointed at the DM/channel you want the pings in (Slack → Apps → *Incoming Webhooks* → Add). Copy the webhook URL.

**4. Add the two config values to the repo:**
- Settings → Secrets and variables → Actions → **Secrets** → add `SLACK_WEBHOOK_URL` = your webhook.
- Same page → **Variables** → add `OSI_SITE_BASE` = `https://<username>.github.io/<repo>/index.html`.

**5. Add your data.** Copy `vdem_current.csv.sample` to `vdem_current.csv`, fill in real values, commit. (Columns: `ISO3,Country,<indicator codes…>`.)

That's it. First scheduled run stores a silent baseline; from then on it pings only on a ≥ 1.5 breach in a monitored country.

---

## Test it before trusting it
Manually trigger: repo → Actions → *V-DEM Weekday Alert* → **Run workflow**. Manual runs bypass the 9am guard so you see output immediately. Or locally:
```bash
export VDEM_SKIP_HOUR_GUARD=1
export OSI_SITE_BASE="https://you.github.io/repo/index.html"
cp vdem_current.csv.sample vdem_current.csv
python3 vdem_alert.py          # dry-run (prints, doesn't post) until SLACK_WEBHOOK_URL is set
```

## Active monitoring list (edit `MONITOR` in `vdem_alert.py`)
Bangladesh · Myanmar · Nepal · Philippines · Pakistan · India · Sri Lanka · Thailand · Indonesia · Cambodia · Canada (comparator).

## Cost
GitHub Pages + GitHub Actions on a personal account: **free** at this volume. No Perplexity credits are consumed by this automation. Once it's confirmed working, you can turn off the old Perplexity scheduled V-DEM task (you'll need to do that yourself).

## Attribution
Source data: **V-Dem Country-Year Dataset v16** — Coppedge et al., *Varieties of Democracy Project*, 2026. Used under **CC-BY**. The OSI is an analytical construct by Opposition International from a subset of V-Dem indicators; it is not an official V-Dem index.
