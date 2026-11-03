# GGA Ryder Cup

Existing static clubhouse UI, 13-player roster, supplied 2026 history, 2027 rankings,
draft and match-play scoring. Hosting remains GitHub Pages. The active entry point
is `index.html`; `app.js` is a legacy app, not loaded by the current page.

The Spark-only implementation uses Firebase email/password Authentication and
Firestore Standard `(default)`. No Cloud Functions, Cloud Storage, Realtime
Database, extensions, Blaze, billing account, or credit card are needed by this
architecture. Cloud configuration still contains placeholders: accounts, rules,
live syncing and deployment are **not verified active**.

See [CLOUD_SETUP.md](CLOUD_SETUP.md) for the exact console checklist and roster
mapping. Do not enable a billing account to complete these steps.

## Accounts and permissions

Players can register their own Firebase email/password account using Create account.
Matthew approves each account by creating its `members/{uid}` roster mapping in the
Firebase console, including his own owner mapping. Signup saves the selected roster name
as the Firebase Auth display name; players no longer send UIDs. Matthew finds the account
in Authentication, verifies its owner and maps its UID, then players sign in again. The
display name is an unverified request, never an authorization claim. Registration grants no
roster or owner access. The browser cannot create membership records, grant roles or
reset another player's password.
Short PINs remain an explicitly local device preview only when Firebase is unconfigured;
they never authenticate Firebase. Configured mode fails closed if setup or sign-in fails.

Members read shared clubhouse/live results and edit only their own profile fields.
Matthew controls official handicaps, draft, teams, archive and both scoring editors.
Changing the dropdown to Matthew never grants owner permissions. Removing or setting
`active:false` on a membership denies subsequent server access, including existing tokens.
Disable the Auth user too when removing an account. There is no public email directory.

## Data and live sync

- `members/{uid}`: console-only grants, each account can fetch its own mapping.
- `public/clubhouse`: historical path name; reads require active membership. Contains
  2026 archive, 2027 settings, draft and `liveCup` agreed-hole results.
- `private/live2027`: legacy owner scoring editor rounds, readable only by owner.
- `profiles/{playerId}`: bounded profile JPEG, legend and ordered strengths. Member reads.

Official aggregates are owner-trusted nested JSON. Rules validate their outer shape,
revision and paired writes; they do not validate every nested match or prevent the
owner from entering incorrect results. Profile validation is field-specific.
Full-document live listeners use no polling. Two owner documents are written atomically
with increasing revisions; stale owner sessions stop rather than overwrite newer edits.
Incoming snapshots do not echo saves. Owner saves are debounced; status distinguishes
unsynced changes, server confirmation, cached data, permission errors and conflicts.
On errors export a backup before reload; an unconfirmed local score is not a server save.

The owner explicitly publishes the first shared record from Owner Studio after export
and review. Imported legacy IDs are mapped to fixed roster IDs while preserving history,
team assignments and draft references. Extra golfers in old imports require manual review;
the shared architecture accepts exactly 13. Backups and GHIN numbers remain device-only.

Photos are cropped to 160×160 JPEG, at most 32,000 data-URL characters per profile.
No cloud photo bucket is used. Cover art is stored in repository assets; existing art and
2026 group photo remain. Large cover uploads are unavailable in cloud mode.

## Scoring and verification

Live Scoring supports 1v1, 2v2, 3v3 and 4v4. Each matchup awards one total point;
a final tie awards half a point per side. Existing live match totals are recalculated
under this rule. Win estimates use current lead and remaining holes, preferring complete
team Handicap Index averages, then complete GGA rating averages, otherwise score only.
This illustrative independent-hole model assumes 30% tied holes and is not calibrated;
it does not model different team formats or handicap stroke allocations.
The owner enters agreed hole winners after applying the group's handicap
and format rules. This feature does not calculate strokes or GHIN allowances. The
legacy match editor retains its existing separate scoring model; do not enter the same
competition in both editors expecting their totals to merge.

Run `npm test` (or the three Node scripts individually). Run `npm install`, then
`npm run test:rules` with Java 21 for emulator authorization tests. Emulator commands
target `demo-gga-spark`, never the production project. CI runs both suites on PRs.
Passing emulator tests is not evidence that production rules have been published.

Keep backups private. Previously downloaded or browser-cached data cannot be revoked.
The static roster and supplied historical notes are still part of this public source
repository. Never commit passwords, private emails, PINs or service-account credentials.
