# ⚽ World Cup ’26

A fan-made dashboard for the 2026 FIFA World Cup — June 11 to July 19 across the US, Mexico and Canada.

**Live features**
- **Schedule** — all 104 matches as ticket-stub cards, grouped by day, with a day-strip calendar and Today / Tomorrow / Next-7-days filters. Kickoffs auto-convert to your timezone. Flags, FIFA ranks, stage tags, and win-probability bars on every ticket.
- **Stadium Map** — interactive Leaflet map of all 16 venues; tap a marker for that stadium's matches.
- **Path to the Trophy** — pick any of the 48 teams and see the exact games, dates and venues between them and the final at MetLife on July 19 (win-the-group and finish-2nd scenarios).
- **Predictions** — live title odds + implied probabilities for all 48 teams.
- **Where to Watch** — main broadcasters in every participating country (FOX/Telemundo in the US).
- **Teams & Rosters** — key players for all 48 squads, browsable by group.

**Stack:** plain HTML/CSS/JS, zero build step. Deploys on Vercel as a static site.

**Updating data:** everything lives in `js/data.js` — scores, odds, rosters, broadcasters. Edit and push; Vercel redeploys automatically.

*Unofficial fan project — not affiliated with FIFA. Odds shown are approximate and not betting advice.*
