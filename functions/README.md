# Local trusted submissions backend

This folder contains the **local trusted backend slice** for Vervaeke Translate.

Current shape:
- local Node HTTP server (binds to `0.0.0.0` for LAN access)
- Firestore-aligned repository interface
- JSON-file persistence by default; Firestore when credentials are present
- **two confirmation modes** for existing-term suggestions:
  - `stubbed` — local approval token returned in the response
  - `firebase-auth-email-link` — client sends a real Firebase Auth email link; server finalizes only after verifying the Firebase ID token
- deterministic server-side suggestion status machine

## What is implemented
- `POST /api/suggestions/translation`
  - accepts an existing-term translation improvement
  - always stores initial status `wait-click`
  - ignores any client-supplied `status`
  - stores `submitterNickname`
  - in `stubbed` mode returns `localEmailStub` with the approval token/path
  - in `firebase-auth-email-link` mode returns `localEmailStub: null`
- `POST /api/suggestions/new-term`
  - accepts a brand-new source-term proposal
  - always stores initial status `await-review`
  - ignores any client-supplied `status`
  - stores `submitterNickname`
  - returns `localEmailStub: null`
- `POST /api/suggestions/:id/confirm`
  - stubbed email-click stand-in (POST with token in body — not a direct browser link)
  - moves `wait-click` → `contender` only when the approval token matches
- `POST /api/suggestions/:id/finalize-email-link`
  - Firebase Auth confirmation finalizer
  - requires a valid Firebase ID token from a just-completed email-link sign-in
  - verifies the authenticated email matches the suggestion submitter email hash
  - then moves `wait-click` → `contender`
- `POST /api/suggestions/:id/transition`
  - admin/testing endpoint
  - requires `x-local-admin-secret` header
  - enforces allowed server-side transitions
- `GET /api/suggestions`
  - list/filter helper (`kind`, `status`, `termSlug` query params)
- `GET /api/suggestions/:id`
  - detail lookup with moderation events
- `GET /api/suggestion-statuses`
  - enumerates statuses and allowed next steps
- `GET /api/health`
  - readiness + current storage/confirmation mode report

## Statuses
- `wait-click` — awaiting submitter email confirmation
- `contender` — confirmed, in moderator queue
- `await-review` — new-term proposal awaiting moderator review
- `current` — approved, live
- `replaced` — superseded by a better translation
- `rejected-unworthy` — rejected by moderator
- `hidden-inappropriate` — hidden for content reasons
- `hidden-owner-deleted` — removed by submitter request

## Run locally

From the repo root:

```bash
npm run backend:dev
```

The server binds to `0.0.0.0`, so it is reachable from any device on the same LAN:
- Local: `http://127.0.0.1:8787`
- LAN: `http://<machine-ip>:8787`

Find the machine IP:

```bash
ipconfig getifaddr en0   # macOS Wi-Fi
```

## Checking current mode

The health endpoint reports exactly what is active:

```bash
curl -s http://127.0.0.1:8787/api/health | jq '{repositoryKind, emailMode, firestoreAvailable, firestoreBlocker, emailLive, emailBlocker}'
```

Field guide:

| Field | Meaning |
|---|---|
| `repositoryKind` | `json-file` (local file) or `firestore` |
| `firestoreAvailable` | `true` when Firestore is the active store |
| `firestoreBlocker` | Why Firestore is not active; `null` when active |
| `emailMode` | `stubbed` or `firebase-auth-email-link` |
| `emailLive` | `true` only when Firebase Auth email-link mode is fully active |
| `emailBlocker` | Why Firebase Auth email-link mode is not active; `null` when active |

### Default mode example

```json
{
  "repositoryKind": "json-file",
  "emailMode": "stubbed",
  "firestoreAvailable": false,
  "firestoreBlocker": "FIRESTORE_PROJECT_ID not set (server env only — VITE_FIREBASE_* are browser-only)",
  "emailLive": false,
  "emailBlocker": "Firebase Auth email-link mode is disabled (set LOCAL_SUBMISSIONS_EMAIL_MODE=firebase-auth-email-link to enable it)"
}
```

## Enabling Firestore locally

Preferred local setup:

```bash
cp .env.backend.example .env.backend.local
```

Then set in `.env.backend.local`:

1. `FIRESTORE_PROJECT_ID=vervaeke-translate`
2. Server-side Application Default Credentials — one of:
   - `GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json`
   - `gcloud auth application-default login`

Notes:
- `VITE_FIREBASE_*` env vars are browser-only and are not read by the Node server.
- `npm run backend:dev` auto-loads `.env.backend.local`.
- shell-exported env vars still override values from `.env.backend.local` when both are present.

With Firestore active: `repositoryKind: "firestore"`, `firestoreBlocker: null`.
If credentials fail, the server logs a warning and falls back to JSON file; `firestoreBlocker` contains the init error.

## Enabling Firebase Auth email-link confirmation

Preferred local setup:

1. Put backend-only values in `.env.backend.local`
2. Put browser Firebase config in `.env.local`
3. Restart `npm run backend:dev` after changing `.env.backend.local`

Set in `.env.backend.local`:

1. `LOCAL_SUBMISSIONS_EMAIL_MODE=firebase-auth-email-link`
2. `FIRESTORE_PROJECT_ID=vervaeke-translate`
3. Valid server-side ADC credentials (same requirement as Firestore/Admin SDK)

Also required:

4. Browser-side Firebase config in `.env.local`
5. Firebase Console Auth configured per `FIREBASE_SETUP.md` section 15

### Fast ADC setup
Use **one** of these on the machine running the backend:

```bash
# easiest on a dev machine
gcloud auth application-default login
gcloud auth application-default set-quota-project vervaeke-translate
```

or

```bash
# explicit service account file
export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
```

Quick verification:
```bash
gcloud auth application-default print-access-token >/dev/null && echo ADC_OK
curl -s http://127.0.0.1:8787/api/health | jq '{repositoryKind,emailMode,emailLive,emailBlocker}'
```

Expected once working:
- `repositoryKind: "firestore"`
- `emailMode: "firebase-auth-email-link"`
- `emailLive: true`
- `emailBlocker: null`

If the server cannot actually use Admin SDK credentials, it stays honest and reports:
- `emailMode: "stubbed"`
- `emailLive: false`
- `emailBlocker: "Firebase Auth init failed: ..."`

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `LOCAL_SUBMISSIONS_PORT` | `8787` | Port to listen on |
| `LOCAL_SUBMISSIONS_STORE_PATH` | `functions/.local-data/submissions.json` | JSON file path |
| `LOCAL_SUBMISSIONS_ADMIN_SECRET` | `local-dev-secret` | Secret for moderation transitions. Backend currently defaults to this dev value unless you override it; set your own value for any non-throwaway environment. |
| `LOCAL_SUBMISSIONS_EMAIL_MODE` | `stubbed` | `stubbed` or `firebase-auth-email-link` |
| `FIRESTORE_PROJECT_ID` | unset | Enables Firestore/Admin SDK when set (also needs ADC) |
| `GOOGLE_APPLICATION_CREDENTIALS` | unset | Path to service account JSON for ADC |

## Example QA flow — stubbed mode

```bash
# Check mode before testing
curl -s http://127.0.0.1:8787/api/health | jq '{repositoryKind, emailMode, firestoreBlocker, emailBlocker}'

# Submit a translation suggestion
RESP=$(curl -s http://127.0.0.1:8787/api/suggestions/translation \
  -H 'content-type: application/json' \
  -d '{
    "termSlug": "logos",
    "proposedTargetLanguage": "plain-english",
    "proposedTranslation": "Shared intelligible meaning space.",
    "submitterEmail": "qa@example.com",
    "submitterNickname": "QA Nick"
  }')

# Extract id and token (email stubbed — token in response, not email inbox)
ID=$(echo "$RESP" | jq -r '.suggestion.id')
TOKEN=$(echo "$RESP" | jq -r '.localEmailStub.approvalToken')

# Simulate the email confirmation click
curl -s http://127.0.0.1:8787/api/suggestions/$ID/confirm \
  -H 'content-type: application/json' \
  -d "{\"token\":\"$TOKEN\"}" | jq '.suggestion.status'
# → "contender"
```

## Browser/UI path

In the browser UI:
- Submit tab shows a backend badge describing current storage + confirmation mode
- both forms require a nickname, defaulted from the email field but editable
- in `stubbed` mode the UI shows the token/path panel and a **Simulate email confirmation** button
- in `firebase-auth-email-link` mode the UI sends a real Firebase Auth sign-in link email and finalizes the suggestion after the secure link round-trip

## Persistence shape

The server uses a repository abstraction (`repository.js` exports `createJsonFileSuggestionRepository` and `createFirestoreSuggestionRepository`) so the Firestore-backed implementation can replace the local JSON store without changing endpoint behavior.
