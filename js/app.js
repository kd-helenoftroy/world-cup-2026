/* =====================================================
   WC26 app — renders all six views from data.js
   Everything model-driven re-computes from scores in
   data.js: standings, match notes, live power ratings,
   win-probability bars, and group predictions.
   ===================================================== */

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const ALL_GAMES = [...MATCHES, ...KNOCKOUTS].sort((a, b) => new Date(a.t) - new Date(b.t));
const FLAG = (code, w = 80) => `https://flagcdn.com/w${w}/${code}.png`;
const TEAM_OPT = (selectedFirst = "", placeholder = "") =>
  (placeholder ? `<option value="">${placeholder}</option>` : "") +
  Object.entries(TEAMS)
    .sort((a, b) => a[1].name.localeCompare(b[1].name))
    .map(([c, t]) => `<option value="${c}" ${c === selectedFirst ? "selected" : ""}>${t.name} (#${t.rank})</option>`)
    .join("");

/* ---------- time helpers ---------- */
const fmtTime = (iso, tz) =>
  new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", ...(tz ? { timeZone: tz } : {}) });
const fmtDayLong = (iso) =>
  new Date(iso).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
const dayKey = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const todayKey = () => dayKey(new Date().toISOString());

function relDay(iso) {
  const ms = 86400000;
  const strip = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((strip(new Date(iso)) - strip(new Date())) / ms);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return null;
}

/* =====================================================
   LIVE MODEL — recomputed from scores in data.js
   ===================================================== */
let STANDINGS = {}, RATINGS = {};

/* group standings */
function computeStandings() {
  const S = {};
  Object.keys(TEAMS).forEach((c) => (S[c] = { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }));
  MATCHES.filter((m) => Array.isArray(m.score)).forEach((m) => {
    const [hg, ag] = m.score;
    const H = S[m.home], A = S[m.away];
    H.p++; A.p++; H.gf += hg; H.ga += ag; A.gf += ag; A.ga += hg;
    if (hg > ag) { H.w++; H.pts += 3; A.l++; }
    else if (hg < ag) { A.w++; A.pts += 3; H.l++; }
    else { H.d++; A.d++; H.pts++; A.pts++; }
  });
  return S;
}

/* Elo-style live power ratings: start from base strength, replay every
   result chronologically. Bigger wins (goal difference) move ratings more. */
function computeRatings() {
  const R = {};
  Object.entries(TEAMS).forEach(([c, t]) => (R[c] = t.strength));
  const K = 5;
  MATCHES
    .filter((m) => Array.isArray(m.score))
    .sort((a, b) => new Date(a.t) - new Date(b.t))
    .forEach((m) => {
      const [hg, ag] = m.score;
      const exp = 1 / (1 + Math.pow(10, (R[m.away] - R[m.home]) / 18));
      const res = hg > ag ? 1 : hg < ag ? 0 : 0.5;
      const gd = Math.abs(hg - ag);
      const mult = gd <= 1 ? 1 : gd === 2 ? 1.5 : 1.75 + (gd - 3) * 0.25;
      const delta = K * mult * (res - exp);
      R[m.home] += delta;
      R[m.away] -= delta;
    });
  return R;
}

function refreshModel() {
  STANDINGS = computeStandings();
  RATINGS = computeRatings();
}

function lastResultPhrase(code) {
  const played = MATCHES.filter((m) => Array.isArray(m.score) && (m.home === code || m.away === code));
  if (!played.length) return null;
  const m = played[played.length - 1];
  const isHome = m.home === code;
  const [my, their] = isHome ? m.score : [m.score[1], m.score[0]];
  const opp = TEAMS[isHome ? m.away : m.home].name;
  if (my > their) return `beat ${opp} ${my}–${their}`;
  if (my < their) return `lost ${my}–${their} to ${opp}`;
  return `drew ${my}–${their} with ${opp}`;
}

/* One-line context for each game, generated from live standings. */
function matchNote(m) {
  if (!m.home) {
    if (m.stage === "Final") return `<b>One match for the trophy.</b> 90 minutes, extra time if needed, then penalties — at MetLife in front of 82,500.`;
    if (m.stage === "Round of 32") return `<b>Knockout football begins.</b> Win or go home — top two from each group plus the eight best third-place teams made it here.`;
    return `<b>Single elimination.</b> Win or go home: extra time, then penalties if level.`;
  }
  const g = m.stage.slice(-1);
  const a = STANDINGS[m.home], b = STANDINGS[m.away];

  if (a.p === 0 && b.p === 0)
    return `<b>Matchday 1 in Group ${g}.</b> First points up for grabs — top two advance, and a strong third place can sneak through too.`;

  const phrase = (code, r) => {
    const n = TEAMS[code].name;
    const last = lastResultPhrase(code);
    if (r.p === 1) {
      if (r.pts === 3) return `<b>${n}</b> ${last} — one more win all but books a knockout spot`;
      if (r.pts === 1) return `<b>${n}</b> ${last} and want all three points here`;
      return `<b>${n}</b> ${last} and badly need a result`;
    }
    if (r.p === 2) {
      if (r.pts >= 6) return `<b>${n}</b> have a perfect 6 points — already through in all but name`;
      if (r.pts >= 4) return `<b>${n}</b> sit on ${r.pts} points and a draw likely sends them through`;
      if (r.pts === 3) return `<b>${n}</b> are on 3 points — this one probably decides their tournament`;
      if (r.pts >= 1) return `<b>${n}</b> have just ${r.pts} point${r.pts > 1 ? "s" : ""} and must win to stay alive`;
      return `<b>${n}</b> have lost both — win big or fly home`;
    }
    return `<b>${n}</b>: ${r.w}W-${r.d}D-${r.l}L, ${r.pts} pts`;
  };
  const parts = [];
  if (a.p > 0) parts.push(phrase(m.home, a));
  if (b.p > 0) parts.push(phrase(m.away, b));
  else if (a.p > 0) parts.push(`<b>${TEAMS[m.away].name}</b> open their campaign here`);
  return parts.join(". ") + ".";
}

/* win probabilities from LIVE ratings (not static strength) */
function winProbs(homeCode, awayCode) {
  const a = RATINGS[homeCode], b = RATINGS[awayCode];
  const pRaw = 1 / (1 + Math.pow(10, (b - a) / 18));
  const draw = 0.30 - Math.abs(pRaw - 0.5) * 0.36;
  const h = pRaw * (1 - draw), w = (1 - pRaw) * (1 - draw);
  return { h: Math.round(h * 100), d: Math.round(draw * 100), a: Math.round(w * 100) };
}
const oddsToImplied = (american) => 100 / (parseInt(american.replace("+", ""), 10) + 100);

/* =====================================================
   MATCH PREVIEWS — AI-generated, loaded from previews.json
   ===================================================== */
/* =====================================================
   PLAYER PHOTOS — ESPN headshot IDs loaded from player-photos.json
   ===================================================== */
const PHOTO_CACHE = {};

async function loadPlayerPhotos() {
  try {
    const res = await fetch('player-photos.json', { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    Object.assign(PHOTO_CACHE, data);
  } catch { /* offline / file missing */ }
}

const PREVIEW_CACHE = new Map();

function _renderPreview(text) {
  const bullets = text.split(/\n?-\s+(?=\*\*)/).filter(Boolean);
  return bullets.map(b =>
    `<div class="preview-bullet">${b.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</div>`
  ).join('');
}

async function loadPreviews() {
  try {
    const res = await fetch('previews.json', { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    for (const [id, text] of Object.entries(data)) PREVIEW_CACHE.set(Number(id), text);
  } catch { /* offline / local preview */ }
}

/* =====================================================
   MATCH RECAPS — AI-generated from ESPN article, loaded from recaps.json
   ===================================================== */
const RECAP_CACHE = new Map();

async function loadRecapsJson() {
  try {
    const res = await fetch('recaps.json', { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    for (const [espnId, text] of Object.entries(data)) RECAP_CACHE.set(Number(espnId), text);
  } catch { /* offline / file missing */ }
}

const _FACT_WORDS = ['scored','goal','minute','red card','penalty','header','hat trick','var','saved','equaliz','opener','brace','dismissed','sent off','own goal','volley','free kick','corner','offside','stoppage'];
const _SKIP_WORDS = ['sea of','chanting','fans','iconic','shadow of','playing in front','playing in the','sold-out'];

function _pickBestTwo(storyHTML) {
  const text = storyHTML.replace(/<[^>]+>/g, '');
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.replace(/^[A-Z][A-Z,\s]+--\s*/, '').trim())
    .filter(s => s.length > 30);
  if (!sentences.length) return null;
  const lede = sentences[0];
  const rest = sentences.slice(1);
  if (!rest.length) return lede;
  const scoreS = (s) => {
    const sl = s.toLowerCase();
    if (_SKIP_WORDS.some(w => sl.includes(w))) return -1;
    return _FACT_WORDS.filter(w => sl.includes(w)).length;
  };
  const best = rest.reduce((a, b) => scoreS(b) > scoreS(a) ? b : a, rest[0]);
  return scoreS(best) >= 0 ? `${lede} ${best}` : lede;
}

async function _fetchRecap(espnId) {
  if (RECAP_CACHE.has(espnId)) return RECAP_CACHE.get(espnId);
  // fall back to raw ESPN article if no AI recap exists yet
  try {
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=${espnId}`);
    if (!res.ok) { RECAP_CACHE.set(espnId, null); return null; }
    const data = await res.json();
    const recap = _pickBestTwo(data?.article?.story || '');
    RECAP_CACHE.set(espnId, recap);
    return recap;
  } catch {
    RECAP_CACHE.set(espnId, null);
    return null;
  }
}

function _renderRecap(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.startsWith('-'));
  if (!lines.length) return `<span>${text}</span>`;
  return lines.map(l => `<span class="recap-point">· ${l.replace(/^-\s*/, '')}</span>`).join('');
}

function _injectRecaps() {
  document.querySelectorAll('.match-recap[data-espnid]').forEach(el => {
    const recap = RECAP_CACHE.get(Number(el.dataset.espnid));
    if (recap) el.innerHTML = _renderRecap(recap);
  });
}

async function loadRecaps() {
  const completed = [...MATCHES, ...KNOCKOUTS].filter(m => Array.isArray(m.score) && m.espnId);
  await Promise.all(completed.map(m => _fetchRecap(m.espnId)));
  _injectRecaps();
}

/* Highlights: exact URL if data.js provides m.yt, otherwise a targeted
   search on FOX Soccer's YouTube channel that lands on the official video. */
const highlightsURL = (m) =>
  m.yt ||
  `https://www.youtube.com/results?search_query=${encodeURIComponent(
    `FOX Soccer ${TEAMS[m.home].name} vs ${TEAMS[m.away].name} highlights World Cup 2026`
  )}`;

/* ---------- ticket renderer ---------- */
function ticketHTML(m, { showPred = true, showNote = true } = {}) {
  const v = VENUES[m.venue];
  const isKO = !m.home;
  const done = Array.isArray(m.score);
  const ko = new Date(m.t);
  const now = new Date();
  const liveSnap = !done && Array.isArray(m.liveScore);
  const live = !done && (liveSnap || (now >= ko && now - ko < 2.5 * 3600 * 1000));

  let statusChip = "";
  if (done) statusChip = `<span class="ft">FT</span>`;
  else if (live) statusChip = `<span class="soon">● LIVE${m.liveClock ? ` ${m.liveClock}` : ""}</span>`;
  else if (relDay(m.t) === "Today") statusChip = `<span class="soon">TODAY</span>`;

  let teamsHTML;
  if (isKO) {
    teamsHTML = `<div class="teamrow tbd"><span class="tname">${m.label}</span></div>`;
  } else {
    const H = TEAMS[m.home], A = TEAMS[m.away];
    const sc = done ? m.score : liveSnap ? m.liveScore : null;
    const scClass = liveSnap && !done ? "tscore livesc" : "tscore";
    teamsHTML = `
      <div class="teamrow">
        <img src="${FLAG(H.flag)}" alt="${H.name} flag" loading="lazy">
        <span class="tname">${H.name}</span><span class="trank">#${H.rank}</span>
        ${sc ? `<span class="${scClass}">${sc[0]}</span>` : ""}
      </div>
      <div class="teamrow">
        <img src="${FLAG(A.flag)}" alt="${A.name} flag" loading="lazy">
        <span class="tname">${A.name}</span><span class="trank">#${A.rank}</span>
        ${sc ? `<span class="${scClass}">${sc[1]}</span>` : ""}
      </div>`;
  }

  const localT = fmtTime(m.t);
  const stadiumT = fmtTime(m.t, v.tz);
  let stadiumLine = stadiumT !== localT
    ? `<span class="vtime"><b>${stadiumT}</b> at the stadium</span>` : "";
  if (liveSnap && m.liveAsOf) {
    const asOf = new Date(m.liveAsOf).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    stadiumLine = `<span class="vtime asof">score as of <b>${asOf}</b></span>`;
  }

  let predHTML = "";
  if (showPred && !isKO && !done) {
    const p = winProbs(m.home, m.away);
    predHTML = `
      <div class="predbar" title="Win probability estimate (live model)">
        <div class="bar">
          <span class="seg-h" style="width:${p.h}%"></span>
          <span class="seg-d" style="width:${p.d}%"></span>
          <span class="seg-a" style="width:${p.a}%"></span>
        </div>
        <div class="lbl"><span>${TEAMS[m.home].name.split(" ")[0]} ${p.h}%</span><span>Draw ${p.d}%</span><span>${TEAMS[m.away].name.split(" ")[0]} ${p.a}%</span></div>
      </div>`;
  }

  const preview = !done && !isKO && PREVIEW_CACHE.get(m.id);
  const noteHTML = showNote
    ? preview
      ? `<div class="matchnote">${matchNote(m)}</div>
        <details class="preview-toggle" data-matchid="${m.id}">
          <summary>Your cheat sheet</summary>
          <div class="match-preview">${_renderPreview(preview)}</div>
        </details>`
      : `<div class="matchnote">${matchNote(m)}</div>`
    : "";
  const recapHTML = (done && m.espnId)
    ? `<div class="match-recap" data-espnid="${m.espnId}">${RECAP_CACHE.get(m.espnId) || ''}</div>`
    : '';
  const stageClass = m.stage.startsWith("Group") ? "" : "ko";
  const tag = done ? "a" : "article";
  const ytAttr = done
    ? ` class="ticket done" href="${highlightsURL(m)}" target="_blank" rel="noopener" aria-label="Watch highlights of ${TEAMS[m.home].name} vs ${TEAMS[m.away].name}"`
    : ` class="ticket"`;
  return `
    <${tag}${ytAttr} tabindex="0" data-matchid="${m.id}">
      <div class="stage-tag"><span class="badge ${stageClass}">${m.stage}</span>${statusChip}</div>
      <div class="teams">${teamsHTML}</div>
      <div class="kick">
        <span class="clock">${localT.replace(/\s?(AM|PM)/i, "")}</span>
        <span class="ampm">${localT.match(/AM|PM/i)?.[0] ?? ""} · ${new Date(m.t).toLocaleDateString([], { month: "short", day: "numeric" })}</span>
        ${stadiumLine}
      </div>
      ${predHTML}
      ${noteHTML}
      ${recapHTML}
      <div class="placefoot"><span class="ven">${v.name}</span><span>${v.city}</span>${done ? `<span class="hl">▶ Watch highlights</span>` : ""}</div>
    </${tag}>`;
}


/* =====================================================
   VIEW 1 — SCHEDULE
   ===================================================== */
let schedF = { quick: "upcoming", day: null, teams: new Set(), groups: new Set(), stage: "all" };
const filtersActive = () =>
  schedF.day || schedF.teams.size || schedF.groups.size || schedF.stage !== "all" || schedF.quick !== "upcoming";

/* games matching team/group/stage filters (day & quick range ignored —
   the calendar itself is the day picker) */
function filterableGames() {
  let games = ALL_GAMES;
  if (schedF.teams.size)
    games = games.filter((m) => schedF.teams.has(m.home) || schedF.teams.has(m.away));
  if (schedF.groups.size)
    games = games.filter((m) => m.stage.startsWith("Group") && schedF.groups.has(m.stage.slice(-1)));
  if (schedF.stage === "group") games = games.filter((m) => m.stage.startsWith("Group"));
  if (schedF.stage === "knockout") games = games.filter((m) => !m.stage.startsWith("Group"));
  return games;
}

function buildCalendar() {
  const byDay = {};
  filterableGames().forEach((m) => (byDay[dayKey(m.t)] ??= []).push(m));
  if (schedF.day && !byDay[schedF.day]) schedF.day = null; // selected day filtered out
  const tk = todayKey();
  const months = [{ y: 2026, mo: 5, label: "June 2026" }, { y: 2026, mo: 6, label: "July 2026" }];
  const dows = ["S", "M", "T", "W", "T", "F", "S"];

  $("#calendar").innerHTML = months
    .map(({ y, mo, label }) => {
      const first = new Date(y, mo, 1);
      const daysIn = new Date(y, mo + 1, 0).getDate();
      let cells = dows.map((d) => `<span class="dowh">${d}</span>`).join("");
      cells += `<span></span>`.repeat(first.getDay());
      for (let d = 1; d <= daysIn; d++) {
        const k = `${y}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const games = byDay[k] || [];
        const ko = games.length && games.every((g) => !g.stage.startsWith("Group"));
        const tbd = ko && games.some((g) => !g.home);
        const cls = ["calday", games.length ? "hasgames" : "", tbd ? "tbd-day" : (ko ? "ko-day" : ""), k === tk ? "today" : "", schedF.day === k ? "selected" : ""].join(" ");
        const dots = games.length ? `<span class="dots">${"●".repeat(Math.min(games.length, 6))}</span>` : `<span class="dots">&nbsp;</span>`;
        cells += games.length
          ? `<button class="${cls}" data-day="${k}" aria-label="${label.split(" ")[0]} ${d}, ${games.length} matches">${d}${dots}</button>`
          : `<span class="${cls}">${d}${dots}</span>`;
      }
      return `<div class="calmonth"><h4>${label}</h4><div class="calgrid">${cells}</div></div>`;
    })
    .join("");

  $$("#calendar .calday.hasgames").forEach((b) =>
    b.addEventListener("click", () => {
      const newDay = schedF.day === b.dataset.day ? null : b.dataset.day;
      if (newDay) posthog.capture('schedule_day_selected', { day: newDay });
      schedF.day = newDay;
      renderSchedule();
    })
  );

  // hover tooltip
  let calTip = document.getElementById("cal-tooltip");
  if (!calTip) {
    calTip = document.createElement("div");
    calTip.id = "cal-tooltip";
    calTip.className = "cal-tooltip";
    document.body.appendChild(calTip);
  }

  $$("#calendar .calday.hasgames").forEach((b) => {
    b.addEventListener("mouseenter", () => {
      if (window.matchMedia("(hover: none)").matches) return;
      const k = b.dataset.day;
      const games = byDay[k] || [];
      const dateLabel = new Date(k + "T12:00:00").toLocaleDateString([], { month: "long", day: "numeric" });
      calTip.innerHTML = `<div class="cal-tip-date">${dateLabel} · ${games.length} match${games.length !== 1 ? "es" : ""}</div>` +
        games.map(m => {
          const home = TEAMS[m.home], away = TEAMS[m.away];
          const score = Array.isArray(m.score)
            ? `<span class="cal-tip-score">${m.score[0]}–${m.score[1]}</span> `
            : "";
          return `<div class="cal-tip-match">` +
            `<span class="cal-tip-teams">${score}` +
            `<img src="${FLAG(home.flag, 40)}" alt="${home.name} flag" class="cal-tip-flag"> ${home.name}` +
            ` <span class="cal-tip-vs">vs</span> ` +
            `<img src="${FLAG(away.flag, 40)}" alt="${away.name} flag" class="cal-tip-flag"> ${away.name}</span>` +
            `<span class="cal-tip-meta">${fmtTime(m.t)} · ${m.stage}</span>` +
            `</div>`;
        }).join("");

      const rect = b.getBoundingClientRect();
      calTip.style.left = "0";
      calTip.style.top = "0";
      calTip.style.transform = "none";
      calTip.classList.add("visible");

      const tw = calTip.offsetWidth;
      const th = calTip.offsetHeight;
      let left = rect.left + rect.width / 2 - tw / 2;
      let top = rect.bottom + 8;
      left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
      if (top + th > window.innerHeight - 8) top = rect.top - th - 8;
      calTip.style.left = left + "px";
      calTip.style.top = top + "px";
    });

    b.addEventListener("mouseleave", () => calTip.classList.remove("visible"));
  });
}

function buildDayTabs() {
  const el = $("#day-tabs");
  if (!el) return;
  const byDay = {};
  filterableGames().forEach((m) => (byDay[dayKey(m.t)] ??= []).push(m));
  if (schedF.day && !byDay[schedF.day]) schedF.day = null;

  const tk = todayKey();
  el.innerHTML = Object.keys(byDay).sort().map(k => {
    const date = new Date(k + "T12:00:00");
    const label = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const isToday = k === tk;
    const n = byDay[k].length;
    const cls = ["daytab", schedF.day === k ? "active" : "", isToday ? "is-today" : ""].filter(Boolean).join(" ");
    const sub = isToday
      ? `<span class="dt-sub today-label">TODAY</span>`
      : `<span class="dt-sub">${n} match${n !== 1 ? "es" : ""}</span>`;
    return `<button class="${cls}" data-day="${k}"><span class="dt-label">${label}</span>${sub}</button>`;
  }).join("");

  $$("#day-tabs .daytab").forEach(b => {
    b.addEventListener("click", () => {
      const newDay = schedF.day === b.dataset.day ? null : b.dataset.day;
      if (newDay) posthog.capture('schedule_day_selected', { day: newDay });
      schedF.day = newDay;
      renderSchedule();
    });
  });

  const focus = el.querySelector(".daytab.active") || el.querySelector(".daytab.is-today");
  if (focus) focus.scrollIntoView({ behavior: "instant", block: "nearest", inline: "center" });
}

function renderTeamChips() {
  $("#sched-team-chips").innerHTML = [...schedF.teams]
    .map((c) => `<span class="chip"><img src="${FLAG(TEAMS[c].flag, 40)}" alt="${TEAMS[c].name} flag">${TEAMS[c].name} (#${TEAMS[c].rank})<button data-c="${c}" aria-label="Remove ${TEAMS[c].name}">✕</button></span>`)
    .join("");
  $$("#sched-team-chips button").forEach((b) =>
    b.addEventListener("click", () => { schedF.teams.delete(b.dataset.c); renderSchedule(); })
  );
}

function gamesForFilter() {
  let games = filterableGames();
  const tk = todayKey();
  const now = new Date();

  if (schedF.day) {
    games = games.filter((m) => dayKey(m.t) === schedF.day);
  } else if (schedF.quick === "today") {
    games = games.filter((m) => dayKey(m.t) === tk);
  } else if (schedF.quick === "tomorrow") {
    const tm = new Date(now); tm.setDate(tm.getDate() + 1);
    games = games.filter((m) => dayKey(m.t) === dayKey(tm.toISOString()));
  } else if (schedF.quick === "week") {
    const end = new Date(now); end.setDate(end.getDate() + 7);
    games = games.filter((m) => new Date(m.t) >= new Date(now - 6 * 36e5) && new Date(m.t) <= end);
  } else if (schedF.quick === "yesterday") {
    const yd = new Date(now); yd.setDate(yd.getDate() - 1);
    games = games.filter((m) => dayKey(m.t) === dayKey(yd.toISOString()));
  } else if (schedF.quick === "past") {
    games = games.filter((m) => dayKey(m.t) < tk || Array.isArray(m.score));
  } else if (schedF.quick === "upcoming") {
    games = games.filter((m) => !Array.isArray(m.score) && dayKey(m.t) >= tk);
  }
  return games;
}

/* =====================================================
   CALENDAR EXPORT — generates .ics for current filter
   ===================================================== */
function _icsDate(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function _icsEscape(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
}

function _icsFold(line) {
  if (line.length <= 75) return line;
  let out = line.slice(0, 75);
  let i = 75;
  while (i < line.length) { out += '\r\n ' + line.slice(i, i + 74); i += 74; }
  return out;
}

function downloadCalendar() {
  const matches = gamesForFilter().filter(m => !Array.isArray(m.score) && !m.liveScore);
  if (!matches.length) { alert('No upcoming matches match your current filters.'); return; }

  posthog.capture('calendar_exported', { match_count: matches.length });

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//fifa26wc.com//World Cup 2026//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:World Cup 2026',
  ];

  for (const m of matches) {
    const start = new Date(m.t);
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    const v = VENUES[m.venue];
    const home = TEAMS[m.home]?.name || '?';
    const away = TEAMS[m.away]?.name || '?';
    const location = v ? `${v.name}, ${v.city}` : '';
    const desc = _icsEscape(`${m.stage}${location ? ' · ' + location : ''}\nfifa26wc.com · by: Kajal Dayal`);
    lines.push(
      'BEGIN:VEVENT',
      `UID:wc26-match-${m.id}@fifa26wc.com`,
      `DTSTART:${_icsDate(start)}`,
      `DTEND:${_icsDate(end)}`,
      _icsFold(`SUMMARY:${_icsEscape(`${home} vs ${away} · World Cup 2026`)}`),
      _icsFold(`DESCRIPTION:${desc}`),
      _icsFold(`LOCATION:${_icsEscape(location)}`),
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'world-cup-2026.ics';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* group standings table — shown when filtering by group(s) */
function standingsHTML(group) {
  const rows = Object.entries(TEAMS)
    .filter(([, t]) => t.group === group)
    .map(([c, t]) => ({ c, t, s: STANDINGS[c] }))
    .sort((x, y) =>
      y.s.pts - x.s.pts ||
      (y.s.gf - y.s.ga) - (x.s.gf - x.s.ga) ||
      y.s.gf - x.s.gf ||
      x.t.name.localeCompare(y.t.name))
    .map((r, i) => `
      <tr class="${i < 2 ? "qual" : i === 2 ? "maybe" : ""}">
        <td class="mono pos">${i + 1}</td>
        <td class="teamcell"><img src="${FLAG(r.t.flag, 40)}" alt="${r.t.name} flag">${r.t.name}<span class="trank">#${r.t.rank}</span></td>
        <td class="mono">${r.s.p}</td><td class="mono">${r.s.w}</td><td class="mono">${r.s.d}</td><td class="mono">${r.s.l}</td>
        <td class="mono">${r.s.gf}</td><td class="mono">${r.s.ga}</td>
        <td class="mono">${r.s.gf - r.s.ga > 0 ? "+" : ""}${r.s.gf - r.s.ga}</td>
        <td class="mono pts">${r.s.pts}</td>
      </tr>`)
    .join("");
  return `
    <div class="standcard">
      <h3 class="subhead">Group ${group} Standings</h3>
      <div class="tablewrap"><table class="standings">
        <thead><tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th>Pts</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <p class="standnote">Top two advance · 3rd place can qualify among the eight best third-place teams</p>
    </div>`;
}

function renderSchedule() {
  refreshModel();
  $$("#sched-quick .pill").forEach((p) => p.classList.toggle("active", !schedF.day && p.dataset.f === schedF.quick));
  $$("#sched-groups .pill").forEach((p) => p.classList.toggle("active", schedF.groups.has(p.dataset.g)));
  $("#sched-stage").value = schedF.stage;
  $("#sched-clear").disabled = !filtersActive();
  buildCalendar();
  buildDayTabs();
  renderTeamChips();

  const games = gamesForFilter();
  const byDay = {};
  games.forEach((m) => (byDay[dayKey(m.t)] ??= []).push(m));

  let out = Object.keys(byDay)
    .sort()
    .map((k) => {
      const rel = relDay(byDay[k][0].t);
      const head = `${rel ? rel + " — " : ""}${fmtDayLong(byDay[k][0].t)}`;
      return `
        <h3 class="dayheader">${head}<span class="count">${byDay[k].length} match${byDay[k].length > 1 ? "es" : ""}</span></h3>
        <div class="matchgrid">${byDay[k].map((m) => ticketHTML(m)).join("")}</div>`;
    })
    .join("");

  if (!out && schedF.teams.size && schedF.stage !== "group") {
    out = `<div class="empty-day">No scheduled matches for this filter yet — knockout opponents aren't set until the group stage wraps on June 27. Check the <b>Path to the Trophy</b> tab for projected routes.</div>`;
  }
  $("#schedule-list").innerHTML = out || `<div class="empty-day">No matches in this window — click a highlighted day on the calendar, or hit ✕ Clear filters.</div>`;
  _injectRecaps();

  $("#standings-area").innerHTML = schedF.groups.size
    ? [...schedF.groups].sort().map(standingsHTML).join("")
    : "";
}

/* =====================================================
   VIEW 2 — MAP
   ===================================================== */
let map = null, markerLayer = null;
const VENUE_COLORS = { US: "#F0A12E", MX: "#168A4E", CA: "#E4573D" };

function renderMarkers() {
  const teamF = $("#map-team").value;
  const cityF = $("#map-city").value;
  markerLayer.clearLayers();

  /* with a team filter: number each venue by the order the team plays there */
  const stopNums = {}; // venueKey -> [1, 3, ...]
  if (teamF) {
    ALL_GAMES
      .filter((m) => m.home === teamF || m.away === teamF)
      .forEach((m, i) => (stopNums[m.venue] ??= []).push(i + 1));
  }

  const entries = Object.entries(VENUES).filter(([key]) => {
    if (cityF && key !== cityF) return false;
    if (teamF && !stopNums[key]) return false;
    return true;
  });

  const bounds = [];
  entries.forEach(([key, v]) => {
    let games = ALL_GAMES.filter((m) => m.venue === key);
    if (teamF) games = games.filter((m) => m.home === teamF || m.away === teamF);
    const shown = games.slice(0, 5);

    let marker;
    if (teamF && stopNums[key]) {
      const nums = stopNums[key].join("·");
      marker = L.marker([v.lat, v.lng], {
        icon: L.divIcon({
          className: "vnum-marker",
          html: `<span class="${stopNums[key].length > 1 ? "multi" : ""}" style="background:${VENUE_COLORS[v.country]}">${nums}</span>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        }),
        title: `Stop ${nums}: ${v.name}`,
      });
    } else {
      marker = L.circleMarker([v.lat, v.lng], {
        radius: cityF ? 12 : 9,
        color: VENUE_COLORS[v.country], weight: 3,
        fillColor: VENUE_COLORS[v.country], fillOpacity: 0.6,
      });
    }

    const makeRow = (m, hidden) => {
      const title = m.home ? `${TEAMS[m.home].name} v ${TEAMS[m.away].name}` : m.label;
      return `<div class="popup-match${hidden ? " popup-hidden" : ""}"><span class="pm-t">${new Date(m.t).toLocaleDateString([], { month: "short", day: "numeric" })} · ${fmtTime(m.t)}</span><br>${m.stage}: ${title}</div>`;
    };
    const popupHeader = `
      <div class="popup-venue">${teamF && stopNums[key] ? `Stop ${stopNums[key].join(" & ")} · ` : ""}${v.name}</div>
      <div class="popup-city">${v.city} · ${games.length} match${games.length !== 1 ? "es" : ""}${teamF ? ` for ${TEAMS[teamF].name}` : ""} · cap. ${v.capacity.toLocaleString()}</div>`;
    const rows = shown.map((m) => makeRow(m, false)).join("") +
                 games.slice(shown.length).map((m) => makeRow(m, true)).join("");
    marker.bindPopup(`${popupHeader}${rows}${games.length > shown.length ? `<div class="popup-more">+ ${games.length - shown.length} more here</div>` : ""}`);
    marker.on("popupopen", (e) => {
      posthog.capture('map_venue_popup_opened', { venue_name: v.name, venue_city: v.city });
      const moreEl = e.popup.getElement()?.querySelector(".popup-more");
      if (!moreEl) return;
      moreEl.addEventListener("click", (ev) => {
        ev.stopPropagation();
        e.popup.getElement().querySelectorAll(".popup-hidden").forEach((el) => el.classList.remove("popup-hidden"));
        moreEl.remove();
      });
    });
    marker.addTo(markerLayer);
    bounds.push([v.lat, v.lng]);
  });

  if (bounds.length === 1) map.flyTo(bounds[0], 10);
  else if (bounds.length) map.flyToBounds(bounds, { padding: [50, 50], maxZoom: 6 });

  $("#map-count").textContent = teamF
    ? `${TEAMS[teamF].name}'s ${Object.values(stopNums).flat().length} group games, numbered in order`
    : `${entries.length} of 16 stadiums shown`;
  $("#map-clear").disabled = !teamF && !cityF;
}

let _leafletReady = null;
function loadLeaflet() {
  if (_leafletReady) return _leafletReady;
  _leafletReady = new Promise((resolve) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    css.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
    css.crossOrigin = '';
    document.head.appendChild(css);
    const js = document.createElement('script');
    js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    js.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
    js.crossOrigin = '';
    js.onload = resolve;
    document.head.appendChild(js);
  });
  return _leafletReady;
}

function buildMap() {
  if (map) return;
  map = L.map("map", { scrollWheelZoom: false }).setView([37.5, -96.5], 4);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
    maxZoom: 18,
  }).addTo(map);
  markerLayer = L.layerGroup().addTo(map);
  renderMarkers();
}

/* =====================================================
   VIEW 3 — PATH TO THE TROPHY
   ===================================================== */
function pathStepHTML(label, m, opponentText, trophy = false) {
  const v = VENUES[m.venue];
  const localT = fmtTime(m.t), stadiumT = fmtTime(m.t, v.tz);
  return `
    <div class="pathstep ${trophy ? "trophy" : ""}">
      <div class="steplabel">${label}</div>
      <article class="ticket">
        <div class="stage-tag"><span class="badge ${m.stage.startsWith("Group") ? "" : "ko"}">${m.stage}</span>
          <span>${new Date(m.t).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}</span>
        </div>
        <div class="teams"><div class="teamrow tbd"><span class="tname">${opponentText}</span></div></div>
        <div class="kick">
          <span class="clock">${localT.replace(/\s?(AM|PM)/i, "")}</span>
          <span class="ampm">${localT.match(/AM|PM/i)?.[0] ?? ""}</span>
          ${stadiumT !== localT ? `<span class="vtime"><b>${stadiumT}</b> at the stadium</span>` : ""}
        </div>
        <div class="placefoot"><span class="ven">${v.name}</span><span>${v.city}</span></div>
      </article>
    </div>`;
}

function renderPath() {
  refreshModel();
  const code = $("#path-team").value;
  const scenario = $(".scenario-toggle .active").dataset.s;
  const T = TEAMS[code];
  const g = T.group;
  let html = "";

  MATCHES.filter((m) => m.home === code || m.away === code).forEach((m, i) => {
    const done = Array.isArray(m.score);
    html += `<div class="pathstep">
      <div class="steplabel">Group stage · match ${i + 1} of 3${done ? " · played" : ""}</div>
      ${ticketHTML(m, { showPred: !done, showNote: false })}
    </div>`;
  });

  const slot = scenario === "win" ? `W-${g}` : `RU-${g}`;
  const r32 = KNOCKOUTS.find((k) => k.slots && k.slots.includes(slot));
  if (r32) {
    const other = r32.slots.find((s) => s !== slot);
    const oppText =
      other === "3RD" ? r32.label.replace(/Winner \w vs /, "vs ") :
      other.startsWith("W-") ? `vs Winner of Group ${other.slice(2)}` :
      `vs Runner-up of Group ${other.slice(3)}`;
    html += pathStepHTML(
      scenario === "win" ? `If ${T.name} win Group ${g}` : `If ${T.name} finish 2nd in Group ${g}`,
      r32, oppText
    );
  }

  [["Round of 16", "Win and advance — opponent decided by the bracket"],
   ["Quarterfinal", "Opponent decided by the bracket"],
   ["Semifinal", "Opponent decided by the bracket"]].forEach(([stage, txt]) => {
    const candidates = KNOCKOUTS.filter((k) => k.stage === stage);
    const range = candidates.length > 1
      ? `Played ${new Date(candidates[0].t).toLocaleDateString([], { month: "short", day: "numeric" })}–${new Date(candidates[candidates.length - 1].t).toLocaleDateString([], { month: "short", day: "numeric" })}`
      : "";
    html += pathStepHTML(range, candidates[0], txt);
  });
  html += pathStepHTML("The last match standing", KNOCKOUTS.find((k) => k.stage === "Final"), `${T.name} lift the trophy?`, true);

  $("#path-rail").innerHTML = html;
  _injectRecaps();
  const delta = RATINGS[code] - T.strength;
  const deltaTxt = Math.abs(delta) >= 0.05
    ? ` · Elo rating ${RATINGS[code].toFixed(1)} (<span class="${delta > 0 ? "delta-up" : "delta-down"}">${delta > 0 ? "▲" : "▼"}${Math.abs(delta).toFixed(1)}</span> vs. pre-tournament)`
    : ` · Elo rating ${RATINGS[code].toFixed(1)}`;
  $("#path-summary").innerHTML =
    `<img src="${FLAG(T.flag, 40)}" alt="${T.name} flag" style="width:24px;vertical-align:-4px;border-radius:3px"> ` +
    `<b>${T.name}</b> — FIFA rank #${T.rank}${deltaTxt}. Three group games, then five knockout wins to the final at MetLife on July 19.`;
}

/* =====================================================
   VIEW 4 — TEAMS & ROSTERS
   ===================================================== */
function _playerPhotoFallback(img) {
  const div = document.createElement('div');
  div.className = 'avatar';
  div.textContent = img.dataset.initials;
  img.replaceWith(div);
}

function teamCardHTML(code) {
  const t = TEAMS[code];
  const byPos = { FW: [], MF: [], DF: [], GK: [] };
  (ROSTERS[code] || []).forEach(([name, pos, club, age]) => {
    if (byPos[pos]) byPos[pos].push([name, pos, club, age]);
  });

  function playerHTML([name, , club, age]) {
    const initials = name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
    const espnId = PHOTO_CACHE[name];
    const avatarHTML = espnId
      ? `<img class="avatar" src="https://a.espncdn.com/i/headshots/soccer/players/full/${espnId}.png" alt="${name}" loading="lazy" data-initials="${initials}" onerror="_playerPhotoFallback(this)">`
      : `<div class="avatar" aria-hidden="true">${initials}</div>`;
    const raw = MARKET_VALUES?.[name];
    const valHTML = typeof raw === 'number'
      ? `<span class="p-val">${raw >= 1e6 ? '€' + (raw / 1e6).toFixed(raw % 1e6 === 0 ? 0 : 1) + 'm' : '€' + (raw / 1e3).toFixed(0) + 'k'}</span>`
      : '';
    return `<div class="player">
        ${avatarHTML}
        <div>
          <div class="p-name">${name}</div>
          <div class="p-sub">${age} yrs · ${club}${valHTML ? ' · ' + valHTML : ''}</div>
        </div>
      </div>`;
  }

  const groups = [
    { label: "Forwards", pos: "FW" },
    { label: "Midfielders", pos: "MF" },
    { label: "Defenders", pos: "DF" },
    { label: "Goalkeeper", pos: "GK" },
  ];

  const lineupHTML = `<div class="lineup-grid">` +
    groups.map(({ label, pos }) =>
      `<div class="lineup-group">
        <div class="lineup-label">${label}</div>
        ${byPos[pos].map(playerHTML).join("")}
      </div>`
    ).join("") + `</div>`;

  const squadLink = t.squad
    ? `<a class="squad-link" href="${t.squad}" target="_blank" rel="noopener">Full squad on FIFA.com →</a>`
    : "";
  return `<div class="teamcard">
    <div class="tc-head">
      <img src="${FLAG(t.flag)}" alt="${t.name} flag">
      <div class="tc-head-text">
        <span class="tc-name">${t.name}</span>
        <span class="tc-meta">Group ${t.group} · FIFA <b>#${t.rank}</b> · title odds <b>${t.odds}</b></span>
      </div>
      ${squadLink}
    </div>
    <div class="starting-xi">${lineupHTML}</div>
  </div>`;
}

const teamsF = new Set();

function renderTeamsChips() {
  $("#teams-chips").innerHTML = [...teamsF]
    .map((c) => `<span class="chip"><img src="${FLAG(TEAMS[c].flag, 40)}" alt="${TEAMS[c].name} flag">${TEAMS[c].name}<button data-c="${c}" aria-label="Remove ${TEAMS[c].name}">✕</button></span>`)
    .join("");
  $$("#teams-chips button").forEach((b) =>
    b.addEventListener("click", () => { teamsF.delete(b.dataset.c); renderTeams(); })
  );
}

function renderTeams() {
  const group = $(".groupnav .pill.active")?.dataset.g || "A";
  renderTeamsChips();
  if (teamsF.size > 0) {
    $("#teams-list").innerHTML = [...teamsF].map(teamCardHTML).join("");
  } else {
    $("#teams-list").innerHTML = Object.entries(TEAMS)
      .filter(([, t]) => t.group === group)
      .map(([code]) => teamCardHTML(code)).join("");
  }
}

/* =====================================================
   VIEW 5 — PREDICTIONS
   ===================================================== */
function groupWinProbs(group) {
  // softmax over (live rating + 2*current points)
  const teams = Object.entries(TEAMS).filter(([, t]) => t.group === group);
  const scores = teams.map(([c]) => Math.exp((RATINGS[c] + 2 * STANDINGS[c].pts) / 7));
  const sum = scores.reduce((a, b) => a + b, 0);
  return teams
    .map(([c, t], i) => ({ code: c, team: t, p: scores[i] / sum }))
    .sort((a, b) => b.p - a.p);
}

function renderPredictions() {
  refreshModel();
  $("#groupwin-grid").innerHTML = "ABCDEFGHIJKL".split("")
    .map((g) => {
      const rows = groupWinProbs(g)
        .map((r, i) => `
          <div class="gwrow ${i === 0 ? "leader" : ""}">
            <img src="${FLAG(r.team.flag, 40)}" alt="${r.team.name} flag">
            <span class="gwname">${r.team.name}</span>
            <span class="gwbar"><i style="width:${Math.round(r.p * 100)}%"></i></span>
            <span class="gwpct">${Math.round(r.p * 100)}%</span>
          </div>`)
        .join("");
      return `<div class="gwcard"><h4>Group ${g}</h4>${rows}</div>`;
    })
    .join("");

  $("#odds-body").innerHTML = Object.entries(TEAMS)
    .sort((a, b) => RATINGS[b[0]] - RATINGS[a[0]])
    .map(([code, t], i) => {
      const delta = RATINGS[code] - t.strength;
      const deltaHTML = Math.abs(delta) < 0.05
        ? `<span class="delta-flat">—</span>`
        : delta > 0
          ? `<span class="delta-up">▲${delta.toFixed(1)}</span>`
          : `<span class="delta-down">▼${Math.abs(delta).toFixed(1)}</span>`;
      const s = STANDINGS[code];
      const gd = s.gf - s.ga;
      return `<tr>
        <td class="mono" style="color:var(--ink-soft)">${i + 1}</td>
        <td><img src="${FLAG(t.flag, 40)}" alt="${t.name} flag" loading="lazy">${t.name}</td>
        <td class="mono">#${t.rank}</td>
        <td class="mono">${RATINGS[code].toFixed(1)} ${deltaHTML}</td>
        <td class="mono">${s.pts}</td>
        <td class="mono" style="color:${gd > 0 ? "var(--pitch)" : gd < 0 ? "var(--coral)" : "inherit"}">${gd > 0 ? "+" : ""}${gd}</td>
      </tr>`;
    })
    .join("");
}

/* =====================================================
   VIEW 6 — WHERE TO WATCH
   ===================================================== */
function renderWatch(q = "") {
  const needle = q.trim().toLowerCase();
  if (!needle) { $("#watch-grid").innerHTML = ""; return; }
  const cards = Object.entries(TEAMS)
    .sort((a, b) => a[1].name.localeCompare(b[1].name))
    .filter(([, t]) => t.name.toLowerCase().includes(needle))
    .map(([code, t]) => `<div class="watchcard">
        <div class="wc-head"><img src="${FLAG(t.flag, 40)}" alt="${t.name} flag" loading="lazy"><span class="wc-name">${t.name}</span></div>
        <ul>${(BROADCASTERS[code] || ["Check local listings"]).map((c) => `<li>${c}</li>`).join("")}</ul>
      </div>`)
    .join("");
  $("#watch-grid").innerHTML = cards || `<div class="empty-day">No country matches "${q}".</div>`;
}

/* =====================================================
   LIVE ESPN POLLER
   Fetches the ESPN scoreboard directly from the browser
   every 60 s while a match is active — no GitHub Actions
   delay, no Vercel deploy wait, always real-time.
   ===================================================== */
const ESPN_SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";
const POLL_MS = 60_000;
const ACTIVE_WINDOW = 4 * 3600 * 1000;

const _stripName = (s) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "");

const _ESPN_ALIASES = {
  USA: ["usa","unitedstates","us"], KOR: ["southkorea","korearepublic","kor"],
  CZE: ["czechia","czechrepublic"], TUR: ["turkiye","turkey"],
  BIH: ["bosniaandherzegovina","bosniaherzegovina","bosnia"],
  CIV: ["ivorycoast","cotedivoire"],
  COD: ["drcongo","congodr","democraticrepublicofthecongo","drcongokinshasa"],
  CPV: ["capeverde","caboverde"], CUW: ["curacao"],
  IRN: ["iran","iriran","islamicrepublicofiran"],
  NED: ["netherlands","holland"], RSA: ["southafrica"],
  KSA: ["saudiarabia"], UZB: ["uzbekistan"], SCO: ["scotland"], ENG: ["england"],
};

function _buildNameMap() {
  const map = {};
  for (const [code, t] of Object.entries(TEAMS)) map[_stripName(t.name)] = code;
  for (const [code, aliases] of Object.entries(_ESPN_ALIASES))
    for (const a of aliases) map[a] = code;
  return map;
}

function _activeDates() {
  const now = Date.now();
  const pending = MATCHES.filter(
    (m) => !Array.isArray(m.score) && Math.abs(new Date(m.t).getTime() - now) < ACTIVE_WINDOW
  );
  if (!pending.length) return [];
  const etFmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  });
  const dates = new Set();
  for (const m of pending) {
    const d = new Date(m.t);
    dates.add(d.toISOString().slice(0, 10).replace(/-/g, ""));
    dates.add(etFmt.format(d).replace(/-/g, ""));
  }
  return [...dates];
}

function _applyESPNEvents(events, nameMap) {
  let changed = false;
  for (const ev of events) {
    const comp = ev.competitions?.[0];
    if (!comp) continue;
    const status = comp.status ?? ev.status ?? {};
    const finished = status.type?.completed === true;
    const inProgress = !finished && status.type?.state === "in";
    if (!finished && !inProgress) continue;
    const sides = comp.competitors || [];
    const home = sides.find((c) => c.homeAway === "home");
    const away = sides.find((c) => c.homeAway === "away");
    if (!home || !away) continue;
    const codeOf = (c) =>
      nameMap[_stripName(c.team?.displayName || "")] ??
      nameMap[_stripName(c.team?.shortDisplayName || "")] ??
      nameMap[_stripName(c.team?.name || "")];
    const hCode = codeOf(home), aCode = codeOf(away);
    if (!hCode || !aCode) continue;
    const match = MATCHES.find(
      (m) =>
        ((m.home === hCode && m.away === aCode) || (m.home === aCode && m.away === hCode)) &&
        Math.abs(new Date(m.t) - new Date(ev.date || comp.date)) < 36 * 3600 * 1000
    );
    if (!match) continue;
    const hg = parseInt(home.score, 10), ag = parseInt(away.score, 10);
    if (Number.isNaN(hg) || Number.isNaN(ag)) continue;
    const pair = match.home === hCode ? [hg, ag] : [ag, hg];
    if (finished) {
      if (!Array.isArray(match.score)) {
        match.score = pair;
        delete match.liveScore; delete match.liveAsOf; delete match.liveClock;
        changed = true;
      }
    } else {
      const clock = status.displayClock || null;
      const scoreChanged = !match.liveScore || match.liveScore[0] !== pair[0] ||
          match.liveScore[1] !== pair[1] || match.liveClock !== clock;
      match.liveScore = pair;
      match.liveAsOf = new Date().toISOString();
      match.liveClock = clock;
      if (scoreChanged) changed = true;
      else _updateAsOf(match);
    }
  }
  return changed;
}

async function _pollESPN(nameMap) {
  const dates = _activeDates();
  if (!dates.length) return false;
  let changed = false;
  for (const yyyymmdd of dates) {
    try {
      const res = await fetch(`${ESPN_SCOREBOARD}?dates=${yyyymmdd}`);
      if (!res.ok) continue;
      const { events = [] } = await res.json();
      if (_applyESPNEvents(events, nameMap)) changed = true;
    } catch { /* network hiccup — try next tick */ }
  }
  return changed;
}

function _updateAsOf(match) {
  const asOf = new Date(match.liveAsOf).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  document.querySelectorAll(".vtime.asof").forEach((el) => {
    const card = el.closest("[data-matchid]");
    if (card && card.dataset.matchid === String(match.id))
      el.innerHTML = `score as of <b>${asOf}</b>`;
  });
}

function startLivePoller() {
  const nameMap = _buildNameMap();
  async function tick() {
    const changed = await _pollESPN(nameMap);
    if (changed) {
      refreshModel();
      if ($("#view-schedule.active")) renderSchedule();
      if ($("#view-predictions.active")) renderPredictions();
    }
    if (_activeDates().length) setTimeout(tick, POLL_MS);
  }
  if (_activeDates().length) tick();
}

/* =====================================================
   boot
   ===================================================== */
/* Fetch all scores directly from ESPN on page load — no GitHub Action,
   no scores.json, no lag. Fetches all past match dates in parallel. */
async function loadLiveScores() {
  const nameMap = _buildNameMap();
  const now = Date.now();
  const etFmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  });
  const dates = new Set();
  for (const m of MATCHES) {
    if (Array.isArray(m.score)) continue; // already hardcoded in data.js
    const kickoff = new Date(m.t).getTime();
    if (kickoff > now + ACTIVE_WINDOW) continue; // future match
    const d = new Date(m.t);
    dates.add(d.toISOString().slice(0, 10).replace(/-/g, ""));
    dates.add(etFmt.format(d).replace(/-/g, ""));
  }
  await Promise.all([...dates].map(async (yyyymmdd) => {
    try {
      const res = await fetch(`${ESPN_SCOREBOARD}?dates=${yyyymmdd}`);
      if (!res.ok) return;
      const { events = [] } = await res.json();
      _applyESPNEvents(events, nameMap);
    } catch { /* offline / network hiccup */ }
  }));
}

document.addEventListener("DOMContentLoaded", async () => {
  await Promise.all([loadLiveScores(), loadPreviews(), loadRecapsJson(), loadPlayerPhotos()]);
  refreshModel();

  // mark current tournament stage in the funnel
  const today = new Date().toISOString().slice(0, 10);
  document.querySelectorAll('.funnel-stage[data-start]').forEach(el => {
    if (today >= el.dataset.start && today <= el.dataset.end) {
      el.classList.add('funnel-current');
      el.querySelector('.funnel-round').insertAdjacentHTML(
        'beforeend', '<span class="funnel-now">● NOW</span>'
      );
    }
  });

  // tabs — each switch re-renders that view so the live model stays current
  $$(".tab").forEach((tab) =>
    tab.addEventListener("click", () => {
      $$(".tab").forEach((t) => t.classList.remove("active"));
      $$(".view").forEach((v) => v.classList.remove("active"));
      tab.classList.add("active");
      $(`#view-${tab.dataset.view}`).classList.add("active");
      const v = tab.dataset.view;
      posthog.capture('tab_switched', { tab: v });
      document.querySelector("footer").classList.toggle("hidden", v === "friends");
      if (v === "schedule") renderSchedule();
      if (v === "map") loadLeaflet().then(() => setTimeout(() => { buildMap(); map.invalidateSize(); renderMarkers(); }, 60));
      if (v === "path") renderPath();
      if (v === "teams") renderTeams();
      if (v === "predictions") renderPredictions();
      if (v === "format") renderWatch(); // reset search on tab switch
      // rules, friends are static — no render needed
    })
  );

  // schedule: multi-team picker
  $("#sched-team").innerHTML = TEAM_OPT("", "+ Add a team…");
  $("#sched-team").addEventListener("change", (e) => {
    if (e.target.value) {
      posthog.capture('schedule_team_filter_added', { team_name: TEAMS[e.target.value]?.name, team_code: e.target.value });
      schedF.teams.add(e.target.value);
    }
    e.target.value = "";
    renderSchedule();
  });
  // multi-group pills
  $$("#sched-groups .pill").forEach((p) =>
    p.addEventListener("click", () => {
      schedF.groups.has(p.dataset.g) ? schedF.groups.delete(p.dataset.g) : schedF.groups.add(p.dataset.g);
      renderSchedule();
    })
  );
  // stage dropdown
  $("#sched-stage").addEventListener("change", (e) => { schedF.stage = e.target.value; renderSchedule(); });
  // quick ranges
  $$("#sched-quick .pill").forEach((p) =>
    p.addEventListener("click", () => { schedF.quick = p.dataset.f; schedF.day = null; renderSchedule(); })
  );
  // clear all
  $("#sched-clear").addEventListener("click", () => {
    posthog.capture('schedule_filters_cleared');
    schedF = { quick: "upcoming", day: null, teams: new Set(), groups: new Set(), stage: "all" };
    renderSchedule();
  });
  // calendar export
  $$(".cal-export-btn").forEach(b => b.addEventListener("click", downloadCalendar));
  renderSchedule();
  loadRecaps();

  // calendar toggle
  const calToggle = $("#cal-toggle");
  const calWrap = $("#calendar");
  const CAL_KEY = "wc26-cal-collapsed";
  if (localStorage.getItem(CAL_KEY) === "1") {
    calWrap.classList.add("cal-collapsed");
    calToggle.setAttribute("aria-expanded", "false");
  }
  calToggle.addEventListener("click", () => {
    const collapsed = calWrap.classList.toggle("cal-collapsed");
    calToggle.setAttribute("aria-expanded", String(!collapsed));
    localStorage.setItem(CAL_KEY, collapsed ? "1" : "0");
  });

  // map filters
  $("#map-team").innerHTML = TEAM_OPT("", "All teams");
  $("#map-city").innerHTML = `<option value="">All cities</option>` +
    Object.entries(VENUES)
      .sort((a, b) => a[1].city.localeCompare(b[1].city))
      .map(([k, v]) => `<option value="${k}">${v.city}</option>`)
      .join("");
  $("#map-team").addEventListener("change", () => {
    const teamCode = $("#map-team").value;
    if (teamCode) posthog.capture('map_team_filtered', { team_name: TEAMS[teamCode]?.name, team_code: teamCode });
    if (map) renderMarkers();
  });
  $("#map-city").addEventListener("change", () => map && renderMarkers());
  $("#map-clear").addEventListener("click", () => {
    $("#map-team").value = "";
    $("#map-city").value = "";
    if (map) { renderMarkers(); map.flyTo([37.5, -96.5], 4); }
  });

  // path
  $("#path-team").innerHTML = TEAM_OPT("USA");
  $("#path-team").addEventListener("change", () => {
    const code = $("#path-team").value;
    posthog.capture('path_team_selected', { team_name: TEAMS[code]?.name, team_code: code });
    renderPath();
  });
  $$(".scenario-toggle button").forEach((b) =>
    b.addEventListener("click", () => {
      $$(".scenario-toggle button").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      renderPath();
    })
  );
  renderPath();

  // teams
  $("#teams-team").innerHTML = TEAM_OPT("", "+ Add a team…");
  $("#teams-team").addEventListener("change", (e) => {
    if (e.target.value) {
      posthog.capture('roster_team_selected', { team_name: TEAMS[e.target.value]?.name, team_code: e.target.value });
      teamsF.add(e.target.value);
      e.target.value = "";
    }
    renderTeams();
  });
  $$(".groupnav .pill").forEach((p) =>
    p.addEventListener("click", () => {
      teamsF.clear();
      $$(".groupnav .pill").forEach((x) => x.classList.toggle("active", x === p));
      renderTeams();
    })
  );
  renderTeams();

  // predictions + watch
  renderPredictions();
  renderWatch();
  let _watchSearchTimer;
  $("#watch-search").addEventListener("input", (e) => {
    renderWatch(e.target.value);
    clearTimeout(_watchSearchTimer);
    if (e.target.value.trim()) {
      _watchSearchTimer = setTimeout(() => {
        posthog.capture('where_to_watch_searched', { query: e.target.value.trim() });
      }, 800);
    }
  });

  // delegated: match highlights click
  document.addEventListener("click", (e) => {
    const ticket = e.target.closest("a.ticket.done");
    if (!ticket) return;
    const matchId = Number(ticket.dataset.matchid);
    const match = ALL_GAMES.find((m) => m.id === matchId);
    if (!match) return;
    posthog.capture('match_highlights_clicked', {
      home_team: TEAMS[match.home]?.name,
      away_team: TEAMS[match.away]?.name,
      stage: match.stage,
    });
  });

  // delegated: match cheat-sheet preview opened
  document.addEventListener("toggle", (e) => {
    if (!e.target.matches("details.preview-toggle") || !e.target.open) return;
    const matchId = Number(e.target.dataset.matchid);
    const match = ALL_GAMES.find((m) => m.id === matchId);
    if (!match) return;
    posthog.capture('match_preview_opened', {
      home_team: TEAMS[match.home]?.name,
      away_team: TEAMS[match.away]?.name,
      stage: match.stage,
    });
  }, true);

  // delegated: squad link to FIFA.com
  document.addEventListener("click", (e) => {
    const squadLink = e.target.closest("a.squad-link");
    if (!squadLink) return;
    const teamName = squadLink.closest(".teamcard")?.querySelector(".tc-name")?.textContent;
    posthog.capture('squad_link_opened', { team_name: teamName });
  });

  // delegated: supporter link in friends tab
  document.addEventListener("click", (e) => {
    const supportLink = e.target.closest("a[href*='buy.stripe.com']");
    if (supportLink) posthog.capture('supporter_link_clicked');
  });

  startLivePoller();
});
