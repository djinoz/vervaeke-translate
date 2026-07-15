import { useMemo, useState } from 'react'

import './App.css'
import { seedCorpusEntries, seedCorpusStats, targetLanguageOptions } from './lib/corpus'
import { searchCorpus } from './lib/search'
import type { SeedCorpusEntry } from './types/corpus'

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
      <header className="app-header">
        <div>
          <h1>Vervaeke Translate</h1>
          <p className="header-subtitle">Translate Vervaeke into something a normal human can parse.</p>
        </div>

        <div className="header-stats" aria-label="Corpus summary">
          <span>{seedCorpusStats.totalEntries} terms</span>
          <span>{seedCorpusStats.entriesWithOrigin} with origin/background</span>
          <span>{seedCorpusStats.candidateEntries} candidate terms</span>
        </div>
      </header>

      <section className="translate-card">
        <div className="translate-toolbar">
          <label className="toolbar-field toolbar-search">
            <span>Search terms</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Try logos, relevance realization, religio, supersalient…"
            />
          </label>

          <label className="toolbar-field toolbar-target">
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

        <div className="translate-windows">
          <section className="translate-window source-window" aria-label="Source terms">
            <div className="window-header">
              <span className="window-label">Vervaeke</span>
              <span className="window-meta">{filteredEntries.length} matches</span>
            </div>

            <div className="term-buttons compact-list">
              {filteredEntries.map((entry) => (
                <button
                  key={entry.slug}
                  className={entry.slug === selectedEntry?.slug ? 'term-button active' : 'term-button'}
                  onClick={() => {
                    setSelectedSlug(entry.slug)
                    setQuery(entry.term)
                  }}
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
          </section>

          <section className="translate-window result-window" aria-label="Translation result">
            <div className="window-header">
              <span className="window-label">
                {targetLanguageOptions.find((option) => option.value === selectedTargetLanguage)?.label ??
                  'Plain English'}
              </span>
              {selectedEntry ? (
                <div className="badge-stack">
                  <span className={selectedEntry.status === 'seed-current' ? 'badge current' : 'badge candidate'}>
                    {selectedEntry.status === 'seed-current' ? 'current' : 'candidate'}
                  </span>
                  <span
                    className={
                      selectedEntry.origin_confidence === 'grounded'
                        ? 'badge grounded'
                        : selectedEntry.origin_confidence === 'provisional'
                          ? 'badge provisional'
                          : 'badge blank'
                    }
                  >
                    {selectedEntry.origin_confidence}
                  </span>
                </div>
              ) : null}
            </div>

            {selectedEntry ? (
              <>
                <article className="translation-surface primary-surface">
                  <p className="translation-copy">{selectedEntry.translation}</p>
                </article>

                <div className="detail-grid">
                  <article className="translation-surface detail-surface">
                    <div className="detail-heading-row">
                      <p className="panel-label">Origin / background</p>
                      <span
                        className="info-dot"
                        title="This explains where the term comes from historically or philosophically, so Vervaeke’s wording doesn’t look like it came out of nowhere."
                        aria-label="Why origin/background matters"
                      >
                        ?
                      </span>
                    </div>
                    <p>
                      {selectedEntry.origin_background ||
                        'Not filled yet for this term. The schema supports it; the explanation just still needs tightening.'}
                    </p>
                  </article>

                  <article className="translation-surface detail-surface">
                    <p className="panel-label">Vervaeke usage</p>
                    <p>
                      {selectedEntry.vervaeke_usage ||
                        'Not filled yet for this term. This space is for how Vervaeke bends, revives, or specializes the term.'}
                    </p>
                  </article>
                </div>

                {selectedEntry.notes ? <p className="notes-callout">Note: {selectedEntry.notes}</p> : null}
              </>
            ) : (
              <article className="translation-surface empty-state">
                <p className="panel-label">No matches</p>
                <p>
                  Nothing matched that search yet. Try a broader term like <code>logos</code>,{' '}
                  <code>religio</code>, <code>participatory</code>, or <code>meaning crisis</code>.
                </p>
              </article>
            )}
          </section>
        </div>
      </section>
    </main>
  )
}

export default App
