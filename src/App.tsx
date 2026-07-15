import { useMemo, useState } from 'react'

import './App.css'
import { seedCorpusEntries, seedCorpusStats, targetLanguageOptions } from './lib/corpus'
import { searchCorpus } from './lib/search'
import type { SeedCorpusEntry } from './types/corpus'

const collectionPlan = [
  'terms',
  'translations',
  'sources',
  'suggestions',
  'moderation_events',
] as const

function pickInitialEntry(entries: SeedCorpusEntry[]): SeedCorpusEntry {
  return entries.find((entry) => entry.slug === 'logos') ?? entries[0]!
}

function App() {
  const [query, setQuery] = useState('')
  const [selectedTargetLanguage, setSelectedTargetLanguage] = useState('plain-english')
  const [selectedSlug, setSelectedSlug] = useState(() => pickInitialEntry(seedCorpusEntries).slug)

  const filteredEntries = useMemo(() => searchCorpus(seedCorpusEntries, query), [query])

  const selectedEntry =
    filteredEntries.find((entry) => entry.slug === selectedSlug) ?? filteredEntries[0] ?? null

  return (
    <main className="app-shell">
      <section className="hero-card">
        <div>
          <p className="eyebrow">Real seed corpus loaded</p>
          <h1>Vervaeke Translate</h1>
          <p className="lede">
            The app is now grounded in the recovered glossary corpus rather than a fake shell. It
            can already search real terms, distinguish current vs candidate entries, and preserve
            the difference between short translation, origin/background, and Vervaeke-specific
            usage.
          </p>
        </div>

        <div className="hero-metrics">
          <article>
            <strong>{seedCorpusStats.totalEntries}</strong>
            <span>seed entries</span>
          </article>
          <article>
            <strong>{seedCorpusStats.entriesWithOrigin}</strong>
            <span>with origin/background</span>
          </article>
          <article>
            <strong>{seedCorpusStats.candidateEntries}</strong>
            <span>candidate/provisional terms</span>
          </article>
        </div>
      </section>

      <section className="translator-shell card">
        <div className="translator-toolbar">
          <label className="toolbar-field">
            <span>Find a Vervaeke term</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Try logos, religio, verticality, pilgrimage…"
            />
          </label>

          <label className="toolbar-field compact">
            <span>Translate to</span>
            <select
              value={selectedTargetLanguage}
              onChange={(event) => setSelectedTargetLanguage(event.target.value)}
            >
              {targetLanguageOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="translator-grid">
          <aside className="term-list">
            <div className="list-meta">
              <strong>{filteredEntries.length}</strong>
              <span>matching entries</span>
            </div>

            <div className="term-buttons">
              {filteredEntries.map((entry) => (
                <button
                  key={entry.slug}
                  className={entry.slug === selectedEntry.slug ? 'term-button active' : 'term-button'}
                  onClick={() => setSelectedSlug(entry.slug)}
                  type="button"
                >
                  <span className="term-button-head">
                    <strong>{entry.term}</strong>
                    <span className={entry.status === 'seed-current' ? 'badge current' : 'badge candidate'}>
                      {entry.status === 'seed-current' ? 'current' : 'candidate'}
                    </span>
                  </span>
                  <span className="term-button-copy">{entry.translation}</span>
                </button>
              ))}
            </div>
          </aside>

          <section className="translation-panel">
            {selectedEntry ? (
              <>
                <header className="translation-header">
                  <div>
                    <p className="panel-label">Source term</p>
                    <h2>{selectedEntry.term}</h2>
                  </div>
                  <div className="badge-stack">
                    <span className={selectedEntry.status === 'seed-current' ? 'badge current' : 'badge candidate'}>
                      {selectedEntry.status}
                    </span>
                    <span className="badge neutral">{selectedTargetLanguage}</span>
                    <span className={selectedEntry.origin_confidence === 'grounded' ? 'badge grounded' : selectedEntry.origin_confidence === 'provisional' ? 'badge provisional' : 'badge blank'}>
                      {selectedEntry.origin_confidence}
                    </span>
                  </div>
                </header>

                <article className="translation-card accent">
                  <p className="panel-label">Plain-language translation</p>
                  <p className="translation-copy">{selectedEntry.translation}</p>
                </article>

                <div className="detail-grid">
                  <article className="translation-card">
                    <p className="panel-label">Origin / background</p>
                    <p>
                      {selectedEntry.origin_background ||
                        'Still blank for this seed row. The schema supports it; the content just needs to be tightened later.'}
                    </p>
                  </article>

                  <article className="translation-card">
                    <p className="panel-label">Vervaeke usage</p>
                    <p>
                      {selectedEntry.vervaeke_usage ||
                        'Still blank for this row. The app can already preserve the distinction when we have the explanation.'}
                    </p>
                  </article>
                </div>

                <article className="translation-card metadata">
                  <p className="panel-label">Provenance</p>
                  <ul>
                    {selectedEntry.provenance.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  {selectedEntry.notes ? <p className="notes-callout">Note: {selectedEntry.notes}</p> : null}
                </article>
              </>
            ) : (
              <article className="translation-card empty-state">
                <p className="panel-label">No matches</p>
                <p>
                  Nothing matched that search yet. Try a broader term like <code>logos</code>,{' '}
                  <code>religio</code>, <code>dialogos</code>, or <code>verticality</code>.
                </p>
              </article>
            )}
          </section>
        </div>
      </section>

      <section className="grid two-up">
        <article className="card">
          <h2>Firestore collection plan</h2>
          <p>
            The app should stop pretending a single document can do everything. The seed corpus now
            maps cleanly onto explicit collections with public reads and server-only mutation paths.
          </p>
          <div className="status-list">
            {collectionPlan.map((collection) => (
              <code key={collection}>{collection}</code>
            ))}
          </div>
        </article>

        <article className="card">
          <h2>Why origin/background matters</h2>
          <p>
            Many of these terms are retrievals or reinterpretations from Greek, Latin,
            phenomenology, theology, and cognitive science. Without an origin layer, the app makes
            Vervaeke look like he simply invented all of them, which is the wrong shape.
          </p>
        </article>
      </section>

      <section className="card checklist-card">
        <h2>What is real now</h2>
        <ol>
          <li>The frontend reads the actual seed corpus from the repo.</li>
          <li>The translator shell can search and inspect real entries.</li>
          <li>The Firestore schema has a concrete collection/doc plan.</li>
          <li>Public vs trusted-write boundaries are documented and encoded in rules.</li>
        </ol>
      </section>
    </main>
  )
}

export default App
