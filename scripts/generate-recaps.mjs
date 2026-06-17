#!/usr/bin/env node
/**
 * Generates funny "office water cooler" match recaps for completed matches
 * using ESPN article text + Claude. Saves to recaps.json.
 * Skips matches that already have a recap. Pass --force to regenerate all.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) { console.warn('ANTHROPIC_API_KEY not set — skipping recap generation.'); process.exit(0); }

const FORCE = process.argv.includes('--force');
const ESPN_SUMMARY = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary';

/* ---- parse data.js ---- */
const dataJs = readFileSync('./js/data.js', 'utf8');

const teams = {};
const teamRe = /([A-Z]{2,3}):\s*\{\s*name:\s*"([^"]+)"/g;
let tm;
while ((tm = teamRe.exec(dataJs)) !== null) teams[tm[1]] = tm[2];

const matches = [];
const matchRe = /\{ id:\s*(\d+),\s+espnId:\s*(\d+),\s+stage:\s*"([^"]+)",\s+t:\s*"([^"]+)",\s+home:\s*"([A-Z]+)",\s+away:\s*"([A-Z]+)"[^}]*score:\s*\[(\d+),\s*(\d+)\]/g;
let mm;
while ((mm = matchRe.exec(dataJs)) !== null) {
  matches.push({
    id: +mm[1], espnId: +mm[2], stage: mm[3], t: mm[4],
    home: mm[5], away: mm[6], score: [+mm[7], +mm[8]],
  });
}

console.log(`Found ${matches.length} completed matches`);

/* ---- load existing recaps ---- */
const recaps = existsSync('./recaps.json') ? JSON.parse(readFileSync('./recaps.json', 'utf8')) : {};

const toGenerate = FORCE
  ? matches
  : matches.filter(m => !recaps[m.espnId]);

console.log(`${matches.length} completed · ${toGenerate.length} need recaps`);

/* ---- ESPN fetch ---- */
async function fetchArticle(espnId) {
  try {
    const res = await fetch(`${ESPN_SUMMARY}?event=${espnId}`);
    if (!res.ok) return null;
    const data = await res.json();
    const html = data?.article?.story || '';
    return html.replace(/<[^>]+>/g, '').replace(/^[A-Z][A-Z,\s]+--\s*/, '').trim();
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
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${await res.text()}`);
  const d = await res.json();
  return d.content[0].text.trim();
}

/* ---- generate recap ---- */
async function generateRecap(match, article) {
  const home = teams[match.home] || match.home;
  const away = teams[match.away] || match.away;
  const [hg, ag] = match.score;
  const result = hg > ag ? `${home} won ${hg}–${ag}` : hg < ag ? `${away} won ${ag}–${hg}` : `${home} and ${away} drew ${hg}–${ag}`;

  const prompt = `You write hilariously casual World Cup match recaps — like a group chat message from your funniest friend who actually watched the game.

Match: ${home} vs ${away} (${result})
${article ? `Article:\n${article.slice(0, 1200)}` : '(no article available)'}

Write exactly 2 sentences. Rules: be specific about what happened (name the goals, the drama, the chaos). Use casual language — contractions, slang, rhetorical questions, hyperbole are all fair game. Make it sound like something you'd text a friend, not a press release. No opener like "In an exciting match..." or "Both teams..." — just dive straight into the juicy part. If it was a blowout, acknowledge the carnage. If it was a draw, make it sound appropriately chaotic or boring depending on what happened.`;

  return callClaude(prompt);
}

/* ---- process in batches of 4 ---- */
const BATCH = 4;
let generated = 0;

for (let i = 0; i < toGenerate.length; i += BATCH) {
  const batch = toGenerate.slice(i, i + BATCH);
  await Promise.all(batch.map(async (match) => {
    try {
      const article = await fetchArticle(match.espnId);
      recaps[match.espnId] = await generateRecap(match, article);
      generated++;
      const home = teams[match.home] || match.home;
      const away = teams[match.away] || match.away;
      console.log(`✓ ${home} vs ${away}: ${recaps[match.espnId]}`);
    } catch (err) {
      console.error(`✗ Match ${match.id} (ESPN ${match.espnId}): ${err.message}`);
    }
  }));
  if (i + BATCH < toGenerate.length) await new Promise(r => setTimeout(r, 800));
}

writeFileSync('./recaps.json', JSON.stringify(recaps, null, 2));
console.log(`Done. Generated ${generated} new recaps. Total: ${Object.keys(recaps).length}`);
