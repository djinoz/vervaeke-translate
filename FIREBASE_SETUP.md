# Firebase setup for Vervaeke Translate

This guide is adapted from the Firebase setup patterns already used in sibling projects, especially:
- `~/projects/geodesic/FIREBASE_SETUP.md`
- `~/projects/openclaw-explorer/README.md`

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
3. Copy the Firebase web config values
4. In this repo:

```bash
cd ~/projects/vervaeke-translate
cp .env.example .env.local
```

5. Fill in `.env.local` with your real values

Required env vars:
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

## 4. Optional but recommended: upgrade plan before trusted backend work
If you plan to use Cloud Functions / Cloud Run for:
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

What they do:
- `firebase.json` points Hosting at `dist/`
- sets SPA rewrites so all routes go to `index.html`
- wires Firestore rules + indexes into deploys

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
A reasonable first pass is:
- `phrases`
- `languages`
- `translations`
- `submissions`
- `activityFeed`

Potential later additions:
- `moderationEvents`
- `rateLimitEvents`
- `emailTokens`

## 14. Security / abuse checklist
Before enabling public submission flows, add:
- CAPTCHA or equivalent human verification
- tarpitting / slowdown for suspicious repeat submission patterns
- request rate limiting
- duplicate phrase / duplicate submission heuristics
- profanity / abuse filtering
- server-side verification before any public visibility change

## 15. Email / approval flow note
For **existing translation suggestions**, the planned behavior is:
- submit → `wait-click`
- user clicks approval link → `contender`

For **brand-new source terms**, the planned behavior is:
- submit → `await-review`
- manual moderator/admin decision required before any corpus inclusion

These transitions must be implemented in trusted server code, not delegated to the client.

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
