#!/usr/bin/env node
/* =====================================================
   update-scores.mjs
   Fetches scores from ESPN's public World Cup scoreboard
   and writes them to scores.json, keyed by the match IDs
   in js/data.js. Finals are stored as [home, away]; games
   still in progress are stored as { score, live, asOf, clock }
   snapshots that the site labels with their fetch time. Run by GitHub Actions
   on a schedule; safe to run locally too:
     node scripts/update-scores.mjs
   ===================================================== */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ESPN = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";

/* ---------- load the schedule straight from js/data.js (no duplication) ---------- */
export function loadData() {
  const code = readFileSync(join(ROOT, "js/data.js"), "utf8");
  return new Function(`${code}; return { MATCHES, TEAMS };`)();
}

/* ---------- team-name matching ---------- */
const strip = (s) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "");

/* ESPN / FIFA names that differ from ours */
const ALIASES = {
  USA: ["usa", "unitedstates", "us"],
  KOR: ["southkorea", "korearepublic", "kor"],
  CZE: ["czechia", "czechrepublic"],
  TUR: ["turkiye", "turkey"],
  BIH: ["bosniaandherzegovina", "bosniaherzegovina", "bosnia"],
  CIV: ["ivorycoast", "cotedivoire"],
  COD: ["drcongo", "congodr", "democraticrepublicofthecongo", "drcongokinshasa"],
  CPV: ["capeverde", "caboverde"],
  CUW: ["curacao"],
  IRN: ["iran", "iriran", "islamicrepublicofiran"],
  NED: ["netherlands", "holland"],
  RSA: ["southafrica"],
  KSA: ["saudiarabia"],
  UZB: ["uzbekistan"],
  SCO: ["scotland"],
  ENG: ["england"],
};

export function buildNameMap(TEAMS) {
  const map = {};
  for (const [code, t] of Object.entries(TEAMS)) map[strip(t.name)] = code;
  for (const [code, names] of Object.entries(ALIASES)) for (const n of names) map[n] = code;
  return map;
}

/* ---------- map ESPN events onto our match IDs ---------- */
export function mapEvents(events, MATCHES, nameMap) {
  const found = {};
  for (const ev of events || []) {
    const comp = ev.competitions?.[0];
    if (!comp) continue;
    const status = comp.status ?? ev.status ?? {};
    const finished = status.type?.completed === true;
    const inProgress = !finished && status.type?.state === "in";
    if (!finished && !inProgress) continue; // skip games that haven't kicked off

    const sides = comp.competitors || [];
    const home = sides.find((c) => c.homeAway === "home");
    const away = sides.find((c) => c.homeAway === "away");
    if (!home || !away) continue;

    const codeOf = (c) =>
      nameMap[strip(c.team?.displayName || "")] ??
      nameMap[strip(c.team?.shortDisplayName || "")] ??
      nameMap[strip(c.team?.name || "")];
    const hCode = codeOf(home), aCode = codeOf(away);
    if (!hCode || !aCode) {
      console.warn(`  ? couldn't map teams: ${home.team?.displayName} vs ${away.team?.displayName}`);
      continue;
    }

    // find our match: same pair (either order), kickoff within 36h of ESPN's date
    const evDate = new Date(ev.date || comp.date);
    const match = MATCHES.find(
      (m) =>
        ((m.home === hCode && m.away === aCode) || (m.home === aCode && m.away === hCode)) &&
        Math.abs(new Date(m.t) - evDate) < 36 * 3600 * 1000
    );
    if (!match) continue;

    const hGoals = parseInt(home.score, 10);
    const aGoals = parseInt(away.score, 10);
    if (Number.isNaN(hGoals) || Number.isNaN(aGoals)) continue;

    // store in OUR home/away order
    const pair = match.home === hCode ? [hGoals, aGoals] : [aGoals, hGoals];
    if (finished) {
      found[match.id] = pair;
      console.log(`  ✓ FINAL match ${match.id}: ${match.home} ${pair[0]}–${pair[1]} ${match.away}`);
    } else {
      found[match.id] = {
        score: pair,
        live: true,
        asOf: new Date().toISOString(),
        clock: status.displayClock || null, // e.g. "67'"
      };
      console.log(`  ● LIVE match ${match.id}: ${match.home} ${pair[0]}–${pair[1]} ${match.away} (${status.displayClock || "in progress"})`);
    }
  }
  return found;
}

/* ---------- main ---------- */
async function main() {
  const { MATCHES, TEAMS } = loadData();
  const nameMap = buildNameMap(TEAMS);

  const outPath = join(ROOT, "scores.json");
  const existing = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : {};

  // which dates still need scores? (kickoff in the past, no score in data.js or scores.json)
  const now = Date.now();
  const etDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  });
  const pendingDates = [
    ...new Set(
      MATCHES.filter(
        (m) =>
          new Date(m.t).getTime() < now &&
          !Array.isArray(m.score) &&
          !Array.isArray(existing[m.id]) // no entry, or just a live snapshot -> keep checking
      ).flatMap((m) => {
        const d = new Date(m.t);
        // ESPN groups games by calendar date; a late-ET kickoff falls on the
        // next UTC date, so check both interpretations of the kickoff day
        return [
          d.toISOString().slice(0, 10).replaceAll("-", ""),
          etDate.format(d).replaceAll("-", ""),
        ];
      })
    ),
  ].slice(0, 12); // stay polite: at most 12 scoreboard requests per run

  if (!pendingDates.length) {
    console.log("Nothing pending — all played matches already have scores.");
    return;
  }

  console.log(`Checking ${pendingDates.length} date(s): ${pendingDates.join(", ")}`);
  const updates = {};
  for (const yyyymmdd of pendingDates) {
    try {
      const res = await fetch(`${ESPN}?dates=${yyyymmdd}`, {
        headers: { "User-Agent": "wc26-schedule-site score sync" },
      });
      if (!res.ok) {
        console.warn(`  ! ESPN returned ${res.status} for ${yyyymmdd}`);
        continue;
      }
      const data = await res.json();
      Object.assign(updates, mapEvents(data.events, MATCHES, nameMap));
    } catch (err) {
      console.warn(`  ! fetch failed for ${yyyymmdd}: ${err.message}`);
    }
  }

  const merged = { ...existing, ...updates };
  if (JSON.stringify(merged) === JSON.stringify(existing)) {
    console.log("No new final scores found.");
    return;
  }
  writeFileSync(outPath, JSON.stringify(merged, null, 2) + "\n");
  console.log(`Wrote ${Object.keys(updates).length} update(s) to scores.json`);
}

// run only when executed directly (not when imported by tests)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
