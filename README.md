# Vervaeke Translate

A playful but useful web app for translating Vervaeke-isms into something a normal human can parse — or into spoof philosopher voices.

Current state: **real seed-backed prototype**. This repo now contains:
- a Vite + React + TypeScript app scaffold
- a translator-shell UI backed by the recovered seed corpus
- Firebase Hosting / Firestore starter config files
- a project-specific `FIREBASE_SETUP.md` adapted from sibling projects in `~/projects`
- a concrete `FIRESTORE_SCHEMA.md` for terms/translations/sources/suggestions
- Firestore rules and indexes aligned to public-read / trusted-write boundaries

It still does **not** yet contain the real submission pipeline, moderation tooling, or trusted backend endpoints.

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
Copy the example file and fill in your Firebase web app config:

```bash
cp .env.example .env.local
```

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

## Corpus note
An initial corpus is now prepared from the earlier Vervaeke deck plus later transcript additions.
It includes optional `origin_background` and `vervaeke_usage` fields because many terms are reactivated from older philosophical or religious traditions rather than simply invented from scratch.

## Next implementation step
The strongest next slice is now:
1. seed Firestore from `data/seed/vervaeke_seed_corpus.json`
2. swap the frontend from bundled seed import to live Firestore reads
3. add trusted server endpoints for suggestions/new-term proposals
4. add moderation/admin tooling
5. keep all submission status changes server-side
