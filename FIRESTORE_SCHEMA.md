# Firestore schema for Vervaeke Translate

This is the concrete collection plan for v1.

## Design principles
- public readers can browse the curated glossary without auth
- client code should **not** authoritatively mutate moderation or publication state
- suggestions/new terms are accepted only through trusted server code
- origin/background and Vervaeke-specific usage are first-class fields, not stuffed into one blob

## Collections

### `terms/{termSlug}`
Canonical source-term metadata.

```json
{
  "slug": "logos",
  "term": "Logos",
  "normalizedTerm": "logos",
  "sourceLanguage": "greek",
  "searchTerms": ["logos", "reason", "word", "meaning"],
  "public": true,
  "seedStatus": "current",
  "notes": "",
  "primarySourceIds": ["source_joplin_what-happens-sacred"],
  "createdAt": "server timestamp",
  "updatedAt": "server timestamp"
}
```

### `translations/{translationId}`
One translation/explanation record for one term + one target mode.

Suggested document id:
- `logos__plain-english__seed`

```json
{
  "termSlug": "logos",
  "targetLanguage": "plain-english",
  "translation": "A rich Greek term for reason, order, meaning, and articulate disclosure.",
  "originBackground": "A densely layered Greek term spanning word, reason, account, pattern, and intelligible order.",
  "vervaekeUsage": "Shared truth-bearing space of meaning and articulation that is discovered rather than manufactured.",
  "status": "current",
  "originConfidence": "provisional",
  "isPublic": true,
  "isSeed": true,
  "sortKey": 100,
  "sourceIds": ["source_joplin_what-happens-sacred"],
  "createdAt": "server timestamp",
  "updatedAt": "server timestamp"
}
```

### `sources/{sourceId}`
Source-note / transcript provenance.

```json
{
  "sourceId": "source_joplin_what-happens-sacred",
  "kind": "joplin-note",
  "title": "Glossary – What Happens When a Culture Loses the Sacred",
  "externalRef": "0fa95d834e4c4f518adce16fef3fca45",
  "link": "[:/0fa95d834e4c4f518adce16fef3fca45]",
  "public": true,
  "createdAt": "server timestamp"
}
```

### `suggestions/{suggestionId}`
Public user proposals. **Server-write only** from trusted endpoints.

```json
{
  "kind": "translation-improvement",
  "termSlug": "logos",
  "sourceLanguage": "",
  "proposedSourceTerm": "",
  "normalizedSourceTerm": "",
  "proposedTargetLanguage": "plain-english",
  "proposedTranslation": "...",
  "proposedOriginBackground": "...",
  "proposedVervaekeUsage": "...",
  "submitterEmailHash": "...",
  "captchaScore": 0.91,
  "captchaVerified": true,
  "status": "wait-click",
  "approvalClickedAt": "",
  "lastModerationReason": "",
  "createdAt": "server timestamp"
}
```

For brand-new source term proposals, trusted backend code should instead store:
- `kind: "new-term"`
- `proposedSourceTerm`
- `normalizedSourceTerm`
- `sourceLanguage`
- initial `status: "await-review"`

### `moderation_events/{eventId}`
Server-authored audit trail for approval/rejection/state transitions.

```json
{
  "entityType": "suggestion",
  "entityId": "suggestion_123",
  "fromStatus": "await-review",
  "toStatus": "current",
  "actor": "server-admin",
  "reason": "accepted after review",
  "createdAt": "server timestamp"
}
```

## Read path for the frontend
For the current hosted app, the clean public query shape is:
1. query `terms` where `public == true`
2. query `translations` where:
   - `termSlug == selectedTerm`
   - `targetLanguage == selectedTargetLanguage`
   - `isPublic == true`
3. optionally fetch `sources` for provenance details

## Seed import mapping
Current repo seed file:
- `data/seed/vervaeke_seed_corpus.json`

Maps like this:
- `term` → `terms.term`
- `slug` → `terms.slug` and `translations.termSlug`
- `translation` → `translations.translation`
- `origin_background` → `translations.originBackground`
- `vervaeke_usage` → `translations.vervaekeUsage`
- `status` → `translations.status` / `terms.seedStatus`
- `origin_confidence` → `translations.originConfidence`
- `provenance`, `source_note_title`, `source_note_id`, `source_link` → `sources`

## Status vocabulary
Seed rows currently use:
- `seed-current`
- `seed-candidate`

Firestore should normalize to product-facing statuses such as:
- `wait-click`
- `contender`
- `current`
- `candidate`
- `await-review`
- `replaced`
- `rejected-unworthy`
- `hidden-inappropriate`
- `hidden-owner-deleted`

## What should remain server-only
Client/browser must not directly:
- publish a new translation
- promote a candidate to current
- change moderation state
- approve a newly submitted source term
- write moderation events

That all belongs in trusted backend code.
