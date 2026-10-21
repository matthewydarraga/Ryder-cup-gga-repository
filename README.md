# GGA Ryder Cup — 2027 Clubhouse

A premium, iPhone-friendly home-screen web app for the GGA Ryder Cup. Hosted on GitHub Pages, with an optional invitation-only Firebase backend for private member accounts and real-time cross-device updates.

**Public website:** https://matthewydarraga.github.io/Ryder-cup-gga-repository/

## What is available now

- Midnight-and-gold mobile/desktop clubhouse with alternate owner themes, custom cover, announcements and tournament preview.
- The full 13-person roster, eleven Louisiana Tech Athletics profile/photo links, and editable profile photographs. Jordan and Reid use their own uploads.
- Preserved 2026 results from the organizer: six singles, three scrambles and three shambles, with individual win–loss records. Unknown hole cards, official team allocations and final team points are not invented.
- The 2027 twelve-pick snake draft with six golfers per side and one remaining alternate.
- Power rankings (depend on manually verified handicap values), 50-character fantasy forge, and a protected-in-the-UI Owner Studio for Matthew.
- Browser PWA: use **Share → Add to Home Screen** on iPhone.

### Deployment modes

**Preview mode (currently active until Firebase is configured):** Changes and PIN claims exist only on the current device. The site is public, but owner/member permissions are NOT secure and cannot synchronize. Do not invite all players to manage accounts in this mode.

**Live mode (backend supplied but not yet connected):** Server-verified invitation codes and salted PIN hashes, Firebase Authentication custom tokens, Firestore rules, real-time shared draft/history/handicaps, cloud-stored profile photos and owner-only 2027 scoring.

**Do not claim that secure multi-user accounts work until the Firebase project is provisioned, deployed and tested.**

## Backend activation

Read [CLOUD_SETUP.md](CLOUD_SETUP.md). Requires a Firebase project owned by Matthew, Firestore, Storage, Authentication (Google provider for one-time owner activation), and deployed Cloud Functions. No Supabase installation or App Store approval required.

### Owner permissions after live activation

Matthew signs in using his own six-to-eight-digit PIN after one-time Google verification. He can customize home copy, headlines, accent theme and cover image; edit historical results, 2027 tournament settings and player handicaps; issue/reset player invitations; edit player profiles and manage draft picks and private scoring.

### Member accounts

Every roster member receives a private one-time invite from Matthew, then claims their own member identity and chooses a 6–8 digit PIN. Members can update their photo and select a fantasy avatar. They can view the archive, public draft and stats. Members cannot change team/draft/history/scoring data on the server.

### 2026 archival data source

The match results came from the previously supplied `GGA_Ryder_Cup.html` project. The exact organizers' notes appear in the 2026 History tab. The original app's hole-by-hole cards and final team totals are not supplied and therefore intentionally remain blank.

### Files

- `index.html`: integrated 2027 app, original roster/50 fantasy characters and match engine.
- `premium.css`: premium design system.
- `gga-upgrade.js`: clubhouse preview, 2026 history, draft board and owner editor.
- `gga-cloud.js`: Firebase client adapter that activates only after configuration.
- `functions/index.js`: secure account invitations, PIN verification, owner bootstrap and resets.
- `firestore.rules`, `storage.rules`: server-enforced authorization.
- `firebase-config.js`: public Firebase web project configuration (no private keys).
- `sw.js`, `manifest.webmanifest`: installable PWA and offline support.

**Security:** Never commit Firebase Admin credentials, service account JSON, a Firebase service-role key, or a secret owner PIN. Browser-local restrictions are not a security boundary.
