# Project Revamp

## Step 1 — Complete backups and restore

Deployed through PR #5 (merge `8e482e1243429735f3a42d3f6a61b3bdf40f8a15`).

- A versioned JSON envelope captures server clubhouse data, 2026 history, legacy owner rounds, draft/settings, profiles, current/practice matchups, and all live score records. Effective hole arrays include server corrections and explicit cleared results.
- Uploaded player photos, strengths, and manual stats are included. Repository-hosted portraits and recap photos remain linked assets maintained by GitHub. Firebase login identities, memberships, passwords and PINs are deliberately excluded; restore never changes them.
- Server reads are compared twice and retried on observed changes. Offline or unstable capture fails instead of exporting an incomplete browser cache.
- SHA-256 detects accidental changes; it is an integrity check, not an author signature. Schema, roster, project, version, size, points, holes and profile fields are validated. Legacy files cannot silently replace shared data.
- Owner preview shows coverage before confirmation. Restore requires current rounds to be paused. A recovery JSON downloads before applying a restore.
- Restore writes clubhouse/private revisions, all player profiles and matchup permissions in one atomic transaction. Fresh match IDs protect restored hole baselines from pre-restore score documents. Old score documents remain retained; old matchup permissions are deactivated. Raw archived cloud records remain in the backup for recovery and are not replayed as active matches.
- Restored rounds stay paused. The owner reviews them and starts scoring through Live. Revision/profile/metadata changes after preview abort the restore.
- The initial implementation supports existing server-persisted 2026/2027 data. The 2025 recap and repository photos are static assets preserved by the deployment, not embedded into JSON. Future server-backed seasons are a later data-model task.
- Limits: 20 MB input, 900 KB shared clubhouse, and 450 transaction writes. Oversized restores are rejected before writing.
- No Firestore rule changes, billing changes, new services or production data migration are required.

Validation: `npm test` includes the full backup round trip, damaged/unsupported/legacy files, explicit null holes, profiles, stale previews, concurrency guards, atomic commit failure and owner gating. `npm run test:rules` additionally tests a real Firestore emulator export/restore and scoring a restored matchup after reopening it, using the existing rules.

Browser QA: owner backup controls render in the local development preview. A production export/restore with the owner's signed-in app account has not been performed; tests restore only disposable emulator data.

## Step 2 — Safe lineup changes and substitutions

Deployed through PR #6 (merge `ebf941c02884981dd690354535de5971f18fd2d1`).

- Changing players or team size requires a deliberate keep-results/fresh-scorecard choice, a reason, and a confirmation. Point-only edits retain their existing workflow.
- Each change stores the previous lineup, point settings and full effective scorecard, the new lineup, reason, owner identity, recorded time and revision. The match view includes a read-only history. Historical results do not count twice in standings.
- Server transactions read all 18 previous hole documents, including absent/cleared entries. Concurrent participant corrections trigger a retry so the saved history and retained baseline use the latest results.
- Every changed lineup receives a fresh match ID. Old matchup permissions are deactivated atomically with the new lineup and shared/private revisions. Removed players cannot score either the old match or a new matchup they are not in; new participants can score the replacement.
- Repeated changes retain a stable lineage, and complete backups validate/preserve that history. History is limited to 200 changes and shared documents to 900 KB; no silent truncation.
- Existing Firestore rules and Spark services suffice. No production records are automatically changed by deployment.

Validation: `npm test` covers all team sizes, required decisions/reasons, cancellation, owner gating, retained/cleared results, fresh scorecards, history rendering and backup round trips. `npm run test:rules` additionally injects a concurrent player correction during a real emulator transaction, verifies retries preserve it, checks old/new participant permissions and stale-owner rejection. Browser QA made a retained-results substitution in the local mock and opened its recorded previous scorecard. Production owner substitution has not been exercised.

## Step 3 — Unified results and player statistics

Deployed through PR #7 (merge `f9f3e795f6e26d1be3018f6a2b6e2218309a500b`).

- `results-core.js` is the shared read-only scoring model for Live, player statistics, player cards/profiles, prior-year draft rankings, 2026 recap records and complete-backup materialization/summary.
- 2027 official results use live matchups only. The old independent 2027 owner scoring editor now directs the owner to Live; its legacy data remains preserved in backups. Practice rounds are explicitly filtered out of official records. Archived substitution snapshots do not add appearances or points; a retained-results substitution credits the current official lineup.
- All server hole overrides, including explicit clears, flow through the same effective scorecard. Confirmed local/remote score changes refresh all result consumers without writing derived totals back to Firestore. A focused profile input is not rebuilt by a score refresh.
- Profiles and statistics follow the selected year. Profiles show pending full matches, decided-match win rates (ties count half), split player point credit and decided credit. Partial matches do not count as full-match wins or losses.
- Team points are divided among teammates for player credit so a team result is not counted multiple times. Displayed credit is rounded to three decimal places. Official team totals retain their exact configured point values.
- The historical 2026 scoring weights and seeded records/margins are preserved. Missing nine-hole cards and team assignments are not fabricated. Manual tied matches now consistently credit a half result. The recorded handicap-benchmark loss remains a distinct historical case.
- 2027 draft rankings continue to use 2026 results and current manually entered handicaps; current/practice 2027 scoring does not change those prior-year results.
- No rule, billing, service or production-data migration is required. Final score locking remains the later finalization step.

Validation: `npm test` includes golden 2026 records, original margins, benchmark/tie handling, 1v1–4v4 point allocation, pending/corrected/cleared results, paused rounds, practice/history exclusion, prior-year ranks, backup round trips, profile markup, and remote score refresh without write echo. Existing emulator permission/backup/substitution checks pass. Local browser QA created a disposable official-results round: five hole wins secured one front-nine point; Live, statistics and Matthew's profile agreed while the overall match remained in progress. Production scoring was not modified during testing.

## Step 4 — Durable offline score entry

Implemented on `codex/project-revamp-step-4`.

- `offline-scores.js` stores pending hole edits in localStorage, isolated by Firebase project and account UID. A successful device save is required before reporting that a score is queued. Reload recovers interrupted sends and retains pending/conflict/blocked edits.
- After signing in online and receiving the live setup/scorecard, players can keep entering scores during a connection drop. Reconnecting, receiving server snapshots, or pressing Retry resumes the queue; temporary failures retry while the app is open. A fresh offline launch cannot authenticate or receive a fresh setup: reopen online and sign in to the same account to resume saved edits. No service-worker background sync or guaranteed operation after clearing browser data/private browsing is claimed.
- Pending edits display their match, hole, selected side/tie/clear, and status above the app. Confirmed standings/statistics remain separate until the server confirms the score. Conflicts require reviewing the displayed server result and explicitly choosing to replace it or discarding the queued edit.
- Each replay transaction rereads match permissions and the hole. It checks the original winner and exact server timestamp; a different newer result is never overwritten automatically. An identical desired result is treated as already satisfied, making retries safe after a lost acknowledgement. Fresh lineup IDs, paused matches and removed participants block stale queued edits.
- Multiple unsent changes to one hole coalesce while preserving the original comparison. Sending/conflicted edits cannot be silently replaced. Sign-out, backup restore and lineup changes wait for the local queue to be resolved. Web Locks prevent two modern browser tabs scoring from the same account simultaneously; use one scoring tab on older browsers without this API.
- No credentials are stored in the outbox. No Firestore rules, services or billing changes are required. Pending edits are device recovery data, not part of a confirmed complete-cloud backup.

Validation: `npm test` covers reload/interrupted-send recovery, per-account isolation, reconnect replay, unavailable storage, coalescing, conflict holds/explicit retry, clears, paused permissions, and duplicate flushes. The existing full Firestore emulator suite passes. Local browser QA used disposable SDK data to queue a hole while disconnected, reconnect with a conflicting result, reload with the conflict intact, and explicitly resolve it to server confirmation. No production score was changed by testing.

## Next step

Step 5: finalization states. Add explicit round/match completion and owner-controlled locking/reopening, keeping queued score handling and participant permissions consistent.

## Remaining roadmap

Phase 1 remaining: finalization states; score history and undo; form preservation; consistent year/event selection; session/status copy; permission regression tests.

Phase 2: My Match home, sticky team standings and winning target, round/day filters, compact match cards and final margins, one-hole scoring, explicit playing formats, separate owner controls, five bottom destinations, clear strengths/statistics, accessible mobile layouts and direct match links.

Phase 3: courses/tees/tee sheets, alternates and scheduling, readiness checklist, opt-in spectator scores, recaps, announcements, mock reset and event handicap snapshots.

Preserve name + PIN sign-in, the 13-player roster, original photos, tournament archives, and the strictly free Spark plan throughout.
