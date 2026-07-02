# Cloudflare Setup — OSI Tracker + Weekday V-DEM Alert

Everything runs on **one free Cloudflare account**: the public tracker site *and* the weekday Slack alert, from a single Worker. No Netlify needed. No paywall. No Perplexity credits. Cloudflare's free tier covers Workers, Cron Triggers, KV, and static assets at this volume.

You'll do this once. Budget ~15 minutes. I've marked each step **[you]** (only you can do it) vs **[copy-paste]** (just run the command).

---

## Step 0 — Create the Cloudflare account **[you]**
1. Go to https://dash.cloudflare.com/sign-up
2. Sign up with your email, verify the confirmation email, log in.
3. You do **not** need to add a domain or a payment method. The free `*.workers.dev` subdomain is enough and costs nothing.

*(You asked about Netlify too — you don't need it. Cloudflare alone hosts the site and runs the scheduler. Skip Netlify entirely.)*

---

## Step 1 — Install the tools **[copy-paste]**
On your Mac, in a terminal:
```bash
# Node 18+ required. Check with: node --version
cd path/to/cloudflare-osi        # this folder
npm install                       # installs wrangler locally
npx wrangler login                # opens a browser → click "Allow" [you]
```
`wrangler login` is the only browser step here — it links this folder to your Cloudflare account.

---

## Step 2 — Create the KV store (holds the week-over-week snapshot) **[copy-paste]**
```bash
npx wrangler kv namespace create SNAPSHOT
```
It prints something like:
```
[[kv_namespaces]]
binding = "SNAPSHOT"
id = "abc123def456..."
```
Copy that **id** and paste it into `wrangler.toml`, replacing `REPLACE_WITH_KV_ID`.

---

## Step 3 — Add your Slack webhook as a secret **[you + copy-paste]**
1. In Slack: **Apps → Incoming Webhooks → Add to Slack**, pick the DM or channel for alerts, copy the webhook URL (starts `https://hooks.slack.com/services/...`). **[you]**
2. Store it as a Cloudflare secret (never goes in any file):
```bash
npx wrangler secret put SLACK_WEBHOOK_URL
# paste the webhook URL when prompted
```

---

## Step 4 — First deploy **[copy-paste]**
```bash
npx wrangler deploy
```
This publishes:
- the **site** at `https://osi-tracker.<your-subdomain>.workers.dev/` (public, e.g. `/index.html`, `/osi_selfscan.json`)
- the **cron alert** on the weekday schedule in `wrangler.toml`.

Copy your live Worker URL from the deploy output.

---

## Step 5 — Point the alert links at your live URL **[you + copy-paste]**
1. In `wrangler.toml`, set `SITE_BASE` to your real URL + `/index.html`, e.g.
   `SITE_BASE = "https://osi-tracker.yourname.workers.dev/index.html"`
2. Redeploy:
```bash
npx wrangler deploy
```
Now every Slack breach line links to `.../index.html?c=<ISO3>` and opens straight to that country.

---

## Step 6 — Test it end-to-end **[you]**
Trigger the alert manually (bypasses the 9am guard) by visiting in your browser:
```
https://osi-tracker.<your-subdomain>.workers.dev/run-alert
```
- **First hit:** stores the baseline snapshot, returns "First run…". No Slack post (correct).
- Edit `public/vdem_current.csv` to force a ≥1.5 drop in a monitored country, `npx wrangler deploy`, hit `/run-alert` again → you should get the Slack line.
- Hit it once more with no change → "No breaches… No ping." (silent, correct).

Once confirmed, remove or protect the `/run-alert` route if you don't want it public (see NOTE in `src/worker.js`).

---

## Keeping the data current
The alert diffs `public/vdem_current.csv` (bundled) against the KV snapshot. To update numbers: edit that CSV → `npx wrangler deploy`. Or set `DATA_CSV_URL` in `wrangler.toml` to an external raw CSV you maintain and skip redeploys.

**Reminder about V-Dem cadence:** the official dataset is annual (v16 now, v17 ~March 2027). Week-over-week deltas are only meaningful against a working CSV *you* update — that's what `vdem_current.csv` is for.

---

## Cost
Cloudflare free tier: Workers (100k req/day), Cron Triggers, KV, and static assets — **all $0** at this volume. No subscription, nothing chargeable. Nothing runs on Perplexity.

## After it's working
Turn off your old Perplexity scheduled V-DEM task yourself (I can't disable it for you).

## Attribution
Source: **V-Dem Country-Year Dataset v16** — Coppedge et al., *Varieties of Democracy Project*, 2026, used under **CC-BY**. OSI is an Opposition International construct, not an official V-Dem index.
