# Activating GGA live accounts and shared draft

**State:** Code is prepared; Firebase provisioning/deployment still requires Matthew to authorize a Firebase project. GitHub Pages alone cannot securely verify PINs or protect private data.

## 1. Establish the cloud project

Connect the **Firebase** app in ChatGPT to your Google/Firebase project so deployment and configuration can be completed from the conversation without manually moving code or downloading Supabase.

In the Firebase project:
- Enable **Cloud Firestore** and **Cloud Storage**.
- Enable **Authentication**, **Google** provider. Add `matthewydarraga.github.io` under authorized domains.
- Enable **Cloud Functions**. Firebase Functions deployments may require upgrading the project to Blaze/pay-as-you-go. Set budget alerts.
- Register a **Web app** and copy its non-secret Firebase config into `firebase-config.js`. This config alone is public; **never** publish admin/service-account credentials.

## 2. Securely identify the owner

Create `functions/.env` with `GGA_OWNER_EMAIL` set to Matthew's verified Google account address (the exact address is not known here). **Do not** commit this file; it is gitignored.

Deploy from the project root (or through a connected Firebase developer tool):

```bash
npm --prefix functions install
firebase login
firebase use --add
firebase deploy --only firestore:rules,firestore:indexes,storage,functions
```

The cloud functions use Node 22 and `us-central1`.

## 3. First owner activation

Open the website and select **Sign in → Matthew Ydarraga**. Enter a new six-to-eight-digit owner PIN, then click **Set up Matthew's verified owner account with Google**. Complete the provider sign-in using the email configured in `GGA_OWNER_EMAIL`.

The server verifies the email before granting the owner claim. After activation, Matthew signs in by PIN.

**Recovery:** An owner PIN cannot be reset by a member; owner recovery must be explicitly designed and verified through the Firebase administrator identity. Do not add a public owner reset endpoint.

## 4. Invite members

In **Owner Studio → Member administration**, choose **Invite** next to each golfer. The server creates a random single-use invitation code valid for 72 hours. Send each code privately; do not post it in the whole-group chat.

Members select their own name on the website, enter the invitation, and create their 6–8 digit PIN. The server verifies the invitation, salts and hashes the PIN, and issues a Firebase custom Auth token.

If a PIN is lost, Matthew uses **Reset PIN** to revoke the account and create a new single-use invitation.

## 5. Verify before sharing

Using an incognito window on a second device:

1. Confirm guest can see the clubhouse, complete 2026 match history and 2027 draft.
2. Confirm guest cannot open Owner Studio, 2027 scoring, Firestore private document or owner-only update endpoints.
3. Invite a test member, create their PIN, sign in and upload a new profile picture.
4. Confirm the new picture appears on a different device without a refresh.
5. Make a draft pick as Matthew and confirm both devices see it.
6. Confirm a normal member cannot write public data or view private 2027 scoring through Firebase network requests.
7. Confirm iPhone Add to Home Screen icons/nav, history and photo cropping.
8. Test a bad PIN five times and confirm account lockout is enforced by Cloud Functions.
9. Restore test draft changes before sharing widely.

Until these pass, do **not** describe the site as a fully shared multi-user app.

## Security architecture

- Public Firestore document: `public/clubhouse` with profiles, archive and 2027 draft (no GHIN number and no 2027 hole scores).
- Private Firestore document: `private/live2027`, readable/writable only by Matthew's verified owner account.
- Player profile photos: Firebase Storage `profile-photos/{playerId}/avatar.jpg`; only that user or Matthew can write it.
- Server-only collections: `accounts/` (scrypt-salted PIN hash + rate-limiting state), `invites/` (one-way hashed 72-hour invite).
- Owner calls and server-side Firestore rules enforce permissions; client-side UI restrictions are not relied on for security.

## Note on handicaps and imagery

The site does not have an authenticated USGA GHIN API. Enter verified values manually and maintain verification dates. LA Tech headshots currently link to externally hosted Louisiana Tech Athletics resources; availability and reuse rights should be confirmed separately.
