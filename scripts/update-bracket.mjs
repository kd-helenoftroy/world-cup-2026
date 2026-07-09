#!/usr/bin/env node
/**
 * update-bracket.mjs
 *
 * Fetches ESPN results for completed KO matches and updates js/data.js:
 *   1. Adds score (+ penalty shootout) to completed KO matches
 *   2. Populates home/away for next-round KO matches based on who advanced
 *
 * Run locally:  node scripts/update-bracket.mjs
 * In CI:        runs before generate-previews so previews stay current
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT      = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_PATH = join(ROOT, 'js/data.js');
const ESPN      = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary';

/* ── Bracket progression ──────────────────────────────────────────────
   [feeder_id, target_id, slot ('home'|'away'), type? ('loser' for 3rd)]
   Derived from the comments at the top of KNOCKOUTS in data.js.        */
const BRACKET = [
  // R32 → R16
  [75, 89, 'home'], [78, 89, 'away'],
  [73, 90, 'home'], [76, 90, 'away'],
  [84, 93, 'home'], [83, 93, 'away'],
  [82, 94, 'home'], [81, 94, 'away'],
  [74, 91, 'home'], [77, 91, 'away'],
  [79, 92, 'home'], [80, 92, 'away'],
  [87, 95, 'home'], [86, 95, 'away'],
  [85, 96, 'home'], [88, 96, 'away'],
  // R16 → QF
  [89, 97, 'home'], [90, 97, 'away'],
  [93, 98, 'home'], [94, 98, 'away'],
  [91, 99, 'home'], [92, 99, 'away'],
  [95, 100, 'home'], [96, 100, 'away'],
  // QF → SF
  [97, 101, 'home'], [98, 101, 'away'],
  [99, 102, 'home'], [100, 102, 'away'],
  // SF → Final + 3rd place
  [101, 104, 'home'], [102, 104, 'away'],
  [101, 103, 'home', 'loser'], [102, 103, 'away', 'loser'],
];

/* ── Parse KNOCKOUTS out of data.js source ────────────────────────── */
function parseKnockouts(src) {
  const out = [];
  for (const line of src.split('\n')) {
    const id     = line.match(/\bid:\s*(\d+)/)?.[1];
    const stage  = line.match(/\bstage:\s*"([^"]+)"/)?.[1];
    if (!id || !stage || stage.startsWith('Group')) continue;

    const espnId = line.match(/\bespnId:\s*(\d+)/)?.[1];
    const t      = line.match(/\bt:\s*"([^"]+)"/)?.[1];
    const home   = line.match(/\bhome:\s*"([A-Z]+)"/)?.[1] ?? null;
    const away   = line.match(/\baway:\s*"([A-Z]+)"/)?.[1] ?? null;
    const sM     = line.match(/\bscore:\s*\[(\d+),\s*(\d+)\]/);
    const pM     = line.match(/\bpens:\s*\[(\d+),\s*(\d+)\]/);

    out.push({
      id:     +id,
      espnId: espnId ? +espnId : null,
      stage, t,
      home,  away,
      score: sM ? [+sM[1], +sM[2]] : null,
      pens:  pM ? [+pM[1], +pM[2]] : null,
    });
  }
  return out;
}

/* ── Determine winner / loser of a match ─────────────────────────── */
function winner(m) {
  if (!m.score) return null;
  const [h, a] = m.score;
  if (h !== a) return h > a ? m.home : m.away;
  if (m.pens)  return m.pens[0] > m.pens[1] ? m.home : m.away;
  return null;
}
function loser(m) {
  const w = winner(m);
  if (!w) return null;
  return w === m.home ? m.away : m.home;
}

/* ── ESPN fetch ───────────────────────────────────────────────────── */
async function fetchResult(espnId) {
  try {
    const res = await fetch(`${ESPN}?event=${espnId}`, {
      headers: { 'User-Agent': 'wc26-bracket-bot' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const comp = data.header?.competitions?.[0];
    if (!comp?.status?.type?.completed) return null;

    const homeC = comp.competitors?.find(c => c.homeAway === 'home');
    const awayC = comp.competitors?.find(c => c.homeAway === 'away');
    if (!homeC || !awayC) return null;

    const hScore = parseInt(homeC.score ?? '0', 10);
    const aScore = parseInt(awayC.score ?? '0', 10);
    if (isNaN(hScore) || isNaN(aScore)) return null;

    // Penalty detection: 5th linescore period = shootout
    let pens = null;
    const hLs = homeC.linescores ?? [];
    const aLs = awayC.linescores ?? [];
    if (hLs.length >= 5 && aLs.length >= 5) {
      const hp = parseInt(hLs[4].value, 10);
      const ap = parseInt(aLs[4].value, 10);
      if (!isNaN(hp) && !isNaN(ap)) pens = [hp, ap];
    }
    // Fallback: status name contains "PEN"
    if (!pens && comp.status?.type?.name?.includes('PEN')) {
      console.warn(`  ⚠ id ${espnId} ended in penalties but couldn't parse pen scores — add manually`);
    }

    return { hScore, aScore, pens };
  } catch (e) {
    console.warn(`  ! ESPN fetch failed for ${espnId}: ${e.message}`);
    return null;
  }
}

/* ── data.js string patching ─────────────────────────────────────── */

// Add score (and pens) to a KO match line that already has home/away
function patchScore(src, id, score, pens) {
  const addStr = `, score: [${score[0]}, ${score[1]}]` +
    (pens ? `, pens: [${pens[0]}, ${pens[1]}]` : '');
  // Match the line by id and insert before the closing }
  const re = new RegExp(
    `(\\{ id:\\s*${id},[^\\n]*?venue:\\s*"[^"]+")( \\})`,
  );
  const next = src.replace(re, `$1${addStr}$2`);
  if (next === src) console.warn(`  ⚠ Could not patch score for id ${id}`);
  return next;
}

// Add home/away to a KO match line that doesn't have them yet
function patchTeams(src, id, home, away) {
  // Insert before `venue:` (works for lines with or without label/espnId)
  const re = new RegExp(
    `(\\{ id:\\s*${id},[^\\n]*?)(venue:\\s*"[^"]+")`,
  );
  const next = src.replace(re, `$1home: "${home}", away: "${away}", $2`);
  if (next === src) console.warn(`  ⚠ Could not patch teams for id ${id}`);
  return next;
}

/* ── Main ─────────────────────────────────────────────────────────── */
async function main() {
  let src = readFileSync(DATA_PATH, 'utf8');
  const kos   = parseKnockouts(src);
  const byId  = Object.fromEntries(kos.map(m => [m.id, m]));
  let changed = false;

  /* Pass 1: fetch scores for KO matches with teams but no score yet */
  for (const m of kos) {
    if (m.score !== null)         continue; // already scored
    if (!m.home || !m.away)       continue; // teams unknown — can't match ESPN
    if (!m.espnId)                continue; // SF/Final without espnId yet
    if (m.t && new Date(m.t).getTime() > Date.now() + 2 * 3600 * 1000) continue; // kickoff >2h away

    const result = await fetchResult(m.espnId);
    if (!result) continue;

    const { hScore, aScore, pens } = result;
    console.log(`✓ score  id ${m.id} (${m.home} ${hScore}-${aScore} ${m.away})${pens ? ` pens ${pens[0]}-${pens[1]}` : ''}`);
    src = patchScore(src, m.id, [hScore, aScore], pens);
    m.score = [hScore, aScore];
    m.pens  = pens;
    changed = true;
  }

  /* Pass 2: propagate bracket — set home/away for next-round matches */
  for (const [feederId, targetId, slot, type] of BRACKET) {
    const feeder = byId[feederId];
    const target = byId[targetId];
    if (!feeder?.score)       continue; // feeder not finished
    if (target?.[slot])       continue; // already set

    const team = type === 'loser' ? loser(feeder) : winner(feeder);
    if (!team) continue;

    // Accumulate into in-memory object; only write to file when both slots known
    target[slot] = team;
    const other  = slot === 'home' ? 'away' : 'home';

    if (target[other]) {
      const h = slot === 'home' ? team : target[other];
      const a = slot === 'away' ? team : target[other];
      console.log(`✓ teams  id ${targetId}: ${h} vs ${a}`);
      src = patchTeams(src, targetId, h, a);
      changed = true;
    } else {
      console.log(`  ⏳ waiting id ${targetId} ${slot}=${team} (other slot TBD)`);
    }
  }

  if (changed) {
    writeFileSync(DATA_PATH, src);
    console.log('\ndata.js updated ✓');
  } else {
    console.log('No changes needed.');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
