# OSI Tracker — iPhone Setup (No Terminal, No Zip)

This sets up **everything on Cloudflare's free tier** from your iPhone in Safari.
One Cloudflare Worker does two jobs:

1. **Serves your public tracker website** (the OSI / V-Dem dashboard).
2. **Runs the weekday 9am Toronto Slack alert** (cron), comparing this week's
   indicators to last week's and pinging you only when a monitored country
   breaches the 1.5 threshold.

Cost at your volume: **$0**. No credit card, no domain, no subscription.
The site lives on a free `*.workers.dev` URL and is fully public (no paywall).

---

## What you need (5 minutes)

- Your iPhone with Safari.
- Your GitHub login (repo: `owenlippert-stack/osi-tracker`, already public).
- A Slack **Incoming Webhook URL** (we make this in Part 3).

You will **not** touch a terminal, and you will **not** unzip anything.

---

## Part 1 — Create your free Cloudflare account

1. In Safari, go to: **https://dash.cloudflare.com/sign-up**
2. Enter your email (`owen.lippert@gmail.com`) and a password. Tap **Sign Up**.
3. Cloudflare emails you a verification link. Open the email, tap the link.
4. If it asks for a plan, choose **Free**. If it asks to add a website/domain,
   tap **skip / do this later** — you do NOT need a domain.

You're now in the Cloudflare **dashboard** (https://dash.cloudflare.com).

---

## Part 2 — Deploy the Worker straight from GitHub

1. In the dashboard left menu, tap **Workers & Pages**.
2. Tap **Create application** (or **Create**).
3. Tap the **Workers** tab, then look for **Import a repository**
   (may be labeled "Connect to Git" / "Deploy from Git").
4. Tap **Connect GitHub** and log into GitHub on your phone. When GitHub asks
   which repos Cloudflare may access, allow **owenlippert-stack/osi-tracker**
   (or "All repositories").
5. Back on Cloudflare, select the repo **owenlippert-stack/osi-tracker**.
6. On the configure screen, **leave the defaults** — Cloudflare reads
   `wrangler.toml` automatically:
   - It finds the site files in `/public` and serves them.
   - It sets up the weekday cron schedule.
   - It **auto-creates the KV storage** (the week-over-week memory) for you —
     no terminal step needed.
7. Tap **Save and Deploy**.

Wait ~1 minute. When it finishes, Cloudflare shows your live URL, like:
`https://osi-tracker.<something>.workers.dev`

**Copy that URL — you'll need it in Part 4.**

Open it in Safari to confirm your tracker loads. Try a deep link too, e.g.
`https://osi-tracker.<something>.workers.dev/index.html?c=MMR` (Myanmar).

---

## Part 3 — Make your Slack Incoming Webhook

1. In Safari, go to: **https://api.slack.com/apps**
2. Tap **Create New App** → **From scratch**. Name it `OSI Alerts`,
   pick your workspace, tap **Create App**.
3. In the app, tap **Incoming Webhooks** → toggle **On**.
4. Tap **Add New Webhook to Workspace**, choose the channel (or your DM),
   tap **Allow**.
5. Copy the **Webhook URL** it gives you
   (looks like `https://hooks.slack.com/services/T.../B.../xxxx`).

---

## Part 4 — Add your two settings in Cloudflare

Now tell the Worker your Slack webhook and your real site URL.

1. In the Cloudflare dashboard: **Workers & Pages** → tap **osi-tracker**.
2. Tap **Settings** → **Variables and Secrets** (or **Variables**).
3. Add a **Secret** (encrypted):
   - Name: `SLACK_WEBHOOK_URL`
   - Value: paste the Slack webhook URL from Part 3
   - Tap **Encrypt** / **Save**.
4. Add a **Variable** (plain text):
   - Name: `SITE_BASE`
   - Value: your real URL + `/index.html`, e.g.
     `https://osi-tracker.<something>.workers.dev/index.html`
   - Tap **Save**.
5. Tap **Deploy** to apply (if prompted).

---

## Part 5 — Test the alert now (don't wait for 9am)

1. In Safari, open: `https://osi-tracker.<something>.workers.dev/run-alert`
   This runs the alert logic immediately, bypassing the 9am guard.
2. The **first** run just stores today's numbers as the baseline — it stays
   silent (correct behavior). Reload `/run-alert` once more.
3. From then on, you'll get a Slack message **only** when a monitored country
   moves 1.5 or more versus the stored snapshot. No breach = no message.

You're done. Every weekday at **9am Toronto**, the Worker checks the data and
pings you on Slack if a monitored country breaches. The website stays live and
public at your `*.workers.dev` URL.

---

## Updating the data later

Your working dataset is `public/vdem_current.csv` in the GitHub repo.
Edit it on GitHub (pencil icon → commit). Cloudflare auto-redeploys on every
push, so the site and the alert always use your latest numbers.

---

## Monitored countries (ISO3)

BGD, MMR, NPL, PHL, PAK, IND, LKA, THA, IDN, KHM, and CAN (Canada comparator).

## Attribution (required)

Data: **V-Dem Country-Year Dataset v16** (Coppedge et al., Varieties of
Democracy Project, 2026), used under **CC-BY**. "OSI" is an Opposition
International analytical construct, not an official V-Dem index.

## Turn off the old Perplexity task

Once Slack alerts arrive from Cloudflare, disable your old Perplexity
scheduled V-Dem task yourself (in Perplexity) so you stop spending credits.
