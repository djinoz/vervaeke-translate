import { useMemo, useState } from 'react'

import './App.css'
import ModeratorView from './components/ModeratorView'
import SubmitSuggestionForm from './components/SubmitSuggestionForm'
import { seedCorpusEntries, seedCorpusStats, targetLanguageOptions } from './lib/corpus'
import { searchCorpus } from './lib/search'
import type { SeedCorpusEntry } from './types/corpus'

type AppTab = 'translate' | 'moderator'

function pickInitialEntry(entries: SeedCorpusEntry[]): SeedCorpusEntry {
  return entries.find((entry) => entry.slug === 'logos') ?? entries[0]!
}

const INITIAL_ENTRY = pickInitialEntry(seedCorpusEntries)
const TYPEAHEAD_LIMIT = 8

function App() {
  const [tab, setTab] = useState<AppTab>('translate')
  const [query, setQuery] = useState(INITIAL_ENTRY.term)
  const [selectedTargetLanguage, setSelectedTargetLanguage] = useState('plain-english')
  const [selectedSlug, setSelectedSlug] = useState(INITIAL_ENTRY.slug)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)

  const filteredEntries = useMemo(() => searchCorpus(seedCorpusEntries, query), [query])
  const dropdownEntries = filteredEntries.slice(0, TYPEAHEAD_LIMIT)

  const selectedEntry =
    filteredEntries.find((entry) => entry.slug === selectedSlug) ?? filteredEntries[0] ?? null

  const handleEntrySelect = (entry: SeedCorpusEntry) => {
    setSelectedSlug(entry.slug)
    setQuery(entry.term)
    setIsDropdownOpen(false)
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1>Vervaeke Translate</h1>
          <div className="header-subtitle-row">
            <p className="header-subtitle">Translate Vervaeke into words a normal human can parse.</p>
            <a
              className="header-why-link"
              href="https://djinoz.substack.com/p/vervaeke-translate"
              target="_blank"
              rel="noreferrer"
            >
              Why?
            </a>
          </div>
        </div>

        <div className="header-stats" aria-label="Corpus summary">
          <span>{seedCorpusStats.totalEntries} terms</span>
          <span>{seedCorpusStats.entriesWithOrigin} with origin/background</span>
        </div>

        <div className="app-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'translate'}
            className={tab === 'translate' ? 'app-tab active' : 'app-tab'}
            onClick={() => setTab('translate')}
          >
            Translate
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'moderator'}
            className={tab === 'moderator' ? 'app-tab active' : 'app-tab'}
            onClick={() => setTab('moderator')}
          >
            Moderator
          </button>
        </div>
      </header>

      {tab === 'moderator' ? <ModeratorView /> : null}

      <section className="translate-card" style={tab !== 'translate' ? { display: 'none' } : undefined}>
        <div className="translate-toolbar">
          <label className="toolbar-field toolbar-search">
            <span>Search terms</span>
            <div className="typeahead-shell">
              <input
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setIsDropdownOpen(true)
                }}
                onFocus={() => setIsDropdownOpen(true)}
                onBlur={() => {
                  window.setTimeout(() => setIsDropdownOpen(false), 120)
                }}
                placeholder="Try logos, relevance realization, religio, supersalient…"
              />

              {isDropdownOpen && dropdownEntries.length > 0 ? (
                <div className="typeahead-dropdown" role="listbox" aria-label="Matching Vervaeke terms">
                  {dropdownEntries.map((entry) => (
                    <button
                      key={entry.slug}
                      className={entry.slug === selectedEntry?.slug ? 'typeahead-option active' : 'typeahead-option'}
                      onMouseDown={(event) => {
                        event.preventDefault()
                        handleEntrySelect(entry)
                      }}
                      type="button"
                    >
                      <span className="typeahead-option-head">
                        <strong>{entry.term}</strong>
                        <span className={entry.status === 'seed-current' ? 'badge current' : 'badge candidate'}>
                          {entry.status === 'seed-current' ? 'current' : 'candidate'}
                        </span>
                      </span>
                    </button>
                  ))}
                  {filteredEntries.length > TYPEAHEAD_LIMIT ? (
                    <p className="typeahead-footer">Showing {TYPEAHEAD_LIMIT} of {filteredEntries.length} matches</p>
                  ) : null}
                </div>
              ) : null}
            </div>
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
      </section>

      {tab === 'translate' ? (
        <SubmitSuggestionForm
          selectedEntry={selectedEntry}
          selectedTargetLanguage={selectedTargetLanguage}
        />
      ) : null}
    </main>
  )
}

export default App
