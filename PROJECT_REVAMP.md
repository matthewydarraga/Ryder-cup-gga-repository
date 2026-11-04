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

Implemented on `codex/project-revamp-step-2`.

- Changing players or team size requires a deliberate keep-results/fresh-scorecard choice, a reason, and a confirmation. Point-only edits retain their existing workflow.
- Each change stores the previous lineup, point settings and full effective scorecard, the new lineup, reason, owner identity, recorded time and revision. The match view includes a read-only history. Historical results do not count twice in standings.
- Server transactions read all 18 previous hole documents, including absent/cleared entries. Concurrent participant corrections trigger a retry so the saved history and retained baseline use the latest results.
- Every changed lineup receives a fresh match ID. Old matchup permissions are deactivated atomically with the new lineup and shared/private revisions. Removed players cannot score either the old match or a new matchup they are not in; new participants can score the replacement.
- Repeated changes retain a stable lineage, and complete backups validate/preserve that history. History is limited to 200 changes and shared documents to 900 KB; no silent truncation.
- Existing Firestore rules and Spark services suffice. No production records are automatically changed by deployment.

Validation: `npm test` covers all team sizes, required decisions/reasons, cancellation, owner gating, retained/cleared results, fresh scorecards, history rendering and backup round trips. `npm run test:rules` additionally injects a concurrent player correction during a real emulator transaction, verifies retries preserve it, checks old/new participant permissions and stale-owner rejection. Browser QA made a retained-results substitution in the local mock and opened its recorded previous scorecard. Production owner substitution has not been exercised.

## Next step

Step 3: unify results/statistics so live standings, player records, profiles, recaps and backups use the same scoring calculations. Preserve the intended prior-year basis for draft rankings and isolate practice results from official records.

## Remaining roadmap

Phase 1: unified results/statistics; durable offline scoring; finalization states; score history and undo; form preservation; consistent year/event selection; session/status copy; permission regression tests.

Phase 2: My Match home, sticky team standings and winning target, round/day filters, compact match cards and final margins, one-hole scoring, explicit playing formats, separate owner controls, five bottom destinations, clear strengths/statistics, accessible mobile layouts and direct match links.

Phase 3: courses/tees/tee sheets, alternates and scheduling, readiness checklist, opt-in spectator scores, recaps, announcements, mock reset and event handicap snapshots.

Preserve name + PIN sign-in, the 13-player roster, original photos, tournament archives, and the strictly free Spark plan throughout.
