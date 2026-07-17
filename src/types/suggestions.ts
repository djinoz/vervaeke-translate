export type SuggestionStatus =
  | 'wait-click'
  | 'contender'
  | 'await-review'
  | 'current'
  | 'replaced'
  | 'rejected-unworthy'
  | 'hidden-inappropriate'
  | 'hidden-owner-deleted'

export type SuggestionKind = 'translation-improvement' | 'new-term'

export interface Suggestion {
  id: string
  kind: SuggestionKind
  termSlug: string
  sourceLanguage: string
  proposedSourceTerm: string
  normalizedSourceTerm: string
  proposedTargetLanguage: string
  proposedTranslation: string
  proposedOriginBackground: string
  proposedVervaekeUsage: string
  submitterNickname: string
  submitterEmailHash: string
  submitterAuthUid?: string
  captchaScore: number
  captchaVerified: boolean
  status: SuggestionStatus
  createdAt: string
  updatedAt: string
  approvalClickedAt: string
  lastModerationReason: string
}

export interface SuggestionSummary {
  id: string
  kind: SuggestionKind
  termSlug: string
  proposedSourceTerm: string
  submitterNickname: string
  status: SuggestionStatus
  createdAt: string
}

export interface SuggestionListPage {
  suggestions: SuggestionSummary[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface ModerationEvent {
  id: string
  entityType: string
  entityId: string
  fromStatus: SuggestionStatus
  toStatus: SuggestionStatus
  actor: string
  reason: string
  createdAt: string
}

export interface StatusMeta {
  status: SuggestionStatus
  allowedNextStatuses: SuggestionStatus[]
}
