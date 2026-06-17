# ⚽ World Cup ’26

A fan-made dashboard for the 2026 FIFA World Cup — June 11 to July 19 across the US, Mexico and Canada. Light, fun, fast: plain HTML/CSS/JS with zero build step.

**Features**
- **Schedule & Results** — clickable June/July calendar on top, then ticket-stub match cards grouped by day. Filter by multiple teams at once (with FIFA ranks), multiple groups, group/knockout stage, or quick ranges (Today / Tomorrow / Next 7 days / Yesterday / All previous) — with one-click Clear. Completed games are color-coded green-gold with FT scores, and filtering by group adds live Standings tables (P/W/D/L/GF/GA/GD/Pts, qualification zones highlighted). The calendar itself reacts to filters, highlighting only the days your selected teams or groups play. Completed games are clickable and jump to the official FOX Sports highlights on YouTube (pin exact video URLs via the optional `yt` field in `js/data.js`). Each ticket shows kickoff in **your timezone + stadium-local time**, flags, ranks, a win-probability bar, and an auto-generated context line driven by live standings (e.g. "Mexico beat South Africa 2–0 — one more win all but books a knockout spot").
- **Stadium Map** — interactive Leaflet map of all 16 venues, filterable by team or city (with one-click Clear); with a team selected, their stops are numbered 1-2-3 in match order.
- **Path to Victory** — pick any team and see every game, date and venue between them and the final at MetLife (win-the-group vs finish-2nd scenarios).
- **Team Rosters** — key players for all 48 squads with age, position and club; browse by group or jump straight to a team.
- **Predictions** — model-based group-winner probabilities plus a live Elo-style power ranking (with movement arrows) and title odds for all 48 teams. The whole model replays every result in data.js, so win bars, group predictions and power ratings shift automatically as the tournament unfolds.
- **Where to Watch** — main broadcasters in every participating country.

**Updating data:** everything lives in `js/data.js` — add a `score: [h, a]` to a match and the standings, match notes, and group predictions all update automatically. Push to GitHub and Vercel redeploys.

**Live scores:** the site is static, so scores flow from `js/data.js` — add `score: [h, a]` to a match and push; results, color-coding, standings, match notes, Elo ratings and predictions all update on deploy. Fully responsive for mobile.

*Unofficial fan project — not affiliated with FIFA. Odds and predictions are approximate and not betting advice.*
