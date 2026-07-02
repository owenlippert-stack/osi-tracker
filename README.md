# OSI Tracker + V-DEM Weekday Alert (Cloudflare)

Opposition International's **Opposition Strength Index (OSI)** tracker plus a free weekday **V-DEM breach alert**, running entirely on one Cloudflare Worker. Public site + scheduled Slack alert, no paywall, no Perplexity credits.

## What's here
- `public/index.html` + `public/osi_selfscan.json` — the 179-country tracker site (V-Dem v16, CC-BY). Supports `?c=ISO3` deep-links.
- `public/vdem_current.csv` — the working indicator file the alert diffs each run (edit with your real values).
- `src/worker.js` — the Worker: serves the site **and** runs the cron alert (KV snapshot diff → Slack line per ≥1.5 breach in a monitored country; silent otherwise).
- `wrangler.toml` — config: cron schedule, threshold, site URL, KV binding.
- `test/run_local.mjs` — local logic test (`node test/run_local.mjs`).

## Setup
Full click-by-click in **[SETUP.md](./SETUP.md)**. Short version:
```bash
npm install
npx wrangler login
npx wrangler kv namespace create SNAPSHOT   # paste id into wrangler.toml
npx wrangler secret put SLACK_WEBHOOK_URL   # your Slack Incoming Webhook
npx wrangler deploy
```
Then set `SITE_BASE` in `wrangler.toml` to your live Worker URL and redeploy. Test via `https://<your-worker>.workers.dev/run-alert`.

## Cost
Cloudflare free tier (Workers + Cron Triggers + KV + assets) — $0 at this volume. Nothing chargeable, nothing on Perplexity.

## Attribution
Source: V-Dem Country-Year Dataset v16 (Coppedge et al., Varieties of Democracy Project, 2026), used under CC-BY. OSI is an Opposition International analytical construct, not an official V-Dem index.
