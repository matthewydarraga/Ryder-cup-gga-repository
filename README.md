# GGA Ryder Cup — Lake Charles 2026

A single-page site for the Ghengis Golf Association's internal 6v6 Ryder Cup.

No build step, no backend — open `index.html` in a browser, or serve the folder
with any static file server (e.g. GitHub Pages). All data (rosters, matches,
scores, team names) is saved to the browser's `localStorage`, so it persists
across reloads on the same device.

## Features

- **Draft Board** — a 12-golfer pool, snake-style on-the-clock indicator, and
  two 6-man rosters. Golfer names are editable inline; add or remove golfers
  freely before or during the draft.
- **Matches** — 3 rounds worth 12 total points:
  1. Round 1: Singles (1v1 match play) — 6 matches
  2. Round 2: Scramble (2v2 match play) — 3 matches
  3. Round 3: Shamble (2v2 match play) — 3 matches
  Each match lets you pick the golfers from each roster and record Win / Halve / Loss.
- **Leaderboard** — live team totals, a progress bar of points decided, a
  clinch banner once a team clears the majority, and a full match-by-match
  breakdown.
- **Settings** — rename both teams, set the tournament date/location, toggle
  the cream/navy theme, and export/import a JSON backup to sync across devices.

## Editing the logo

The header artwork lives in `assets/gga-logo-cream.png` (light theme) and
`assets/gga-logo-navy.png` (dark theme), cropped from the original concept art.
