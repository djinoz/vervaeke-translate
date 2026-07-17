export const collectionNames = {
  terms: 'terms',
  translations: 'translations',
  sources: 'sources',
  suggestions: 'suggestions',
  moderationEvents: 'moderation_events',
} as const

export const translationStatuses = ['current', 'candidate', 'await-review', 'replaced'] as const

export const suggestionStatuses = [
  'wait-click',
  'contender',
  'await-review',
  'current',
  'replaced',
  'rejected-unworthy',
  'hidden-inappropriate',
  'hidden-owner-deleted',
] as const

export type TranslationStatus = (typeof translationStatuses)[number]
export type SuggestionStatus = (typeof suggestionStatuses)[number]

export interface FirestoreTerm {
  slug: string
  term: string
  normalizedTerm: string
  sourceLanguage: string
  searchTerms: string[]
  public: boolean
  seedStatus: 'current' | 'candidate'
  notes: string
}

export interface FirestoreTranslation {
  termSlug: string
  targetLanguage: string
  translation: string
  originBackground: string
  vervaekeUsage: string
  status: TranslationStatus
  originConfidence: 'grounded' | 'provisional' | 'blank'
  isPublic: boolean
  isSeed: boolean
  sortKey: number
  sourceIds: string[]
}

export interface FirestoreSource {
  sourceId: string
  kind: 'joplin-note' | 'transcript' | 'human-glossary' | 'manual'
  title: string
  externalRef: string
  link: string
  public: boolean
}

export interface FirestoreSuggestion {
  kind: 'translation-improvement' | 'new-term'
  termSlug: string
  sourceLanguage: string
  proposedSourceTerm: string
  normalizedSourceTerm: string
  proposedTargetLanguage: string
  proposedTranslation: string
  proposedOriginBackground: string
  proposedVervaekeUsage: string
  submitterEmailHash: string
  captchaScore: number
  captchaVerified: boolean
  status: SuggestionStatus
  approvalClickedAt?: string
  lastModerationReason?: string
}
