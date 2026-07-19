import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  checkHealth,
  deleteSuggestion,
  getSuggestion,
  getStatusMeta,
  listSuggestions,
  transitionSuggestion,
  verifyModeratorSecret,
} from '../lib/submissionsApi'
import type {
  ModerationEvent,
  StatusMeta,
  Suggestion,
  SuggestionKind,
  SuggestionStatus,
  SuggestionSummary,
} from '../types/suggestions'

const PAGE_SIZE = 12

const STATUS_LABEL: Record<SuggestionStatus, string> = {
  'wait-click': 'Wait click',
  contender: 'Contender',
  'await-review': 'Await review',
  current: 'Current',
  replaced: 'Replaced',
  'rejected-unworthy': 'Rejected',
  'hidden-inappropriate': 'Hidden (inappropriate)',
  'hidden-owner-deleted': 'Hidden (deleted)',
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

function ModBadge({ status }: { status: SuggestionStatus }) {
  return <span className={`badge-mod ${statusBadgeMod(status)}`}>{STATUS_LABEL[status]}</span>
}

function formatTs(ts: string) {
  if (!ts) return '—'
  try {
    return new Date(ts).toLocaleString()
  } catch {
    return ts
  }
}

function displayQueuePhrase(suggestion: Pick<SuggestionSummary, 'termSlug' | 'proposedSourceTerm' | 'id'>) {
  return suggestion.termSlug || suggestion.proposedSourceTerm || suggestion.id.slice(0, 8)
}

interface DetailPaneProps {
  id: string
  adminSecret: string
  statusMeta: StatusMeta[]
  onTransitioned: () => void
  onDeleted: () => void
}

function DetailPane({ id, adminSecret, statusMeta, onTransitioned, onDeleted }: DetailPaneProps) {
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null)
  const [events, setEvents] = useState<ModerationEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pendingTo, setPendingTo] = useState<SuggestionStatus | null>(null)
  const [reason, setReason] = useState('')
  const [transitioning, setTransitioning] = useState(false)
  const [transitionError, setTransitionError] = useState('')
  const [deleteConfirming, setDeleteConfirming] = useState(false)
  const [deleteReason, setDeleteReason] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getSuggestion(id, adminSecret)
      setSuggestion(data.suggestion)
      setEvents(data.moderationEvents)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [adminSecret, id])

  useEffect(() => {
    void load()
  }, [load])

  async function handleTransition(e: React.FormEvent) {
    e.preventDefault()
    if (!pendingTo) return
    setTransitioning(true)
    setTransitionError('')
    try {
      await transitionSuggestion(id, pendingTo, reason, adminSecret)
      setPendingTo(null)
      setReason('')
      await load()
      onTransitioned()
    } catch (err) {
      setTransitionError(err instanceof Error ? err.message : 'Transition failed')
    } finally {
      setTransitioning(false)
    }
  }

  async function handleDelete() {
    if (!deleteReason.trim()) {
      setDeleteError('Reason is required.')
      return
    }
    setDeleting(true)
    setDeleteError('')
    try {
      await deleteSuggestion(id, adminSecret, deleteReason.trim())
      onDeleted()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Delete failed')
      setDeleting(false)
      setDeleteConfirming(false)
    }
  }

  if (loading) return <div className="mod-connecting">Loading…</div>
  if (error) return <div className="mod-queue-error mod-error">{error}</div>
  if (!suggestion) return null

  const allowedNext = statusMeta.find((m) => m.status === suggestion.status)?.allowedNextStatuses ?? []
  const isTerminal = allowedNext.length === 0

  return (
    <div>
      <div className="mod-detail-header">
        <div className="mod-detail-title-row">
          <h3 className="mod-detail-slug">
            {suggestion.kind === 'new-term'
              ? (suggestion.proposedSourceTerm || suggestion.normalizedSourceTerm || 'New term')
              : (suggestion.termSlug || suggestion.id.slice(0, 8))}
          </h3>
          <ModBadge status={suggestion.status} />
          <span className="badge-mod kind">
            {suggestion.kind === 'new-term' ? 'new term' : 'improvement'}
          </span>
        </div>
        <p className="mod-detail-meta">
          ID: <code>{suggestion.id}</code> &middot; Submitted: {formatTs(suggestion.createdAt)}
        </p>
      </div>

      {suggestion.proposedTranslation ? (
        <div className="mod-section">
          <p className="mod-section-label">Proposed translation</p>
          <p className="mod-detail-translation">{suggestion.proposedTranslation}</p>
        </div>
      ) : null}

      {suggestion.proposedOriginBackground ? (
        <div className="mod-section">
          <p className="mod-section-label">Proposed origin / background</p>
          <p className="mod-detail-body">{suggestion.proposedOriginBackground}</p>
        </div>
      ) : null}

      {suggestion.proposedVervaekeUsage ? (
        <div className="mod-section">
          <p className="mod-section-label">Proposed Vervaeke usage</p>
          <p className="mod-detail-body">{suggestion.proposedVervaekeUsage}</p>
        </div>
      ) : null}

      <div className="mod-section">
        <p className="mod-section-label">Meta</p>
        <div className="mod-meta-grid">
          {suggestion.proposedTargetLanguage ? (
            <div>
              <p className="mod-section-label mod-section-subtle">Target language</p>
              <p className="mod-detail-body">{suggestion.proposedTargetLanguage}</p>
            </div>
          ) : null}
          {suggestion.submitterEmailHash ? (
            <div>
              <p className="mod-section-label mod-section-subtle">Submitter hash</p>
              <p className="mod-detail-body"><code>{suggestion.submitterEmailHash.slice(0, 12)}…</code></p>
            </div>
          ) : null}
          {suggestion.approvalClickedAt ? (
            <div>
              <p className="mod-section-label mod-section-subtle">Email confirmed</p>
              <p className="mod-detail-body">{formatTs(suggestion.approvalClickedAt)}</p>
            </div>
          ) : null}
          {suggestion.lastModerationReason ? (
            <div>
              <p className="mod-section-label mod-section-subtle">Last reason</p>
              <p className="mod-detail-body">{suggestion.lastModerationReason}</p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mod-section">
        <p className="mod-section-label">Transition</p>
        {isTerminal ? (
          <p className="mod-terminal">Terminal state — no further transitions allowed.</p>
        ) : pendingTo ? (
          <form className="mod-transition-panel" onSubmit={(e) => void handleTransition(e)}>
            <p className="mod-section-label">
              Confirm: {suggestion.status} → <ModBadge status={pendingTo} />
            </p>
            <div className="mod-transition-row">
              <input
                className="mod-input"
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason (optional)"
                disabled={transitioning}
                autoFocus
              />
              <button type="submit" className="mod-btn-primary" disabled={transitioning}>
                {transitioning ? 'Working…' : 'Confirm'}
              </button>
              <button
                type="button"
                className="mod-btn-secondary"
                onClick={() => {
                  setPendingTo(null)
                  setReason('')
                }}
                disabled={transitioning}
              >
                Cancel
              </button>
            </div>
            {transitionError ? <p className="mod-error">{transitionError}</p> : null}
          </form>
        ) : (
          <div className="mod-transition-row">
            {allowedNext.map((s) => (
              <button
                key={s}
                type="button"
                className="mod-btn-secondary"
                onClick={() => {
                  setPendingTo(s)
                  setTransitionError('')
                }}
              >
                → {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mod-section">
        <p className="mod-section-label">Audit trail</p>
        {events.length === 0 ? (
          <p className="mod-terminal">No moderation events yet.</p>
        ) : (
          <ol className="mod-audit-list">
            {events.map((ev) => (
              <li key={ev.id} className="mod-audit-item">
                <span className="mod-audit-time">{formatTs(ev.createdAt)}</span>
                <span className="mod-audit-arrow">
                  <ModBadge status={ev.fromStatus} />
                  <span className="mod-audit-sep">→</span>
                  <ModBadge status={ev.toStatus} />
                </span>
                <span className="mod-audit-actor">{ev.actor}</span>
                {ev.reason ? <span className="mod-audit-reason">"{ev.reason}"</span> : null}
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="mod-section mod-delete-section">
        <p className="mod-section-label">Danger zone</p>
        {deleteConfirming ? (
          <div className="mod-delete-confirm-panel">
            <p className="mod-delete-warn">Permanent. For test-data cleanup only. Do not use for normal moderation.</p>
            <div className="mod-transition-row">
              <input
                className="mod-input"
                type="text"
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="Reason (required)"
                disabled={deleting}
                autoFocus
              />
              <button
                type="button"
                className="mod-btn-danger"
                onClick={() => void handleDelete()}
                disabled={deleting || !deleteReason.trim()}
              >
                {deleting ? 'Deleting…' : 'Permanently delete test submission'}
              </button>
              <button
                type="button"
                className="mod-btn-secondary"
                onClick={() => { setDeleteConfirming(false); setDeleteReason(''); setDeleteError('') }}
                disabled={deleting}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="mod-btn-danger"
            onClick={() => { setDeleteConfirming(true); setDeleteError('') }}
          >
            Delete test submission
          </button>
        )}
        {deleteError ? <p className="mod-error">{deleteError}</p> : null}
      </div>
    </div>
  )
}

export function ModerationPanel() {
  const [adminSecret, setAdminSecret] = useState('')
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [unlocking, setUnlocking] = useState(false)
  const [unlockError, setUnlockError] = useState('')
  const [healthy, setHealthy] = useState<boolean | null>(null)
  const [suggestions, setSuggestions] = useState<SuggestionSummary[]>([])
  const [statusMeta, setStatusMeta] = useState<StatusMeta[]>([])
  const [filterKind, setFilterKind] = useState<SuggestionKind | ''>('')
  const [filterStatus, setFilterStatus] = useState<SuggestionStatus | ''>('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [listError, setListError] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)

  const allStatuses: SuggestionStatus[] = useMemo(() => [
    'wait-click', 'contender', 'await-review', 'current',
    'replaced', 'rejected-unworthy', 'hidden-inappropriate', 'hidden-owner-deleted',
  ], [])

  const loadList = useCallback(async () => {
    setLoading(true)
    setListError('')
    try {
      const data = await listSuggestions({
        kind: filterKind || undefined,
        status: filterStatus || undefined,
        page,
        pageSize: PAGE_SIZE,
        includeHidden: isUnlocked,
      })
      setSuggestions(data.suggestions)
      setPage(data.page)
      setTotal(data.total)
      setTotalPages(data.totalPages)
      if (data.suggestions.length === 0) {
        setSelectedId(null)
      }
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Failed to load suggestions')
    } finally {
      setLoading(false)
    }
  }, [filterKind, filterStatus, isUnlocked, page])

  useEffect(() => {
    checkHealth().then((ok) => {
      setHealthy(ok)
      if (ok) {
        void loadList()
        getStatusMeta().then(setStatusMeta).catch(() => {})
      }
    })
  }, [loadList])

  useEffect(() => {
    setSelectedId(null)
  }, [filterKind, filterStatus, page, isUnlocked])

  async function handleUnlock() {
    if (!adminSecret.trim()) {
      setUnlockError('Enter the admin secret to unlock suggestion detail and moderation actions.')
      return
    }
    setUnlocking(true)
    setUnlockError('')
    try {
      await verifyModeratorSecret(adminSecret)
      setIsUnlocked(true)
    } catch (err) {
      setIsUnlocked(false)
      setSelectedId(null)
      setUnlockError(err instanceof Error ? err.message : 'Failed to unlock moderator view')
    } finally {
      setUnlocking(false)
    }
  }

  function handleLock() {
    setIsUnlocked(false)
    setSelectedId(null)
    setUnlockError('')
  }

  function changePage(nextPage: number) {
    setPage(Math.min(Math.max(1, nextPage), totalPages))
  }

  return (
    <div className="mod-shell">
      <div className="mod-toolbar">
        <div className="mod-filters">
          <div className="mod-filter-field">
            <span>Kind</span>
            <select
              className="mod-select"
              value={filterKind}
              onChange={(e) => {
                setFilterKind(e.target.value as SuggestionKind | '')
                setPage(1)
              }}
            >
              <option value="">All kinds</option>
              <option value="translation-improvement">Translation improvement</option>
              <option value="new-term">New term</option>
            </select>
          </div>
          <div className="mod-filter-field">
            <span>Status</span>
            <select
              className="mod-select"
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value as SuggestionStatus | '')
                setPage(1)
              }}
            >
              <option value="">All statuses</option>
              {allStatuses.map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="mod-btn-secondary"
            onClick={() => void loadList()}
            disabled={loading || healthy === false}
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
        <div className="mod-secret-field">
          <span>Admin secret</span>
          <div className="mod-secret-controls">
            <input
              type="password"
              className="mod-input mod-secret-input"
              value={adminSecret}
              onChange={(e) => {
                setAdminSecret(e.target.value)
                setUnlockError('')
              }}
              placeholder="Enter LOCAL_SUBMISSIONS_ADMIN_SECRET"
              autoComplete="off"
            />
            {isUnlocked ? (
              <button type="button" className="mod-btn-secondary" onClick={handleLock}>
                Lock
              </button>
            ) : (
              <button type="button" className="mod-btn-primary" onClick={() => void handleUnlock()} disabled={unlocking}>
                {unlocking ? 'Unlocking…' : 'Unlock'}
              </button>
            )}
          </div>
          {unlockError ? <p className="mod-error mod-inline-error">{unlockError}</p> : null}
          {!unlockError ? (
            <p className="mod-inline-note">
              Without the secret, the queue shows only phrase, submitted time, status, and submitter nickname.
            </p>
          ) : null}
        </div>
      </div>

      {healthy === false ? (
        <div className="mod-backend-error">
          <p className="mod-error">Backend offline. Start it with: <code>npm run backend:dev</code></p>
        </div>
      ) : healthy === null ? (
        <div className="mod-connecting">Connecting to backend…</div>
      ) : (
        <div className="mod-body">
          <div className="mod-queue">
            {listError ? <p className="mod-queue-error mod-error">{listError}</p> : null}
            {suggestions.length === 0 && !loading ? (
              <p className="mod-empty">No suggestions match the current filters.</p>
            ) : null}

            {suggestions.map((s) => {
              const phrase = displayQueuePhrase(s)
              const sharedClass = `mod-queue-row ${s.id === selectedId ? 'mod-queue-row--selected' : ''} ${!isUnlocked ? 'mod-queue-row--locked' : ''}`

              return isUnlocked ? (
                <button
                  key={s.id}
                  type="button"
                  className={sharedClass}
                  onClick={() => setSelectedId(s.id)}
                >
                  <div className="mod-row-top">
                    <span className="mod-row-slug">{phrase}</span>
                    <div className="mod-row-badges">
                      <ModBadge status={s.status} />
                    </div>
                  </div>
                  <div className="mod-row-date">
                    <span>{formatTs(s.createdAt)}</span>
                  </div>
                  <div className="mod-row-date mod-row-date--secondary">
                    <span>{s.submitterNickname || 'Anonymous'}</span>
                    <span>{s.kind === 'new-term' ? 'new term' : 'improvement'}</span>
                  </div>
                </button>
              ) : (
                <div key={s.id} className={sharedClass} aria-disabled="true">
                  <div className="mod-row-top">
                    <span className="mod-row-slug">{phrase}</span>
                    <div className="mod-row-badges">
                      <ModBadge status={s.status} />
                    </div>
                  </div>
                  <div className="mod-row-date">
                    <span>{formatTs(s.createdAt)}</span>
                  </div>
                  <div className="mod-row-date mod-row-date--secondary">
                    <span>{s.submitterNickname || 'Anonymous'}</span>
                    <span>{s.kind === 'new-term' ? 'new term' : 'improvement'}</span>
                  </div>
                </div>
              )
            })}

            <div className="mod-pagination">
              <button
                type="button"
                className="mod-btn-secondary"
                onClick={() => changePage(page - 1)}
                disabled={page <= 1 || loading}
              >
                Previous
              </button>
              <p className="mod-pagination-label">
                Page {page} of {totalPages} · {total} total
              </p>
              <button
                type="button"
                className="mod-btn-secondary"
                onClick={() => changePage(page + 1)}
                disabled={page >= totalPages || loading}
              >
                Next
              </button>
            </div>
          </div>

          <div className="mod-detail-pane">
            {!isUnlocked ? (
              <div className="mod-empty mod-empty-detail mod-empty-detail--locked">
                <p>Queue summary is visible, but suggestion detail stays locked until the admin secret is verified.</p>
                <p>After unlocking, queue entries become clickable and full moderation actions are enabled.</p>
              </div>
            ) : selectedId ? (
              <DetailPane
                key={selectedId}
                id={selectedId}
                adminSecret={adminSecret}
                statusMeta={statusMeta}
                onTransitioned={() => void loadList()}
                onDeleted={() => { setSelectedId(null); void loadList() }}
              />
            ) : (
              <div className="mod-empty mod-empty-detail">
                <p>Select a suggestion from the queue to review it.</p>
                {total > 0 ? <p>{total} suggestion{total !== 1 ? 's' : ''} match the current filters.</p> : null}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
