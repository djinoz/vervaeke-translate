export type EntryStatus = 'seed-current' | 'seed-candidate'
export type OriginConfidence = 'grounded' | 'provisional' | 'blank'

export interface SeedCorpusEntry {
  term: string
  slug: string
  target_language: string
  translation: string
  origin_background: string
  vervaeke_usage: string
  provenance: string[]
  source_note_title: string
  source_note_id: string
  source_link: string
  status: EntryStatus
  origin_confidence: OriginConfidence
  notes: string
}

export interface CorpusStats {
  totalEntries: number
  currentEntries: number
  candidateEntries: number
  entriesWithOrigin: number
  provisionalEntries: number
}
