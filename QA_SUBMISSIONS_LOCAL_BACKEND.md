# QA — submissions local backend + Firebase email-link contender flow

Repo: `~/projects/vervaeke-translate`
Updated: 2026-07-17

---

## 1. What is implemented now

The submissions group now supports two confirmation paths for **existing-term translation suggestions**:

- `stubbed`
  - server returns a local approval token
  - UI exposes a **Simulate email confirmation** button
  - used when Firebase Auth email-link mode is not active
- `firebase-auth-email-link`
  - browser sends a real Firebase Auth email link with `sendSignInLinkToEmail(...)`
  - browser completes sign-in with `signInWithEmailLink(...)`
  - browser sends the resulting Firebase ID token to trusted backend `POST /api/suggestions/:id/finalize-email-link`
  - backend verifies the authenticated email matches the suggestion submitter before moving `wait-click` → `contender`

For **new-term proposals** the behavior remains:
- submit → `await-review`
- no email confirmation step

Both forms now require a **nickname**, defaulted from the email field but editable, so Firebase Auth email templates can use `%DISPLAY_NAME%`.

---

## 2. Current mode / readiness check

```bash
curl -s http://127.0.0.1:8787/api/health | jq '{repositoryKind, emailMode, firestoreAvailable, firestoreBlocker, emailLive, emailBlocker}'
```

Key fields:

| Field | Meaning |
|---|---|
| `repositoryKind` | `json-file` or `firestore` |
| `emailMode` | `stubbed` or `firebase-auth-email-link` |
| `emailLive` | `true` only when Firebase Auth email-link mode is actually active |
| `emailBlocker` | Why Firebase Auth email-link mode is not active |

### Verified on 2026-07-17

#### Default local run
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

#### Requested Firebase email-link mode without valid ADC
```json
{
  "repositoryKind": "firestore",
  "emailMode": "stubbed",
  "firestoreAvailable": true,
  "firestoreBlocker": null,
  "emailLive": false,
  "emailBlocker": "Firebase Auth init failed: Credential implementation provided to initializeApp() via the \"credential\" property failed to fetch a valid Google OAuth2 access token ..."
}
```

Interpretation:
- the backend now reports **honestly** when Firebase Auth email-link mode cannot actually run
- it does **not** pretend email-link mode is live just because the env var was requested

---

## 3. Prerequisites for real Firebase email-link mode

Server side:
1. `LOCAL_SUBMISSIONS_EMAIL_MODE=firebase-auth-email-link`
2. `FIRESTORE_PROJECT_ID=vervaeke-translate`
3. valid ADC credentials:
   - `GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json`, or
   - `gcloud auth application-default login`

Browser side:
1. `.env.local` populated with real `VITE_FIREBASE_*`
2. Firebase Console Auth configured per `FIREBASE_SETUP.md` section 15

Console-side requirements already assumed by this repo:
- Email link sign-in enabled
- Email/Password enabled
- authorized domains configured
- email template uses `%DISPLAY_NAME%`

---

## 4. Local run commands

### Backend
```bash
npm run backend:dev
```

### Frontend
```bash
npm run dev
```

LAN review:
```bash
npm run dev -- --host
```

The Vite dev proxy forwards `/api/*` to `http://127.0.0.1:8787`.

---

## 5. Verified stubbed HTTP flow

Run against a local backend instance:

```bash
RESP=$(curl -s http://127.0.0.1:8791/api/suggestions/translation \
  -H 'content-type: application/json' \
  -d '{
    "termSlug":"logos",
    "proposedTargetLanguage":"plain-english",
    "proposedTranslation":"Shared intelligible meaning space.",
    "submitterEmail":"qa@example.com",
    "submitterNickname":"QA Nick"
  }')

echo "$RESP" | jq '{status:.suggestion.status, nickname:.suggestion.submitterNickname, hasStub:(.localEmailStub!=null)}'

ID=$(echo "$RESP" | jq -r '.suggestion.id')
TOKEN=$(echo "$RESP" | jq -r '.localEmailStub.approvalToken')

curl -s http://127.0.0.1:8791/api/suggestions/$ID/confirm \
  -H 'content-type: application/json' \
  -d "{\"token\":\"$TOKEN\"}" | jq '{status:.suggestion.status, submitterAuthUid:.suggestion.submitterAuthUid}'
```

Observed output on 2026-07-17:

```json
{
  "status": "wait-click",
  "nickname": "QA Nick",
  "hasStub": true
}
{
  "status": "contender",
  "submitterAuthUid": ""
}
```

This proves:
- server-side initial state enforcement is still `wait-click`
- `submitterNickname` is persisted
- stubbed confirmation still transitions to `contender`

---

## 6. Verified automated checks

### Backend tests
```bash
npm run backend:test
```
Observed: `11 tests passed`

Coverage includes:
- initial status enforcement
- ignored client `status`
- stubbed token confirmation path
- Firebase email-link submission path returning `localEmailStub: null`
- Firebase finalization path requiring valid ID token
- Firebase finalization rejecting email mismatch
- illegal transition rejection
- Firestore repository seam behavior

### Full test suite
```bash
npm test
```
Observed: `20 tests passed`

### Production build
```bash
npm run build
```
Observed: success

Note: current build emits a Vite chunk-size warning because Firebase Auth increases bundle size, but the build is green.

---

## 7. UI behavior now

### Translation-improvement form
- requires:
  - improved translation
  - email
  - nickname
- nickname auto-fills from email until user edits it
- when backend mode is `stubbed`:
  - success panel shows token/path
  - **Simulate email confirmation** button is available
- when backend mode is `firebase-auth-email-link`:
  - browser sends real Firebase Auth email link
  - success panel explains secure email-link confirmation
  - if email send fails after suggestion creation, UI preserves the suggestion and offers **Resend confirmation email**
  - after return via email link, the browser finalizes the suggestion and shows confirmed state

### New-term form
- now also requires nickname
- still submits directly to `await-review`

---

## 8. Trusted backend endpoints relevant to the contender flow

| Endpoint | Purpose |
|---|---|
| `POST /api/suggestions/translation` | create suggestion in `wait-click`; optionally upsert Firebase Auth user display name |
| `POST /api/suggestions/:id/confirm` | local stub path only |
| `POST /api/suggestions/:id/finalize-email-link` | Firebase Auth finalization path |
| `POST /api/suggestions/:id/transition` | moderator/admin testing path |
| `GET /api/health` | reports actual runtime mode and blockers |

---

## 9. Remaining limitation

The repo-side implementation is complete for the local test server flow, but **real Firebase email-link confirmation will stay inactive until server-side ADC credentials are available**.

That is not a code gap anymore; it is a runtime credential/config gate.
