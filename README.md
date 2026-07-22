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
  Each match card has a hole-by-hole tracker — anyone can tap who won each
  hole (or halve it) as it's played, and the live status ("2 UP thru 11")
  updates for everyone watching. Once a match is mathematically decided
  (closes out early, e.g. "3&2", or finishes all square/up thru 18), it waits
  for the commissioner to confirm before the Ryder Cup point is actually
  awarded — see Commissioner Access below.
- **Leaderboard** — live team totals, a progress bar of points decided, a
  clinch banner once a team clears the majority, and a match-by-match
  breakdown that shows in-progress matches with their live status, not just
  finished ones.
- **Commissioner Access** — anyone can tap in live hole-by-hole scores, but
  only devices unlocked with a PIN can confirm a match's final result or
  award its point. Set a PIN once in Settings (the device you set it on
  unlocks automatically); everyone else enters that same PIN to unlock their
  own device if they ever need to. Leave it unset and it's open to everyone,
  same as before. This is a lightweight, friendly gate — anyone comfortable
  poking around browser dev tools could bypass it — not real security, just
  enough to stop an honest mistake or an overeager teammate from awarding a
  point early.
- **Settings** — rename both teams, set the tournament date/location, toggle
  the cream/navy theme, set a live-sync room code, and export/import a JSON
  backup.

## Enable live sync

By default every device keeps its own local copy (via `localStorage`) — great
for one person running the show, but other groups on the course won't see
each other's scores update. Wiring up a free Firebase Realtime Database turns
on live sync so every phone using the same room code sees updates within a
second or two.

1. Go to the [Firebase console](https://console.firebase.google.com/), sign
   in with any Google account, and create a new project (no credit card
   needed — the free Spark plan covers this easily).
2. In the project, open **Build → Realtime Database** and click **Create
   Database**. Choose any region, and start in **test mode** for now.
3. Test mode auto-locks after 30 days. Open the **Rules** tab and replace the
   rules with:
   ```json
   { "rules": { ".read": true, ".write": true } }
   ```
   This keeps it open to anyone with the database URL — fine for a private
   friend league where nothing sensitive is stored (just names and scores),
   but worth knowing.
4. Go to **Project settings** (gear icon) → **General** → scroll to **Your
   apps** → click the web icon (`</>`) to register a web app → copy the
   `firebaseConfig` object it gives you.
5. Paste those values into `firebase-config.js` in this repo, replacing the
   `REPLACE_ME` placeholders.
6. Deploy/reload the site. The dot next to the date in the header will turn
   green ("Live") once it connects.
7. In **Settings**, everyone should enter the same **room code** (anything
   you like, e.g. `gga-2026`) — that's what keeps your tournament separate
   from anyone else's if this code is ever reused for another event.

If you skip all of this, the app still works exactly as described above —
each device just keeps its own local copy instead of a shared one.

## Editing the logo

The header artwork lives in `assets/gga-logo-cream.png` (light theme) and
`assets/gga-logo-navy.png` (dark theme), cropped from the original concept art.
