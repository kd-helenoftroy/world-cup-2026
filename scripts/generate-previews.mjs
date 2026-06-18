#!/usr/bin/env node
/**
 * Generates 3-bullet pre-match previews for upcoming group-stage matches
 * using ESPN recent form + Claude. Saves to previews.json.
 * Skips matches that already have a preview. Pass --force to regenerate all.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) { console.warn('ANTHROPIC_API_KEY not set — skipping preview generation.'); process.exit(0); }

const FORCE = process.argv.includes('--force');
const REFRESH_WINDOW_MS = 72 * 3600 * 1000; // always regenerate previews for matches within 72h
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

/* ---- parse rosters from data.js ---- */
const rosters = {};
const rosterBlockRe = /([A-Z]{2,3}): \[\s*([\s\S]*?)(?=\n  [A-Z]{2,3}: \[|\n\};)/g;
let rb;
while ((rb = rosterBlockRe.exec(dataJs)) !== null) {
  const code = rb[1];
  const block = rb[2];
  const players = [];
  const playerRe = /\["([^"]+)",\s*"([^"]+)",\s*"([^"]+)",\s*(\d+)\]/g;
  let p;
  while ((p = playerRe.exec(block)) !== null) {
    players.push(`${p[1]} (${p[2]}, ${p[3]})`);
  }
  if (players.length) rosters[code] = players;
}

/* ---- load existing state ---- */
const previews = existsSync('./previews.json') ? JSON.parse(readFileSync('./previews.json', 'utf8')) : {};

const now = Date.now();
const upcoming = matches.filter(m =>
  new Date(m.t).getTime() > now - 3_600_000
);

const toGenerate = upcoming.filter(m => {
  if (FORCE || !previews[m.id]) return true;
  // always refresh previews for matches happening within the next 72 hours
  const kickoff = new Date(m.t).getTime();
  return kickoff - now < REFRESH_WINDOW_MS;
});
console.log(`${upcoming.length} upcoming matches · ${toGenerate.length} need previews`);

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
    const events = (td.events || []).slice(-5).reverse().map(e =>
      `${e.gameResult || '?'} ${e.score} vs ${e.opponent?.displayName || '?'}`
    ).join(', ');
    if (events) formLines += `${td.team.displayName}: ${events}\n`;
  }

  const homePlayers = (rosters[match.home] || []).slice(0, 6).join(', ');
  const awayPlayers = (rosters[match.away] || []).slice(0, 6).join(', ');

  const prompt = `Write a short pre-match preview for World Cup 2026: ${home} vs ${away} (${match.stage}).

Recent form:
${formLines || '(not available)'}

${home} squad (use ONLY these names): ${homePlayers || '(not available)'}
${away} squad (use ONLY these names): ${awayPlayers || '(not available)'}

Output exactly these 3 bullet lines and nothing else:
- **Key players to watch:** [2 sentences — name specific players from the lists above, one or two from each side]
- **Coming in hot:** [1-2 sentences — use the recent form data above, be specific about results]
- **The storyline:** [2 sentences — the key narrative, drama, or stakes going into this match]

Tone: casual and fun, like helping a friend sound like they watched the game. No atmosphere fluff. Only use player names from the squad lists provided. Keep each bullet tight.`;

  return callClaude(prompt);
}

/* ---- process in batches of 4 ---- */
const BATCH = 4;
let generated = 0;

for (let i = 0; i < toGenerate.length; i += BATCH) {
  const batch = toGenerate.slice(i, i + BATCH);
  await Promise.all(batch.map(async (match) => {
    try {
      const espnData = await fetchForm(match.espnId);
      previews[match.id] = await generatePreview(match, espnData);
      generated++;
      console.log(`✓ Match ${match.id}: ${teams[match.home]} vs ${teams[match.away]}`);
    } catch (err) {
      console.error(`✗ Match ${match.id}: ${err.message}`);
    }
  }));
  if (i + BATCH < toGenerate.length) await new Promise(r => setTimeout(r, 800));
}

writeFileSync('./previews.json', JSON.stringify(previews, null, 2));
console.log(`Done. Generated ${generated} new previews. Total: ${Object.keys(previews).length}`);
