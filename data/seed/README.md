# Vervaeke seed corpus

This folder contains an import-ready corpus for the Vervaeke Translate app.

## Files
- `vervaeke_seed_corpus.json` — canonical structured seed file
- `vervaeke_seed_corpus.csv` — spreadsheet-friendly export of the same data
- `additions/4p-4e-core-frameworks.json` — reusable enrichment pack for the 4Ps / 4E terms
- `firestore_bundle.json` — generated `terms` / `translations` / `sources` payload derived from the seed

## Corpus workflow
Add or update local corpus entries:

```bash
npm run corpus:add -- --input data/seed/additions/4p-4e-core-frameworks.json
npm run corpus:bundle
```

Compare local seed against live Firestore:

```bash
npm run corpus:diff
```

Push local seed to live Firestore (requires admin credentials):

```bash
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/service-account.json npm run corpus:push
```

Pull live Firestore back to a seed snapshot:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/service-account.json npm run corpus:pull -- --output data/seed/vervaeke_seed_corpus.from-firestore.json
```

The live sync commands currently require admin credentials via `GOOGLE_APPLICATION_CREDENTIALS` or a repo-local `firebase-service-account.json`.

## What is in it
- **39** entries recovered from the earlier Anki deck or sacredness glossary seed
- **6** extra entries added from later transcript or glossary work and earlier user-requested expansion
- **9** core-framework entries added for the 4Ps of knowing / 4E cognitive-science lineage
- total rows: **53**

## Sources used
1. Prior sacredness glossary or Anki deck seed
   - Joplin note: `Glossary – What Happens When a Culture Loses the Sacred`
   - note link: `[:/0fa95d834e4c4f518adce16fef3fca45]`
2. Later transcript note with clarification sections
   - Joplin note: `John Vervaeke and Guy Sengstock Why Modernity Can't See the Sacred Anymore - 2026-07-13`
   - note link: `[:/d7dad7bdf88149ac87c053ee0f800530]`
3. Prior human glossary text export for terms like `Religio`
4. One explicitly marked provisional user-requested seed term: `Dialogos`
5. Manual enrichment pack for Vervaeke’s 4Ps of knowing and the 4E cognitive-science lineage
   - stored at `data/seed/additions/4p-4e-core-frameworks.json`

## Schema notes
Each row currently represents a **Plain English** translation seed for one source term.

Important fields:
- `term` — source term or phrase
- `translation` — plain-English translation ready for display
- `origin_background` — where the term comes from or what historical or philosophical background matters
- `vervaeke_usage` — how Vervaeke is bending, reviving, or using it
- `status` — `seed-current` or `seed-candidate`
- `origin_confidence` — `grounded`, `provisional`, or `blank`

## Recommendation
Yes — the app should absolutely support an **origin/background** field.

Why:
- many of these are not inventions but reactivations or reinterpretations from Greek, Latin, phenomenology, theology, and cognitive science
- the translation alone tells users what it roughly means
- the origin/background tells them why the word sounds the way it does and why Vervaeke chose it instead of a simpler synonym

Practical product recommendation:
- keep `translation` short in the main translator panel
- reveal `origin_background` and `vervaeke_usage` in an expandable details area or phrase page
- treat `Dialogos` as provisional until tightened against a direct Vervaeke source
