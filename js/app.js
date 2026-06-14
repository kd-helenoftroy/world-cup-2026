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

/* Highlights: exact URL if data.js provides m.yt, otherwise a targeted
   search on FOX Soccer's YouTube channel that lands on the official video. */
const highlightsURL = (m) =>
  m.yt ||
  `https://www.youtube.com/@FOXSoccer/search?query=${encodeURIComponent(
    `${TEAMS[m.home].name} vs ${TEAMS[m.away].name} highlights World Cup`
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

  const noteHTML = showNote ? `<div class="matchnote">${matchNote(m)}</div>` : "";
  const stageClass = m.stage.startsWith("Group") ? "" : "ko";
  const ytAttr = done ? ` class="ticket done" data-yt="${highlightsURL(m)}" role="link" aria-label="Watch highlights of ${TEAMS[m.home].name} vs ${TEAMS[m.away].name}"` : ` class="ticket"`;
  return `
    <article${ytAttr} tabindex="0">
      <div class="stage-tag"><span class="badge ${stageClass}">${m.stage}</span>${statusChip}</div>
      <div class="teams">${teamsHTML}</div>
      <div class="kick">
        <span class="clock">${localT.replace(/\s?(AM|PM)/i, "")}</span>
        <span class="ampm">${localT.match(/AM|PM/i)?.[0] ?? ""} · ${new Date(m.t).toLocaleDateString([], { month: "short", day: "numeric" })}</span>
        ${stadiumLine}
      </div>
      ${predHTML}
      ${noteHTML}
      <div class="placefoot"><span class="ven">${v.name}</span><span>${v.city}</span>${done ? `<span class="hl">▶ Watch highlights</span>` : ""}</div>
    </article>`;
}

/* whole completed ticket opens the FOX highlights video */
document.addEventListener("click", (e) => {
  const card = e.target.closest(".ticket.done[data-yt]");
  if (card) window.open(card.dataset.yt, "_blank", "noopener");
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const card = e.target.closest?.(".ticket.done[data-yt]");
  if (card) window.open(card.dataset.yt, "_blank", "noopener");
});

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
        const cls = ["calday", games.length ? "hasgames" : "", ko ? "ko-day" : "", k === tk ? "today" : "", schedF.day === k ? "selected" : ""].join(" ");
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
      schedF.day = schedF.day === b.dataset.day ? null : b.dataset.day;
      renderSchedule();
    })
  );
}

function renderTeamChips() {
  $("#sched-team-chips").innerHTML = [...schedF.teams]
    .map((c) => `<span class="chip"><img src="${FLAG(TEAMS[c].flag, 40)}" alt="">${TEAMS[c].name} (#${TEAMS[c].rank})<button data-c="${c}" aria-label="Remove ${TEAMS[c].name}">✕</button></span>`)
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
    games = games.filter((m) => dayKey(m.t) >= tk);
  }
  return games;
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
        <td class="teamcell"><img src="${FLAG(r.t.flag, 40)}" alt="">${r.t.name}<span class="trank">#${r.t.rank}</span></td>
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
  $$("#sched-stage .pill").forEach((p) => p.classList.toggle("active", p.dataset.s === schedF.stage));
  $("#sched-clear").disabled = !filtersActive();
  buildCalendar();
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
  const delta = RATINGS[code] - T.strength;
  const deltaTxt = Math.abs(delta) >= 0.05
    ? ` · Elo rating ${RATINGS[code].toFixed(1)} (<span class="${delta > 0 ? "delta-up" : "delta-down"}">${delta > 0 ? "▲" : "▼"}${Math.abs(delta).toFixed(1)}</span> vs. pre-tournament)`
    : ` · Elo rating ${RATINGS[code].toFixed(1)}`;
  $("#path-summary").innerHTML =
    `<img src="${FLAG(T.flag, 40)}" alt="" style="width:24px;vertical-align:-4px;border-radius:3px"> ` +
    `<b>${T.name}</b> — FIFA rank #${T.rank}${deltaTxt}. Three group games, then five knockout wins to the final at MetLife on July 19.`;
}

/* =====================================================
   VIEW 4 — TEAMS & ROSTERS
   ===================================================== */
function teamCardHTML(code) {
  const t = TEAMS[code];
  const players = (ROSTERS[code] || [])
    .map(([name, pos, club, age]) => {
      const initials = name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
      return `<div class="player">
        <div class="avatar" aria-hidden="true">${initials}</div>
        <div>
          <div class="p-name">${name}</div>
          <div class="p-sub"><span class="pos">${pos}</span> · ${age} yrs · ${club}</div>
        </div>
      </div>`;
    })
    .join("");
  return `<div class="teamcard">
    <div class="tc-head">
      <img src="${FLAG(t.flag)}" alt="${t.name} flag">
      <span class="tc-name">${t.name}</span>
      <span class="tc-meta">Group ${t.group} · FIFA <b>#${t.rank}</b> · title odds <b>${t.odds}</b></span>
    </div>
    <div class="playergrid">${players}</div>
  </div>`;
}

function renderTeams() {
  const teamF = $("#teams-team").value;
  const group = $(".groupnav .pill.active")?.dataset.g || "A";
  $("#teams-list").innerHTML = teamF
    ? teamCardHTML(teamF)
    : Object.entries(TEAMS).filter(([, t]) => t.group === group).map(([code]) => teamCardHTML(code)).join("");
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
            <img src="${FLAG(r.team.flag, 40)}" alt="">
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
        <td><img src="${FLAG(t.flag, 40)}" alt="" loading="lazy">${t.name}</td>
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
  const cards = Object.entries(TEAMS)
    .sort((a, b) => a[1].name.localeCompare(b[1].name))
    .filter(([, t]) => !needle || t.name.toLowerCase().includes(needle))
    .map(([code, t]) => `<div class="watchcard">
        <div class="wc-head"><img src="${FLAG(t.flag, 40)}" alt="" loading="lazy"><span class="wc-name">${t.name}</span></div>
        <ul>${(BROADCASTERS[code] || ["Check local listings"]).map((c) => `<li>${c}</li>`).join("")}</ul>
      </div>`)
    .join("");
  $("#watch-grid").innerHTML = cards || `<div class="empty-day">No country matches "${q}".</div>`;
}

/* =====================================================
   boot
   ===================================================== */
/* Merge auto-synced results (written by the GitHub Action into scores.json)
   over the matches before anything renders. Fails silently if the file
   doesn't exist yet — the site then runs purely off data.js. */
async function loadLiveScores() {
  try {
    const res = await fetch("scores.json", { cache: "no-store" });
    if (!res.ok) return;
    const scores = await res.json();
    for (const [id, s] of Object.entries(scores)) {
      const m = MATCHES.find((x) => x.id === Number(id));
      if (!m) continue;
      if (Array.isArray(s) && s.length === 2) {
        m.score = s; // final
      } else if (s && s.live && Array.isArray(s.score)) {
        m.liveScore = s.score; // in-progress snapshot — shown on the ticket,
        m.liveAsOf = s.asOf;   // but never fed into standings/ratings
        m.liveClock = s.clock;
      }
    }
  } catch {
    /* offline / local preview — no problem */
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadLiveScores();
  refreshModel();

  // tabs — each switch re-renders that view so the live model stays current
  $$(".tab").forEach((tab) =>
    tab.addEventListener("click", () => {
      $$(".tab").forEach((t) => t.classList.remove("active"));
      $$(".view").forEach((v) => v.classList.remove("active"));
      tab.classList.add("active");
      $(`#view-${tab.dataset.view}`).classList.add("active");
      const v = tab.dataset.view;
      if (v === "schedule") renderSchedule();
      if (v === "map") setTimeout(() => { buildMap(); map.invalidateSize(); renderMarkers(); }, 60);
      if (v === "path") renderPath();
      if (v === "teams") renderTeams();
      if (v === "predictions") renderPredictions();
    })
  );

  // schedule: multi-team picker
  $("#sched-team").innerHTML = TEAM_OPT("", "+ Add a team…");
  $("#sched-team").addEventListener("change", (e) => {
    if (e.target.value) schedF.teams.add(e.target.value);
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
  // stage pills
  $$("#sched-stage .pill").forEach((p) =>
    p.addEventListener("click", () => { schedF.stage = p.dataset.s; renderSchedule(); })
  );
  // quick ranges
  $$("#sched-quick .pill").forEach((p) =>
    p.addEventListener("click", () => { schedF.quick = p.dataset.f; schedF.day = null; renderSchedule(); })
  );
  // clear all
  $("#sched-clear").addEventListener("click", () => {
    schedF = { quick: "upcoming", day: null, teams: new Set(), groups: new Set(), stage: "all" };
    renderSchedule();
  });
  renderSchedule();

  // map filters
  $("#map-team").innerHTML = TEAM_OPT("", "All teams");
  $("#map-city").innerHTML = `<option value="">All cities</option>` +
    Object.entries(VENUES)
      .sort((a, b) => a[1].city.localeCompare(b[1].city))
      .map(([k, v]) => `<option value="${k}">${v.city}</option>`)
      .join("");
  $("#map-team").addEventListener("change", () => map && renderMarkers());
  $("#map-city").addEventListener("change", () => map && renderMarkers());
  $("#map-clear").addEventListener("click", () => {
    $("#map-team").value = "";
    $("#map-city").value = "";
    if (map) { renderMarkers(); map.flyTo([37.5, -96.5], 4); }
  });

  // path
  $("#path-team").innerHTML = TEAM_OPT("USA");
  $("#path-team").addEventListener("change", renderPath);
  $$(".scenario-toggle button").forEach((b) =>
    b.addEventListener("click", () => {
      $$(".scenario-toggle button").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      renderPath();
    })
  );
  renderPath();

  // teams
  $("#teams-team").innerHTML = TEAM_OPT("", "Browse by group");
  $("#teams-team").addEventListener("change", renderTeams);
  $$(".groupnav .pill").forEach((p) =>
    p.addEventListener("click", () => {
      $("#teams-team").value = "";
      $$(".groupnav .pill").forEach((x) => x.classList.toggle("active", x === p));
      renderTeams();
    })
  );
  renderTeams();

  // predictions + watch
  renderPredictions();
  renderWatch();
  $("#watch-search").addEventListener("input", (e) => renderWatch(e.target.value));
});
