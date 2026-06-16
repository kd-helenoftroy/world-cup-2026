#!/usr/bin/env node
/**
 * Generates 3-bullet pre-match previews for upcoming group-stage matches
 * using ESPN recent form + Claude. Saves to previews.json.
 * Skips matches that already have a preview. Safe to re-run.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) { console.error('ANTHROPIC_API_KEY not set'); process.exit(1); }

const ESPN_SUMMARY = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary';

/* ---- parse data.js ---- */
const dataJs = readFileSync('./js/data.js', 'utf8');

const teams = {};
const teamRe = /([A-Z]{2,3}):\s*\{\s*name:\s*"([^"]+)"/g;
let tm;
while ((tm = teamRe.exec(dataJs)) !== null) teams[tm[1]] = tm[2];

const matches = [];
const matchRe = /\{ id:\s*(\d+),\s+espnId:\s*(\d+),\s+stage:\s*"([^"]+)",\s+t:\s*"([^"]+)",\s+home:\s*"([A-Z]+)",\s+away:\s*"([A-Z]+)"/g;
let mm;
while ((mm = matchRe.exec(dataJs)) !== null) {
  matches.push({ id: +mm[1], espnId: +mm[2], stage: mm[3], t: mm[4], home: mm[5], away: mm[6] });
}

/* ---- load existing state ---- */
const scores  = existsSync('./scores.json')   ? JSON.parse(readFileSync('./scores.json',   'utf8')) : {};
const previews = existsSync('./previews.json') ? JSON.parse(readFileSync('./previews.json', 'utf8')) : {};

const now = Date.now();
const upcoming = matches.filter(m =>
  !scores[m.id] &&                         // not yet completed
  new Date(m.t).getTime() > now - 3_600_000 // not more than 1hr in the past
);

console.log(`${upcoming.length} upcoming matches · ${upcoming.filter(m => !previews[m.id]).length} need previews`);

/* ---- ESPN fetch ---- */
async function fetchForm(espnId) {
  try {
    const res = await fetch(`${ESPN_SUMMARY}?event=${espnId}`);
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

/* ---- Claude call ---- */
async function callClaude(prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 380,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${await res.text()}`);
  const d = await res.json();
  return d.content[0].text.trim();
}

/* ---- build preview ---- */
async function generatePreview(match, espnData) {
  const home = teams[match.home] || match.home;
  const away = teams[match.away] || match.away;

  let formLines = '';
  for (const td of espnData?.lastFiveGames || []) {
    const events = (td.events || []).slice(0, 3).map(e =>
      `${e.result} ${e.score} vs ${e.opponent?.displayName || '?'}`
    ).join(', ');
    if (events) formLines += `${td.team.displayName}: ${events}\n`;
  }

  const prompt = `Write a short pre-match preview for World Cup 2026: ${home} vs ${away} (${match.stage}).

Recent form:
${formLines || '(not available)'}

Output exactly these 3 bullet lines and nothing else:
- **Key players to watch:** [2 sentences — name the most exciting players from each side]
- **Coming in hot:** [1-2 sentences — use the recent form data above, be specific]
- **The storyline:** [2 sentences — the key narrative, drama, or stakes going into this match]

Tone: casual and fun, like helping a friend sound like they watched the game. No atmosphere fluff (no "sea of fans", "passionate crowd" etc.). Name actual players. Keep each bullet tight.`;

  return callClaude(prompt);
}

/* ---- process in batches of 4 ---- */
const BATCH = 4;
let generated = 0;

for (let i = 0; i < upcoming.length; i += BATCH) {
  const batch = upcoming.slice(i, i + BATCH);
  await Promise.all(batch.map(async (match) => {
    if (previews[match.id]) return; // already done
    try {
      const espnData = await fetchForm(match.espnId);
      previews[match.id] = await generatePreview(match, espnData);
      generated++;
      console.log(`✓ Match ${match.id}: ${teams[match.home]} vs ${teams[match.away]}`);
    } catch (err) {
      console.error(`✗ Match ${match.id}: ${err.message}`);
    }
  }));
  if (i + BATCH < upcoming.length) await new Promise(r => setTimeout(r, 800));
}

writeFileSync('./previews.json', JSON.stringify(previews, null, 2));
console.log(`Done. Generated ${generated} new previews. Total: ${Object.keys(previews).length}`);
