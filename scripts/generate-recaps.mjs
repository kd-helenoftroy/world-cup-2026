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

const allMatches = [];
const matchRe = /\{ id:\s*(\d+),\s+espnId:\s*(\d+),\s+stage:\s*"([^"]+)",\s+t:\s*"([^"]+)",\s+home:\s*"([A-Z]+)",\s+away:\s*"([A-Z]+)"/g;
let mm;
while ((mm = matchRe.exec(dataJs)) !== null) {
  allMatches.push({ id: +mm[1], espnId: +mm[2], stage: mm[3], t: mm[4], home: mm[5], away: mm[6] });
}

const now = Date.now();
// matches that kicked off more than 2 hours ago are likely finished
const matches = allMatches.filter(m => new Date(m.t).getTime() < now - 2 * 3600 * 1000);

console.log(`Found ${matches.length} likely completed matches`);

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

    // extract score from ESPN event competitors
    let score = null;
    const comps = data?.header?.competitions?.[0]?.competitors;
    if (comps) {
      const home = comps.find(c => c.homeAway === 'home');
      const away = comps.find(c => c.homeAway === 'away');
      if (home && away) score = [parseInt(home.score), parseInt(away.score)];
    }

    const html = data?.article?.story || '';
    const article = html.replace(/<[^>]+>/g, '').replace(/^[A-Z][A-Z,\s]+--\s*/, '').trim();
    return { article, score };
  } catch { return { article: null, score: null }; }
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
async function generateRecap(match, { article, score }) {
  const home = teams[match.home] || match.home;
  const away = teams[match.away] || match.away;
  const result = score
    ? (score[0] > score[1] ? `${home} won ${score[0]}–${score[1]}` : score[0] < score[1] ? `${away} won ${score[1]}–${score[0]}` : `${home} and ${away} drew ${score[0]}–${score[1]}`)
    : `${home} vs ${away} (final score unavailable)`;

  const prompt = `You write casual match recaps as short talking points — the kind of thing you'd skim before chatting about the game with a friend.

Match: ${home} vs ${away} (${result})
${article ? `Article:\n${article.slice(0, 1200)}` : '(no article available)'}

Output exactly 3 bullet points using this format (a dash then a space, then the point):
- [talking point]
- [talking point]
- [talking point]

Each point should be one short casual sentence. Cover: who scored or what the key moment was, something interesting or dramatic that happened, and one takeaway about what it means or how it felt. No fluff, no "both teams played hard." Casual tone — like you're texting a friend.`;

  return callClaude(prompt);
}

/* ---- process in batches of 4 ---- */
const BATCH = 4;
let generated = 0;

for (let i = 0; i < toGenerate.length; i += BATCH) {
  const batch = toGenerate.slice(i, i + BATCH);
  await Promise.all(batch.map(async (match) => {
    try {
      const espnData = await fetchArticle(match.espnId);
      if (!espnData.article && !espnData.score) { console.log(`⚠ ${match.espnId}: no ESPN data, skipping`); return; }
      recaps[match.espnId] = await generateRecap(match, espnData);
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
