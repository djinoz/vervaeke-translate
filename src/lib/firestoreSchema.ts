export const collectionNames = {
  terms: 'terms',
  translations: 'translations',
  sources: 'sources',
  suggestions: 'suggestions',
  moderationEvents: 'moderation_events',
} as const

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
  status: 'current' | 'candidate' | 'await-review' | 'replaced'
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
  proposedTargetLanguage: string
  proposedTranslation: string
  proposedOriginBackground: string
  proposedVervaekeUsage: string
  submitterEmailHash: string
  captchaScore: number
  status: 'wait-click' | 'await-review'
}
