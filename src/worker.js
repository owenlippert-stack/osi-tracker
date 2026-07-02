/**
 * OSI Tracker + V-DEM Weekday Breach Alert — Cloudflare Worker
 * ===========================================================
 * ONE Worker does both jobs, on the free plan:
 *   1. Serves the static tracker site (index.html + osi_selfscan.json) via the
 *      [assets] binding — public URL, no paywall.
 *   2. On a Cron Trigger (weekdays 9am Toronto), diffs the current V-DEM working
 *      CSV against the snapshot in KV, and posts a one-line Slack breach summary
 *      per monitored country whose indicator shifted >= THRESHOLD. Silent otherwise.
 *
 * No Perplexity credits. No LLM calls. Free-tier Cloudflare only.
 *
 * CONFIG lives in wrangler.toml (vars) + secrets/KV:
 *   var  THRESHOLD          e.g. "1.5"
 *   var  SITE_BASE          e.g. "https://osi-tracker.<you>.workers.dev/index.html"
 *   var  DATA_CSV_URL       URL of your working CSV (raw). Defaults to the bundled one.
 *   secret SLACK_WEBHOOK_URL  Slack Incoming Webhook (wrangler secret put)
 *   KV binding SNAPSHOT      stores the prior-run values as JSON under key "latest"
 *   [assets] binding ASSETS  serves /public
 */

const MONITOR = new Set(["BGD","MMR","NPL","PHL","PAK","IND","LKA","THA","IDN","KHM","CAN"]);

const WATCH_INDICATORS = [
  "v2psoppaut","v2lgoppart","v2lginvstp","v2lgqstexp","v2lgotovst",
  "v2psbantar","v2psbars","v2pscohesv","v2psprlnks","v2pscomprg",
  "v2elfrfair","v2elintim","v2elirreg","v2elembaut","v2elembcap",
];

export default {
  // ---- 1. Serve the static site ----
  async fetch(request, env) {
    // Manual trigger for testing the alert: GET /run-alert?key=SECRET
    const url = new URL(request.url);
    if (url.pathname === "/run-alert") {
      const out = await runAlert(env, /*manual*/ true);
      return new Response(out, { headers: { "content-type": "text/plain" } });
    }
    // Everything else: static assets (index.html, osi_selfscan.json, etc.)
    return env.ASSETS.fetch(request);
  },

  // ---- 2. Cron Trigger: the weekday alert ----
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runAlert(env, /*manual*/ false));
  },
};

async function runAlert(env, manual) {
  const threshold = parseFloat(env.THRESHOLD || "1.5");
  const siteBase = env.SITE_BASE || "https://REPLACE-ME.workers.dev/index.html";

  // The Cron fires at both 13:00 and 14:00 UTC to cover EDT/EST; only proceed at
  // 09:00 America/Toronto. Manual /run-alert calls bypass the guard.
  if (!manual && !isNineAmToronto()) {
    return "Off-hour cron tick (not 9am Toronto) — skipped.";
  }

  // Fetch current working CSV (bundled asset by default, or an external URL).
  const csvUrl = env.DATA_CSV_URL ||
    new URL("/vdem_current.csv", "https://placeholder/").toString();
  let csvText;
  if (env.DATA_CSV_URL) {
    csvText = await (await fetch(env.DATA_CSV_URL)).text();
  } else {
    // bundled asset
    const res = await env.ASSETS.fetch(new Request("https://assets/vdem_current.csv"));
    csvText = await res.text();
  }

  const { current, names } = parseCsv(csvText);

  // Load prior snapshot from KV.
  const priorRaw = await env.SNAPSHOT.get("latest");
  const prior = priorRaw ? JSON.parse(priorRaw) : null;

  // First run: store baseline, stay silent.
  if (!prior) {
    await env.SNAPSHOT.put("latest", JSON.stringify(current));
    return "First run: baseline snapshot stored in KV, no diff performed.";
  }

  const breaches = findBreaches(current, prior, names, threshold);
  await env.SNAPSHOT.put("latest", JSON.stringify(current)); // advance baseline

  if (breaches.length === 0) {
    return `No breaches >= ${threshold} on monitored countries. No ping.`;
  }

  const header = `*V-DEM breach alert — ${todayToronto()}* (shift ≥ ${threshold} on monitored countries)`;
  const body = breaches.map(b => formatLine(b, siteBase)).join("\n");
  const footer = "\n_Decide if any of these warrant a deeper analysis report for the team._";
  const text = `${header}\n${body}${footer}`;

  if (env.SLACK_WEBHOOK_URL) {
    await fetch(env.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    return `Posted ${breaches.length} breach line(s) to Slack.`;
  }
  return "[dry-run] SLACK_WEBHOOK_URL not set. Would have posted:\n" + text;
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(",").map(h => h.trim());
  const iISO = headers.indexOf("ISO3");
  const iName = headers.indexOf("Country");
  const current = {}, names = {};
  for (let r = 1; r < lines.length; r++) {
    const cells = lines[r].split(",");
    const iso = (cells[iISO] || "").trim().toUpperCase();
    if (!iso) continue;
    names[iso] = (cells[iName] || iso).trim();
    const vals = {};
    for (const code of WATCH_INDICATORS) {
      const ci = headers.indexOf(code);
      if (ci >= 0 && cells[ci] !== undefined && cells[ci] !== "") {
        const v = parseFloat(cells[ci]);
        if (!Number.isNaN(v)) vals[code] = v;
      }
    }
    current[iso] = vals;
  }
  return { current, names };
}

function findBreaches(current, prior, names, threshold) {
  const out = [];
  for (const iso of Object.keys(current)) {
    if (!MONITOR.has(iso)) continue;
    const prev = prior[iso] || {};
    for (const code of Object.keys(current[iso])) {
      const now = current[iso][code];
      const was = prev[code];
      if (was === undefined || was === null) continue;
      const delta = now - was;
      if (Math.abs(delta) >= threshold) {
        out.push({ iso, country: names[iso] || iso, indicator: code, was, now, delta });
      }
    }
  }
  return out;
}

function formatLine(b, siteBase) {
  const arrow = b.delta < 0 ? "▼" : "▲";
  const sign = b.delta < 0 ? "" : "+";
  const sep = siteBase.includes("?") ? "&" : "?";
  const link = `${siteBase}${sep}c=${b.iso}`;
  return `${arrow} *${b.country}* — \`${b.indicator}\` ${b.was.toFixed(2)} → ${b.now.toFixed(2)} (${sign}${b.delta.toFixed(2)}) | <${link}|dashboard>`;
}

// ---- Toronto time helpers (no external deps) ----
function torontoParts() {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto", hour: "2-digit", hour12: false,
    year: "numeric", month: "short", day: "2-digit", weekday: "short",
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date()).map(x => [x.type, x.value]));
  return p;
}
function isNineAmToronto() {
  return parseInt(torontoParts().hour, 10) === 9;
}
function todayToronto() {
  const p = torontoParts();
  return `${p.weekday} ${p.day} ${p.month} ${p.year}`;
}
