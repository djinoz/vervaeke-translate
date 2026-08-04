# Vervaeke Translate

A playful but useful web app for translating Vervaeke-isms into something a normal human can parse — or into spoof philosopher voices.

Current state: **real seed-backed prototype**. This repo now contains:
- a Vite + React + TypeScript app scaffold
- a translator-shell UI backed by the recovered seed corpus
- Firebase Hosting / Firestore starter config files
- a project-specific `FIREBASE_SETUP.md` adapted from sibling projects in `~/projects`
- a concrete `FIRESTORE_SCHEMA.md` for terms/translations/sources/suggestions
- Firestore rules and indexes aligned to public-read / trusted-write boundaries

It now includes a **local-only trusted submissions backend** for QA under `functions/`, plus a moderator/admin UI wired to it. It does not yet have a production submission pipeline or real email delivery.

## Product intent
The app should feel like a "Google Translate" lookalike where the user can:
- typeahead a known Vervaeke term or phrase
- translate it into Plain English, French, German, or spoof philosopher modes
- view alternate community suggestions
- submit better translations
- propose entirely new source terms that are not yet in the curated corpus

## Recommended v1 architecture
- **Frontend:** Vite + React + TypeScript
- **Hosting:** Firebase Hosting
- **Data:** Firestore
- **Trusted writes:** Cloud Functions or Cloud Run
- **Public protections:** CAPTCHA / App Check / rate limits / tarpitting
- **State transitions:** server-side only

## Local development
```bash
cd ~/projects/vervaeke-translate
npm install
npm run dev
```

Open the local URL printed by Vite.

## Local submissions backend
```bash
cp .env.backend.example .env.backend.local
npm run backend:dev
```

This starts a local trusted submissions server. It binds to `0.0.0.0` so it is reachable from any device on the same LAN:
- Local: `http://127.0.0.1:8787`
- LAN: `http://<machine-ip>:8787/api/health`

By default it uses JSON-file persistence at `functions/.local-data/submissions.json`. It auto-switches to Firestore when `FIRESTORE_PROJECT_ID` and server-side ADC credentials are set. Email confirmation is always stubbed (approval token returned in the API response) unless a transactional email provider is wired into `functions/server.js`.

To expose the Vite frontend to LAN reviewers:
```bash
npm run dev -- --host
# App available at http://<machine-ip>:5173
```

See [`functions/README.md`](./functions/README.md) for mode details, Firestore prerequisites, and the full QA flow. See [`QA_SUBMISSIONS_LOCAL_BACKEND.md`](./QA_SUBMISSIONS_LOCAL_BACKEND.md) for the tester walkthrough.

For the planned real confirmation flow on existing translation suggestions, see **FIREBASE_SETUP.md → section 15, "Option A (chosen): Firebase Auth email-link confirmation"**.

## Build
```bash
npm run build
```

## Firebase setup
Follow the full guide in:
- [`FIREBASE_SETUP.md`](./FIREBASE_SETUP.md)

That guide was adapted from working sibling-project patterns in:
- `~/projects/geodesic/FIREBASE_SETUP.md`
- `~/projects/openclaw-explorer/README.md`

## Environment config
Use separate files for browser config vs trusted backend runtime:

```bash
# Browser/Vite config only
cp .env.example .env.local

# Trusted backend / local Node server config
cp .env.backend.example .env.backend.local
```

- `.env.local` = Vite/browser config (`VITE_*` only)
- `.env.backend.local` = local trusted backend config (`LOCAL_SUBMISSIONS_*`, `FIRESTORE_PROJECT_ID`, `GOOGLE_APPLICATION_CREDENTIALS`, etc.)
- `npm run backend:dev` now auto-loads `.env.backend.local`
- shell-exported env vars still win over values in `.env.backend.local`

## Important files
- `FIREBASE_SETUP.md` — step-by-step Firebase project setup for this app
- `FIRESTORE_SCHEMA.md` — concrete Firestore collection/document plan for v1
- `firebase.json` — Hosting + SPA rewrites + Firestore config
- `firestore.rules` — public-read / trusted-write rules posture for the planned collections
- `firestore.indexes.json` — starter indexes for `terms` and `translations`
- `src/lib/firebase.ts` — frontend Firebase bootstrap via Vite env vars
- `src/lib/firestoreSchema.ts` — TypeScript collection names + document interfaces
- `data/seed/vervaeke_seed_corpus.json` — initial term corpus recovered from the prior deck plus transcript expansions
- `data/seed/vervaeke_seed_corpus.csv` — spreadsheet-friendly export of the seed corpus
- `data/seed/README.md` — provenance + schema notes for loading the corpus
- `functions/server.js` — local trusted submissions HTTP surface for QA
- `functions/statusMachine.js` — deterministic server-side suggestion status rules
- `functions/repository.js` — repository abstraction: JSON-file store (default) and Firestore-backed store with identical interface

## Corpus note
An initial corpus is now prepared from the earlier Vervaeke deck plus later transcript additions.
It includes optional `origin_background` and `vervaeke_usage` fields because many terms are reactivated from older philosophical or religious traditions rather than simply invented from scratch.
The seed now also includes dedicated enrichment packs for:
- the 4Ps of knowing / 4E cognitive-science lineage
- relevance realization
- reciprocal narrowing / reciprocal opening
- being vs having mode
- super-salience / supersalient

so core Vervaeke cognition vocabulary is directly searchable.

## Corpus maintenance workflow
```bash
npm run corpus:add -- --input data/seed/additions/4p-4e-core-frameworks.json
npm run corpus:add -- --input data/seed/additions/relevance-being-parasitic.json
npm run corpus:add -- --input data/seed/additions/supersalience.json
npm run corpus:bundle
npm run corpus:diff
```

Live push/pull flows are scaffolded too, but they require Firestore admin credentials:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/service-account.json npm run corpus:push
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/service-account.json npm run corpus:pull -- --output data/seed/vervaeke_seed_corpus.from-firestore.json
```

## Durable Firebase deploy auth on this machine
For this repo, `npm run deploy` and `npm run deploy:hosting` now go through `scripts/firebase-auth-wrapper.sh`.

If `~/.hermes/secrets/vervaeke-translate-firebase-cli-hosting-sa.json` exists, the wrapper:
- exports it as `GOOGLE_APPLICATION_CREDENTIALS`
- isolates Firebase CLI state under `~/.cache/firebase-sa-config/vervaeke-translate`
- avoids the broken user-login refresh path that was repeatedly demanding `firebase login --reauth`

That makes hosting deploys work without depending on the interactive Firebase CLI login state for this project.

## Next implementation step
The strongest next slice is now:
1. seed Firestore from `data/seed/vervaeke_seed_corpus.json`
2. swap the frontend from bundled seed import to live Firestore reads
3. add trusted server endpoints for suggestions/new-term proposals
4. add real moderator/admin UI on top of the local-only backend slice
5. swap mock persistence for Firestore-backed trusted writes
6. keep all submission status changes server-side
