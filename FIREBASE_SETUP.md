# Firebase setup for Vervaeke Translate

It is tailored to **Vervaeke Translate**, which has different constraints:
- public read-heavy UI
- no end-user login required in v1
- public submissions for suggestions and new-source phrases
- moderation and publication states that must be enforced **server-side only**

## Recommended Firebase shape
For v1, use:
- **Firebase Hosting** for the frontend
- **Cloud Firestore** for phrases, languages, translations, suggestions, and moderation records
- **Cloud Functions or Cloud Run** for trusted mutation endpoints
- **reCAPTCHA / App Check / rate limiting** for public submissions

Do **not** rely on direct client writes for authoritative moderation or publication state transitions.

## 0. Prerequisites
Install / verify:

```bash
node -v
npm -v
firebase --version
```

If Firebase CLI is missing:

```bash
npm install -g firebase-tools
```

Then log in:

```bash
firebase login
```

## 1. Create the Firebase project
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project. Suggested project ID / name:
   - `vervaeke-translate`
3. If prompted about Google Analytics, you can leave it off for now.

## 2. Enable Cloud Firestore
1. In Firebase Console, open **Firestore Database**
2. Click **Create database**
3. Choose **Native mode**
4. Start in **production mode**
5. Pick a region you can live with long-term

## 3. Register the web app
1. In **Project settings** → **Your apps**
2. Add a **Web app**
## 3. Add frontend/browser env vars

Copy the browser example and fill in the Firebase web app config:

```bash
cd ~/projects/vervaeke-translate
cp .env.example .env.local
```

Fill in `.env.local` with your real `VITE_FIREBASE_*` values.

## 4. Add backend/server env vars

Copy the backend example and fill in trusted runtime values:

```bash
cd ~/projects/vervaeke-translate
cp .env.backend.example .env.backend.local
```

Put backend-only values here, such as:
- `LOCAL_SUBMISSIONS_ADMIN_SECRET`
- `LOCAL_SUBMISSIONS_EMAIL_MODE`
- `FIRESTORE_PROJECT_ID`
- `GOOGLE_APPLICATION_CREDENTIALS`

Do **not** put trusted backend secrets in `.env.local`; that file is for Vite/browser config only.

## 5. Optional but recommended: upgrade plan before trusted backend work

- moderation actions
- email sending
- server-side publication transitions
- CAPTCHA verification
- rate-limit enforcement

…you will likely want the **Blaze** plan before long.

For the initial frontend + Firestore + Hosting wiring, you can start smaller, but the real product shape assumes trusted backend endpoints.

## 5. Create the local Firebase project mapping
In this repo:

```bash
cd ~/projects/vervaeke-translate
firebase use --add
```

When prompted:
- choose the Firebase project you just created
- set it as the default project for this repo

This will create a local `.firebaserc`.

A checked-in example lives at:
- `.firebaserc.example`

## 6. Review the included Firebase config files
This repo already includes:
- `firebase.json`
- `firestore.rules`
- `firestore.indexes.json`
- `FIRESTORE_SCHEMA.md`

What they do:
- `firebase.json` points Hosting at `dist/`
- sets SPA rewrites so all routes go to `index.html`
- wires Firestore rules + indexes into deploys
- `FIRESTORE_SCHEMA.md` defines the concrete `terms`, `translations`, `sources`, `suggestions`, and `moderation_events` model for v1

## 7. First local run
```bash
cd ~/projects/vervaeke-translate
npm install
npm run dev
```

This confirms the frontend scaffold works locally.

## 8. First production build
```bash
npm run build
```

This should create a `dist/` directory.

## 9. Initialize Hosting if needed
If `firebase.json` is already present, you may not need a full interactive `firebase init hosting`.

If you do run it, use these answers:

```bash
firebase init hosting
```

Recommended answers:
- **Use an existing project**
- select your `vervaeke-translate` project
- **public directory:** `dist`
- **single-page app rewrite to /index.html?** → `y`
- **automatic GitHub builds?** → `N` for now
- **overwrite existing files?** → `N` when the repo already contains the intended config

## 10. First deploy
After the build succeeds:

```bash
npm run deploy:hosting
```

Or full Firebase deploy:

```bash
npm run deploy
```

## 11. Verify the hosted app
After deploy, verify:
1. `/` loads successfully
2. a deep link route also works once you add routes later
3. the SPA rewrite is working

Because this app will likely use client-side routing, the Hosting rewrite in `firebase.json` is important.

## 12. Firestore rules posture for this app
The checked-in `firestore.rules` is intentionally conservative starter policy, not final production policy.

The long-term model should be:
- public reads only where intended
- direct browser writes **not** trusted for moderation/publication state
- all status transitions such as:
  - `wait-click`
  - `await-review`
  - `contender`
  - `current`
  - `replaced`
  - `hidden-inappropriate`
  - `hidden-owner-deleted`
  - `rejected-unworthy`
  happen via trusted backend code only

## 13. Suggested collection model
The repo now defines a concrete first pass in `FIRESTORE_SCHEMA.md`:
- `terms`
- `translations`
- `sources`
- `suggestions`
- `moderation_events`

Important split:
- `translation` = short user-facing decoding
- `originBackground` = historical / etymological / philosophical origin
- `vervaekeUsage` = how he bends or revives the term

## 14. Security / abuse checklist
Before enabling public submission flows, add:
- CAPTCHA or equivalent human verification
- tarpitting / slowdown for suspicious repeat submission patterns
- request rate limiting
- duplicate phrase / duplicate submission heuristics
- profanity / abuse filtering
- server-side verification before any public visibility change

## 15. Email / approval flow note
For **existing translation suggestions**, the chosen direction is now:
- use **Firebase Auth email-link** for the confirmation click
- treat the click as proof the submitter controls the email address
- then promote the suggestion from `wait-click` → `contender` in **trusted server code**

For **brand-new source terms**, the planned behavior remains:
- submit → `await-review`
- manual moderator/admin decision required before any corpus inclusion

These transitions must be implemented in trusted server code, not delegated to the client.

### Option A (chosen): Firebase Auth email-link confirmation
This is the preferred path because it uses Firebase/Google's built-in auth email delivery instead of adding SMTP or a third-party transactional provider.

Important constraint:
- Firebase Auth can send **auth emails** (email-link sign-in, verification, password reset).
- It does **not** send arbitrary custom product emails.
- So this flow must be framed as: "confirm your email / continue with email link" rather than a fully custom mailer.

#### What to enable in Firebase Console
1. Go to **Authentication** → **Sign-in method**
2. Enable **Email/Password**
3. Enable **Email link (passwordless sign-in)**
4. Go to **Authentication** → **Settings** → **Authorized domains**
5. Add every host that may appear in the email-link continue URL:
   - `localhost`
   - your current LAN host, e.g. `192.168.86.11`
   - Firebase Hosting domain (for example `vervaeke-translate.web.app`)
   - any custom domain later

Important:
- the app currently builds the continue URL from `window.location.href`
- so if you open the app at `http://192.168.86.11:5173/`, Firebase Auth will try to send the user back to host `192.168.86.11`
- the port does **not** go in Authorized domains; add only the host/domain name
- if Firebase Console refuses a raw IP host in your project, use an allowlistable hostname instead (for example the Firebase Hosting domain, `localhost`, or a local DNS alias such as a `nip.io`/`sslip.io` name pointed at this machine)
6. Go to **Authentication** → **Templates**
7. Customize the **Email link sign-in** template

#### ADC quickstart for the trusted backend
The browser `VITE_FIREBASE_*` vars are **not enough** for the trusted finalization endpoint. The server also needs **Application Default Credentials (ADC)** so Admin SDK can verify Firebase ID tokens and write the final status change.

Use **one** of these:

**Option 1 — easiest on your dev machine**
```bash
gcloud auth application-default login
gcloud auth application-default set-quota-project vervaeke-translate
```

**Option 2 — explicit service account file**
```bash
export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
```

Quick verification:
```bash
gcloud auth application-default print-access-token >/dev/null && echo ADC_OK
```

Then start the backend with either `.env.backend.local` populated or explicit shell overrides:
```bash
cd ~/projects/vervaeke-translate
npm run backend:dev
```

If you prefer shell overrides instead of `.env.backend.local`:
```bash
export FIRESTORE_PROJECT_ID=vervaeke-translate
export LOCAL_SUBMISSIONS_EMAIL_MODE=firebase-auth-email-link
npm run backend:dev
```

Expected health result once ADC is working:
- `repositoryKind: "firestore"`
- `emailMode: "firebase-auth-email-link"`
- `emailLive: true`
- `emailBlocker: null`

If ADC is missing/bad, the backend now falls back honestly to:
- `emailMode: "stubbed"`
- `emailLive: false`
- `emailBlocker: "Firebase Auth init failed: ..."`

#### App / server responsibilities
Use this split:

**Client:**
- collect suggestion details plus submitter email
- create the suggestion record in `wait-click`
- call `sendSignInLinkToEmail(...)` with an `ActionCodeSettings` continue URL that points back to the app with the suggestion ID encoded in state
- store the submitter email locally so the browser can complete sign-in after the link round-trip

**Trusted server / Functions:**
- expose a callable or HTTP endpoint that finalizes the suggestion
- require a valid Firebase ID token from the just-completed email-link sign-in
- verify the authenticated email matches the suggestion's submitter email
- only then transition `wait-click` → `contender`
- reject mismatches, expired state, reused confirmations, or already-transitioned records

#### Minimal implementation outline
1. Create suggestion in trusted backend with status `wait-click`
2. Return `suggestionId` to the client
3. Client sends Firebase Auth email link to the same email address
4. Email link returns the user to the app
5. App completes sign-in with `signInWithEmailLink(...)`
6. App sends Firebase ID token + `suggestionId` to trusted backend
7. Trusted backend verifies email ownership and performs `wait-click` → `contender`
8. Optionally sign the user out immediately after confirmation if you do not want a persistent signed-in UX

#### Moderator/admin transitions
Trusted moderation transitions use the backend endpoint:
- `POST /api/suggestions/:id/transition`
- required header: `x-local-admin-secret`

Current behavior:
- the backend currently defaults `LOCAL_SUBMISSIONS_ADMIN_SECRET` to `local-dev-secret` if you do not override it
- the moderator UI should start with an empty secret field; you must paste the active secret before transitions unlock
- if you leave the backend on the default dev secret, typing `local-dev-secret` will work
- for any serious/shared environment, set your own `LOCAL_SUBMISSIONS_ADMIN_SECRET` before starting the backend

Example:
```bash
export LOCAL_SUBMISSIONS_ADMIN_SECRET='replace-this-with-a-real-secret'
npm run backend:dev
```

#### What this replaces
If you implement Option A fully:
- you do **not** need a custom confirmation email sender for existing translation suggestions
- you do **not** need SendGrid just for that confirmation click
- you may still want a general-purpose mail provider later for moderator notifications, digests, or non-auth emails

#### What stays separate
- `VITE_FIREBASE_*` = browser Firebase config only
- Firestore trusted writes = server-side Admin SDK / Functions credentials
- Firebase Auth email-link sending = configured in Authentication, not in the Firestore env

#### Honest limitation
Option A is a product-shape decision, not just a transport swap:
- the confirmation email is now an **auth email flow**
- the app should present it as "confirm via secure email link" rather than pretending a custom mailer exists

## 16. Useful commands
```bash
# local dev
npm run dev

# production build
npm run build

# preview built app
npm run preview

# deploy hosting only
npm run deploy:hosting

# deploy hosting + firestore config
npm run deploy

# list Firebase projects
firebase projects:list

# list Hosting sites
firebase hosting:sites:list
```

## 17. Troubleshooting
### `Firebase: Error (auth/unauthorized-domain)`
Add your deployment domain in Firebase Console → Authentication → Settings → Authorized domains.

### Firestore permission errors
Expected until the app and rules are aligned. Check `firestore.rules` and whether the attempted write should really be happening from the client.

### Hosting deploy works but routes 404
Check the SPA rewrite in `firebase.json`.

### Build fails
Run:

```bash
npm install
npm run build
```

again and inspect the actual TypeScript/Vite error.

## 18. What to do next after setup
Once Firebase is connected, the next sensible implementation sequence is:
1. define the collections and route map
2. wire `src/lib/firebase.ts` into the app
3. build the translator shell
4. add read-only seeded corpus rendering
5. add trusted server-side submission endpoints
