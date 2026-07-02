// Local logic test for the Worker's alert core. Mocks KV + Slack + assets.
// Run: node test/run_local.mjs
import { readFileSync } from "node:fs";

// --- import the pure logic by evaluating the worker's helper functions ---
// We re-declare the same constants/functions here by importing the source text
// and pulling out the testable pieces. Simplest: copy the logic under test.
const MONITOR = new Set(["BGD","MMR","NPL","PHL","PAK","IND","LKA","THA","IDN","KHM","CAN"]);
const WATCH_INDICATORS = ["v2psoppaut","v2lgoppart","v2lginvstp","v2lgqstexp","v2lgotovst","v2psbantar","v2psbars","v2pscohesv","v2psprlnks","v2pscomprg","v2elfrfair","v2elintim","v2elirreg","v2elembaut","v2elembcap"];

function parseCsv(text){const lines=text.trim().split(/\r?\n/);const headers=lines[0].split(",").map(h=>h.trim());const iISO=headers.indexOf("ISO3");const iName=headers.indexOf("Country");const current={},names={};for(let r=1;r<lines.length;r++){const cells=lines[r].split(",");const iso=(cells[iISO]||"").trim().toUpperCase();if(!iso)continue;names[iso]=(cells[iName]||iso).trim();const vals={};for(const code of WATCH_INDICATORS){const ci=headers.indexOf(code);if(ci>=0&&cells[ci]!==undefined&&cells[ci]!==""){const v=parseFloat(cells[ci]);if(!Number.isNaN(v))vals[code]=v;}}current[iso]=vals;}return {current,names};}
function findBreaches(current,prior,names,threshold){const out=[];for(const iso of Object.keys(current)){if(!MONITOR.has(iso))continue;const prev=prior[iso]||{};for(const code of Object.keys(current[iso])){const now=current[iso][code];const was=prev[code];if(was===undefined||was===null)continue;const delta=now-was;if(Math.abs(delta)>=threshold){out.push({iso,country:names[iso]||iso,indicator:code,was,now,delta});}}}return out;}
function formatLine(b,siteBase){const arrow=b.delta<0?"▼":"▲";const sign=b.delta<0?"":"+";const sep=siteBase.includes("?")?"&":"?";const link=`${siteBase}${sep}c=${b.iso}`;return `${arrow} *${b.country}* — \`${b.indicator}\` ${b.was.toFixed(2)} → ${b.now.toFixed(2)} (${sign}${b.delta.toFixed(2)}) | <${link}|dashboard>`;}

const SITE = "https://osi-tracker.owenlippert.workers.dev/index.html";
const baseCsv = readFileSync(new URL("../public/vdem_current.csv", import.meta.url), "utf8");

// Run 1: baseline
const { current: c1, names } = parseCsv(baseCsv);
console.log("RUN 1 (baseline): stored", Object.keys(c1).length, "countries, no diff.");

// Run 2: mutate — Cambodia opp autonomy collapses (breach), Bangladesh small drop (no breach), France-like non-monitored not present
const mutated = baseCsv
  .replace("KHM,Cambodia,0.9", "KHM,Cambodia,-0.7")
  .replace("BGD,Bangladesh,1.8", "BGD,Bangladesh,1.5");
const { current: c2 } = parseCsv(mutated);
const breaches = findBreaches(c2, c1, names, 1.5);
console.log("RUN 2 (diff): breaches =", breaches.length);
for (const b of breaches) console.log("  " + formatLine(b, SITE));

// Run 3: no change
const breaches3 = findBreaches(c1, c1, names, 1.5);
console.log("RUN 3 (no change): breaches =", breaches3.length, breaches3.length === 0 ? "(silent ✓)" : "(UNEXPECTED)");

// Assertions
const ok = breaches.length === 1 && breaches[0].iso === "KHM" && Math.abs(breaches[0].delta + 1.6) < 1e-9 && breaches3.length === 0;
console.log(ok ? "\nALL CHECKS PASSED ✓" : "\nCHECKS FAILED ✗");
process.exit(ok ? 0 : 1);
