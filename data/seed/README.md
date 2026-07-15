# Vervaeke seed corpus

This folder contains an initial import-ready corpus for the Vervaeke Translate app.

## Files
- `vervaeke_seed_corpus.json` — canonical structured seed file
- `vervaeke_seed_corpus.csv` — spreadsheet-friendly export of the same data

## What is in it
- **39** entries recovered from the earlier Anki deck or sacredness glossary seed
- **6** extra entries added from later transcript or glossary work and user-requested expansion
- total rows: **44**

## Sources used
1. Prior sacredness glossary or Anki deck seed
   - Joplin note: `Glossary – What Happens When a Culture Loses the Sacred`
   - note link: `[:/0fa95d834e4c4f518adce16fef3fca45]`
2. Later transcript note with clarification sections
   - Joplin note: `John Vervaeke and Guy Sengstock Why Modernity Can't See the Sacred Anymore - 2026-07-13`
   - note link: `[:/d7dad7bdf88149ac87c053ee0f800530]`
3. Prior human glossary text export for terms like `Religio`
4. One explicitly marked provisional user-requested seed term: `Dialogos`

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
