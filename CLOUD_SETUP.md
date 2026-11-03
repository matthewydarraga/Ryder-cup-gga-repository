# Spark-only console setup: gga-ryder-cup

These are required activation actions, **not completed or verified by the code change**.
Keep the existing project on Spark. Never choose Blaze, link billing, create a Storage
bucket, deploy Functions, or enable an extension. The application stays in device
preview until the public web config placeholders are filled.

1. Export your current app's all-years JSON backup and keep it private. Confirm the
   2026 history and desired 2027 setup on the device you intend to publish from.
2. In [Project settings](https://console.firebase.google.com/project/gga-ryder-cup/settings/general),
   register a **Web app** if none exists. Copy its `apiKey`, `authDomain`, `projectId`
   and `appId` into `firebase-config.js`. Keep `projectId: 'gga-ryder-cup'`.
   These public web identifiers are not Admin credentials. Do not invent missing values.
3. In [Authentication](https://console.firebase.google.com/project/gga-ryder-cup/authentication/providers),
   enable **Email/Password** only. No phone/SMS, custom tokens or Google bootstrap needed.
   Add `matthewydarraga.github.io` to Authentication → Settings → Authorized domains.
   Add `localhost` only if locally testing sign-in. Configure a strong password policy
   (recommend at least 12 characters) and email enumeration protection where available.
4. Players may use Create account in the app to register their own email/password.
   Their selected roster name is saved as the Auth display name. Matthew verifies the
   account in Authentication and copies its UID for step 7; players need not send IDs.
   Alternatively, Authentication → Users → Add user: provision each roster account using
   the player's real private email and a unique strong temporary password. Use console
   password-reset emails so each player chooses their own password privately. Never
   commit or share an account/password table. The app also offers reset-by-email.
   The browser signup form creates an Auth account only. Auth account creation through the public Auth API
   is not an authorization bypass: accounts without console grants cannot access Firestore.
5. In [Firestore](https://console.firebase.google.com/project/gga-ryder-cup/firestore),
   verify an existing `(default)` database is **Standard edition**. If absent, create
   Standard edition `(default)` in a location suitable for your group, in production
   mode (no test-mode public access). Do not create a second database or enable paid
   backup/PITR/TTL features. The database/edition has not been inspected by this change.
6. Firestore → Rules: replace the existing rules with the repository's `firestore.rules`
   and **Publish**. Alternatively, after authenticated CLI setup use only
   `firebase deploy --only firestore:rules,firestore:indexes --project gga-ryder-cup`.
   Do not run an old deployment command for Functions or Storage.
7. Firestore → Data: create `members` and one document for each Auth UID copied from
   Authentication → Users. Document ID is the exact UID (not email or username).
   Set these four fields with the correct types:

   ```json
   {"username":"matthew.ydarraga","playerId":"player-matthew-ydarraga","role":"owner","active":true}
   ```

   `active` is a boolean. All other fields are strings. Only Matthew has `role:owner`;
   all other mappings use `role:player`. Do not include emails or secrets in documents.
   Keep one UID per player; remove stale grants before replacing an account.

| Player | username | playerId | role |
|---|---|---|---|
| Matthew Ydarraga | matthew.ydarraga | player-matthew-ydarraga | owner |
| Michael Rodriguez | michael.rodriguez | player-michael-rodriguez | player |
| Jake Norris | jake.norris | player-jake-norris | player |
| Brandon Durman | brandon.durman | player-brandon-durman | player |
| Will Parker | will.parker | player-will-parker | player |
| Ryan Higgins | ryan.higgins | player-ryan-higgins | player |
| Jordan McNeely | jordan.mcneely | player-jordan-mcneely | player |
| Reid Mixon | reid.mixon | player-reid-mixon | player |
| Zach Cousar | zach.cousar | player-zach-cousar | player |
| Jack Abraham | jack.abraham | player-jack-abraham | player |
| Peyton Braswell | peyton.braswell | player-peyton-braswell | player |
| Nate Cox | nate.cox | player-nate-cox | player |
| Kody Russey | kody.russey | player-kody-russey | player |

8. Merge/release the reviewed static code through GitHub Pages. Sign in as Matthew,
   verify the local 2026/2027 content, then Owner Studio → **Publish first shared
   clubhouse from this device**. Nothing auto-uploads the first local record.
   Do not hand-create `public/clubhouse` or `private/live2027`.
9. Verify two separate browsers/devices: owner updates appear for a player; a player
   edits only their own photo/strengths/legend; owner-only tabs are unavailable to the
   player; a guest/unlisted UID cannot read shared Firestore. Try a score correction
   and verify it after reload. Verify revoked `members.active:false` denies existing
   sessions. Confirm 2026 supplied results and 2027 rankings/draft still render.
10. Watch Firestore Usage and Authentication quotas during rehearsal. Keep Spark;
    quota errors should prompt waiting/reducing usage, never billing activation.

## Existing cloud data

If this project has old deployed Functions, manually delete them in the console
before sharing; removing source does not remove deployed services. Old `/accounts`
and `/invites` are now denied by rules; export privately and remove legacy credential
hashes if they exist. This migration has not inspected or deleted server data.
An old shared schema/revision must be privately backed up and migrated before first
publication; do not overwrite an unknown existing record. If a legacy Storage bucket
exists, publish the repository's deny-all `storage.rules` through its console without
upgrading billing. The new app never requests Storage access.

## Quotas and limits

Firestore's documented free allowance is 50,000 reads and 20,000 writes/day, with
1 GiB storage for one eligible database. These are quotas, not a guaranteed workload
capacity. For example, 324 recorded holes × 13 connected members is roughly 4,212
shared snapshot deliveries plus owner private reads, transaction reads, rule-dependent
membership reads, profile traffic and reconnects. Test actual usage; no polling is used.

Firebase references: [pricing plans](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans),
[Firestore quotas](https://firebase.google.com/docs/firestore/quotas),
[password authentication](https://firebase.google.com/docs/auth/web/password-auth),
[Storage billing requirement](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024).
Storage requires Blaze; that is why this implementation uses bounded Firestore photos
and repository cover assets instead.
