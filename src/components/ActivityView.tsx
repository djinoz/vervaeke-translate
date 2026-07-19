import { useCallback, useEffect, useState } from 'react'
import { seedCorpusEntries } from '../lib/corpus'
import { listSuggestions } from '../lib/submissionsApi'
import type { SuggestionStatus, SuggestionSummary } from '../types/suggestions'

const FEED_PAGE_SIZE = 15

const STATUS_LABEL: Record<SuggestionStatus, string> = {
  'wait-click': 'Pending email',
  contender: 'Contender',
  'await-review': 'Awaiting review',
  current: 'Current',
  replaced: 'Replaced',
  'rejected-unworthy': 'Rejected',
  'hidden-inappropriate': 'Hidden',
  'hidden-owner-deleted': 'Deleted',
}

function statusBadgeMod(status: SuggestionStatus): string {
  if (status === 'wait-click') return 'wait-click'
  if (status === 'contender') return 'contender'
  if (status === 'await-review') return 'await-review'
  if (status === 'current') return 'current'
  if (status === 'replaced') return 'replaced'
  if (status === 'rejected-unworthy') return 'rejected'
  return 'hidden'
}

function ActivityBadge({ status }: { status: SuggestionStatus }) {
  return <span className={`badge-mod ${statusBadgeMod(status)}`}>{STATUS_LABEL[status]}</span>
}

function formatRelativeTime(ts: string): string {
  if (!ts) return '—'
  try {
    const diff = Date.now() - new Date(ts).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d ago`
    return new Date(ts).toLocaleDateString()
  } catch {
    return ts
  }
}

function displayTerm(suggestion: Pick<SuggestionSummary, 'termSlug' | 'proposedSourceTerm' | 'id'>): string {
  const corpusEntry = seedCorpusEntries.find((entry) => entry.slug === suggestion.termSlug)
  return corpusEntry?.term ?? suggestion.proposedSourceTerm ?? suggestion.termSlug ?? suggestion.id.slice(0, 8)
}

interface PhraseDetailProps {
  termSlug: string | null
  newTermProposal: string | null
  highlightedId: string | null
  termSuggestions: SuggestionSummary[]
  loading: boolean
}

function PhraseDetailPanel({ termSlug, newTermProposal, highlightedId, termSuggestions, loading }: PhraseDetailProps) {
  const corpusEntry = termSlug ? (seedCorpusEntries.find((entry) => entry.slug === termSlug) ?? null) : null

  const contenders = termSuggestions.filter((suggestion) => suggestion.status === 'contender')
  const currentSuggestion = termSuggestions.find((suggestion) => suggestion.status === 'current')
  const pending = termSuggestions.filter(
    (suggestion) => suggestion.status === 'wait-click' || suggestion.status === 'await-review',
  )
  const history = termSuggestions.filter(
    (suggestion) => suggestion.status === 'replaced' || suggestion.status === 'rejected-unworthy',
  )

  if (!termSlug && !newTermProposal) {
    return (
      <div className="activity-detail activity-detail--empty">
        <p>Select a submission from the feed below to inspect its phrase detail.</p>
      </div>
    )
  }

  return (
    <div className="activity-detail">
      <div className="activity-detail-header">
        <div>
          <p className="activity-panel-eyebrow">Phrase detail</p>
          <h2 className="activity-detail-term">{corpusEntry?.term ?? newTermProposal ?? termSlug}</h2>
        </div>
        {corpusEntry ? (
          <span className="badge current">seed current</span>
        ) : (
          <span className="badge-mod await-review">new term proposal</span>
        )}
      </div>

      <div className="activity-current-block">
        <p className="activity-section-label">Current translation</p>
        {corpusEntry ? (
          <p className="activity-current-text">{corpusEntry.translation}</p>
        ) : currentSuggestion ? (
          <p className="activity-current-text">{currentSuggestion.previewSnippet}</p>
        ) : (
          <p className="activity-no-current">No approved translation yet for this term.</p>
        )}
      </div>

      {pending.length > 0 && (
        <div className="activity-pending-block">
          <p className="activity-section-label">
            Pending / review <span className="activity-count">({pending.length})</span>
          </p>
          <div className="activity-suggestion-list">
            {pending.map((suggestion) => (
              <div
                key={suggestion.id}
                className={`activity-suggestion-row activity-suggestion-row--pending${suggestion.id === highlightedId ? ' activity-suggestion-row--highlighted' : ''}`}
              >
                <div className="activity-suggestion-top">
                  <ActivityBadge status={suggestion.status} />
                  <span className="activity-suggestion-meta">
                    {suggestion.submitterNickname || 'Anonymous'}
                    {suggestion.proposedTargetLanguage ? ` · ${suggestion.proposedTargetLanguage}` : ''}
                  </span>
                  <span className="activity-suggestion-time">{formatRelativeTime(suggestion.createdAt)}</span>
                </div>
                {suggestion.previewSnippet && (
                  <p className="activity-suggestion-text">{suggestion.previewSnippet}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {contenders.length > 0 && (
        <div className="activity-contenders-block">
          <p className="activity-section-label">
            Contenders <span className="activity-count">({contenders.length})</span>
          </p>
          <div className="activity-suggestion-list">
            {contenders.map((suggestion) => (
              <div
                key={suggestion.id}
                className={`activity-suggestion-row activity-suggestion-row--contender${suggestion.id === highlightedId ? ' activity-suggestion-row--highlighted' : ''}`}
              >
                <div className="activity-suggestion-top">
                  <ActivityBadge status={suggestion.status} />
                  <span className="activity-suggestion-meta">
                    {suggestion.submitterNickname || 'Anonymous'}
                    {suggestion.proposedTargetLanguage ? ` · ${suggestion.proposedTargetLanguage}` : ''}
                  </span>
                  <span className="activity-suggestion-time">{formatRelativeTime(suggestion.createdAt)}</span>
                </div>
                {suggestion.previewSnippet && (
                  <p className="activity-suggestion-text">{suggestion.previewSnippet}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="activity-history-block">
          <p className="activity-section-label">
            History <span className="activity-count">({history.length})</span>
          </p>
          <div className="activity-suggestion-list">
            {history.map((suggestion) => (
              <div
                key={suggestion.id}
                className={`activity-suggestion-row activity-suggestion-row--replaced${suggestion.id === highlightedId ? ' activity-suggestion-row--highlighted' : ''}`}
              >
                <div className="activity-suggestion-top">
                  <ActivityBadge status={suggestion.status} />
                  <span className="activity-suggestion-meta">
                    {suggestion.submitterNickname || 'Anonymous'}
                    {suggestion.proposedTargetLanguage ? ` · ${suggestion.proposedTargetLanguage}` : ''}
                  </span>
                  <span className="activity-suggestion-time">{formatRelativeTime(suggestion.createdAt)}</span>
                </div>
                {suggestion.previewSnippet && (
                  <p className="activity-suggestion-text">{suggestion.previewSnippet}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {loading && <p className="activity-loading">Loading…</p>}

      {!loading && termSuggestions.length === 0 && (termSlug || newTermProposal) && (
        <p className="activity-no-current">No community submissions for this term yet.</p>
      )}
    </div>
  )
}

export default function ActivityView() {
  const [selectedTermSlug, setSelectedTermSlug] = useState<string | null>(null)
  const [selectedNewTermProposal, setSelectedNewTermProposal] = useState<string | null>(null)
  const [highlightedId, setHighlightedId] = useState<string | null>(null)

  const [feedItems, setFeedItems] = useState<SuggestionSummary[]>([])
  const [feedPage, setFeedPage] = useState(1)
  const [feedTotal, setFeedTotal] = useState(0)
  const [feedTotalPages, setFeedTotalPages] = useState(1)
  const [feedLoading, setFeedLoading] = useState(false)
  const [feedError, setFeedError] = useState('')

  const [termSuggestions, setTermSuggestions] = useState<SuggestionSummary[]>([])
  const [detailLoading, setDetailLoading] = useState(false)

  const loadFeed = useCallback(async () => {
    setFeedLoading(true)
    setFeedError('')
    try {
      const data = await listSuggestions({ page: feedPage, pageSize: FEED_PAGE_SIZE, includeHidden: false })
      setFeedItems(data.suggestions)
      setFeedTotal(data.total)
      setFeedTotalPages(data.totalPages)
    } catch (err) {
      setFeedError(err instanceof Error ? err.message : 'Failed to load feed')
    } finally {
      setFeedLoading(false)
    }
  }, [feedPage])

  useEffect(() => {
    void loadFeed()
  }, [loadFeed])

  async function handleRowClick(suggestion: SuggestionSummary) {
    setHighlightedId(suggestion.id)

    const slug = suggestion.termSlug || null
    const hasSeedEntry = Boolean(slug && seedCorpusEntries.some((entry) => entry.slug === slug))

    setSelectedTermSlug(slug)
    setSelectedNewTermProposal(hasSeedEntry ? null : (suggestion.proposedSourceTerm || null))

    if (!slug) {
      setTermSuggestions([suggestion])
      return
    }

    setDetailLoading(true)
    try {
      const data = await listSuggestions({ termSlug: slug, pageSize: 100, includeHidden: false })
      setTermSuggestions(data.suggestions.length > 0 ? data.suggestions : [suggestion])
    } catch {
      setTermSuggestions([suggestion])
    } finally {
      setDetailLoading(false)
    }
  }

  function changePage(next: number) {
    setFeedPage(Math.min(Math.max(1, next), feedTotalPages))
  }

  return (
    <div className="activity-shell">
      <PhraseDetailPanel
        termSlug={selectedTermSlug}
        newTermProposal={selectedNewTermProposal}
        highlightedId={highlightedId}
        termSuggestions={termSuggestions}
        loading={detailLoading}
      />

      <div className="activity-feed">
        <div className="activity-feed-header">
          <div>
            <p className="activity-panel-eyebrow">Browse</p>
            <p className="activity-feed-title">Recent submissions</p>
          </div>
          <button
            type="button"
            className="mod-btn-secondary"
            onClick={() => void loadFeed()}
            disabled={feedLoading}
          >
            {feedLoading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {feedError && (
          <p className="mod-error activity-feed-error">
            {feedError.includes('fetch') || feedError.includes('network') || feedError.includes('offline')
              ? 'Backend offline. Start it with: npm run backend:dev'
              : feedError}
          </p>
        )}

        {feedItems.length === 0 && !feedLoading && !feedError && (
          <p className="activity-feed-empty">No submissions yet.</p>
        )}

        <div className="activity-feed-list">
          {feedItems.map((suggestion) => (
            <button
              key={suggestion.id}
              type="button"
              className={`activity-feed-row${suggestion.id === highlightedId ? ' activity-feed-row--selected' : ''}`}
              onClick={() => void handleRowClick(suggestion)}
            >
              <div className="activity-feed-row-top">
                <span className="activity-feed-row-phrase">{displayTerm(suggestion)}</span>
                <div className="activity-feed-row-badges">
                  <ActivityBadge status={suggestion.status} />
                  {suggestion.kind === 'new-term' && <span className="badge-mod kind">new term</span>}
                </div>
              </div>
              {suggestion.previewSnippet && (
                <p className="activity-feed-row-preview">{suggestion.previewSnippet}</p>
              )}
              <div className="activity-feed-row-meta">
                <span className="activity-feed-row-author">{suggestion.submitterNickname || 'Anonymous'}</span>
                {suggestion.proposedTargetLanguage && (
                  <span className="activity-feed-row-lang">{suggestion.proposedTargetLanguage}</span>
                )}
                <span className="activity-feed-row-time">{formatRelativeTime(suggestion.createdAt)}</span>
              </div>
            </button>
          ))}
        </div>

        <div className="mod-pagination">
          <button
            type="button"
            className="mod-btn-secondary"
            onClick={() => changePage(feedPage - 1)}
            disabled={feedPage <= 1 || feedLoading}
          >
            Previous
          </button>
          <p className="mod-pagination-label">
            Page {feedPage} of {feedTotalPages} · {feedTotal} total
          </p>
          <button
            type="button"
            className="mod-btn-secondary"
            onClick={() => changePage(feedPage + 1)}
            disabled={feedPage >= feedTotalPages || feedLoading}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
}
