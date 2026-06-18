/**
 * Fetch ESPN player IDs for all roster players.
 * Saves results to player-photos.json keyed by player name.
 * Run: node scripts/fetch-player-photos.mjs
 * Add --force to re-fetch all (default: skip already found)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createRequire } from 'module';
import { setTimeout as sleep } from 'timers/promises';

const force = process.argv.includes('--force');
const OUT = 'player-photos.json';

// Load existing results
const existing = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};

// Extract ROSTERS from data.js
const dataSrc = readFileSync('js/data.js', 'utf8');
const rostersMatch = dataSrc.match(/const ROSTERS\s*=\s*(\{[\s\S]*?\n\})\s*;/);
if (!rostersMatch) { console.error('Could not find ROSTERS in data.js'); process.exit(1); }
const rosters = eval('(' + rostersMatch[1] + ')');

// Collect all unique player names
const allPlayers = new Set();
for (const players of Object.values(rosters)) {
  for (const [name] of players) allPlayers.add(name);
}

const toFetch = force
  ? [...allPlayers]
  : [...allPlayers].filter(name => !(name in existing));

console.log(`Total players: ${allPlayers.size} | To fetch: ${toFetch.length} | Already found: ${allPlayers.size - toFetch.length}`);

async function searchESPN(name) {
  const url = `https://site.api.espn.com/apis/search/v2?query=${encodeURIComponent(name)}&sport=soccer&limit=5`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = await res.json();
  const hits = json.results?.[0]?.contents || [];
  const players = hits.filter(h => h.type === 'player');
  if (!players.length) return null;

  // Pick best match: prefer exact name match, then first result
  const normalize = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const target = normalize(name);
  const exact = players.find(p => normalize(p.displayName) === target);
  const best = exact || players[0];

  // Extract numeric ID from uid (s:600~a:12345) or image URL
  const imgMatch = best.image?.default?.match(/\/(\d+)\.png$/);
  const uidMatch = best.uid?.match(/a:(\d+)/);
  const id = imgMatch?.[1] || uidMatch?.[1];
  if (!id) return null;
  return { id, name: best.displayName };
}

let found = 0, notFound = 0;

for (let i = 0; i < toFetch.length; i++) {
  const name = toFetch[i];
  try {
    const result = await searchESPN(name);
    if (result) {
      existing[name] = result.id;
      found++;
      process.stdout.write(`  ✓ [${i+1}/${toFetch.length}] ${name} → ${result.id}\n`);
    } else {
      existing[name] = null;
      notFound++;
      process.stdout.write(`  ✗ [${i+1}/${toFetch.length}] ${name} — not found\n`);
    }
  } catch (e) {
    existing[name] = null;
    notFound++;
    process.stdout.write(`  ! [${i+1}/${toFetch.length}] ${name} — error: ${e.message}\n`);
  }

  // Save after every 10 players in case of interruption
  if ((i + 1) % 10 === 0) writeFileSync(OUT, JSON.stringify(existing, null, 2));

  // Gentle rate limiting
  await sleep(120);
}

writeFileSync(OUT, JSON.stringify(existing, null, 2));

const total = Object.keys(existing).length;
const withPhoto = Object.values(existing).filter(Boolean).length;
console.log(`\nDone. ${found} new found, ${notFound} not found.`);
console.log(`Total in ${OUT}: ${withPhoto}/${total} players have photos.`);
