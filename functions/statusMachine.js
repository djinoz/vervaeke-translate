export const suggestionStatuses = [
  'wait-click',
  'contender',
  'await-review',
  'current',
  'replaced',
  'rejected-unworthy',
  'hidden-inappropriate',
  'hidden-owner-deleted',
]

export const terminalSuggestionStatuses = new Set([
  'replaced',
  'rejected-unworthy',
  'hidden-inappropriate',
  'hidden-owner-deleted',
])

const allowedTransitions = {
  'wait-click': new Set(['contender', 'hidden-inappropriate', 'hidden-owner-deleted']),
  contender: new Set(['await-review', 'current', 'replaced', 'rejected-unworthy', 'hidden-inappropriate', 'hidden-owner-deleted']),
  'await-review': new Set(['current', 'replaced', 'rejected-unworthy', 'hidden-inappropriate', 'hidden-owner-deleted']),
  current: new Set(['replaced', 'hidden-inappropriate', 'hidden-owner-deleted']),
  replaced: new Set(),
  'rejected-unworthy': new Set(),
  'hidden-inappropriate': new Set(),
  'hidden-owner-deleted': new Set(),
}

export function isSuggestionStatus(value) {
  return suggestionStatuses.includes(value)
}

export function getAllowedNextStatuses(status) {
  return Array.from(allowedTransitions[status] ?? [])
}

export function assertSuggestionStatus(status) {
  if (!isSuggestionStatus(status)) {
    throw new Error(`Unknown suggestion status: ${status}`)
  }
}

export function assertTransitionAllowed(fromStatus, toStatus) {
  assertSuggestionStatus(fromStatus)
  assertSuggestionStatus(toStatus)

  if (fromStatus === toStatus) {
    return
  }

  if (!allowedTransitions[fromStatus]?.has(toStatus)) {
    throw new Error(`Illegal suggestion status transition: ${fromStatus} -> ${toStatus}`)
  }
}

export function initialStatusForKind(kind) {
  if (kind === 'translation-improvement') {
    return 'wait-click'
  }

  if (kind === 'new-term') {
    return 'await-review'
  }

  throw new Error(`Unknown suggestion kind: ${kind}`)
}
