import seedCorpus from '../../data/seed/vervaeke_seed_corpus.json'
import type { CorpusStats, SeedCorpusEntry } from '../types/corpus'

const rawEntries = seedCorpus as SeedCorpusEntry[]

export const seedCorpusEntries: SeedCorpusEntry[] = rawEntries.map((entry) => ({
  ...entry,
  provenance: Array.isArray(entry.provenance) ? entry.provenance : [String(entry.provenance)],
}))

export const seedCorpusStats: CorpusStats = {
  totalEntries: seedCorpusEntries.length,
  currentEntries: seedCorpusEntries.filter((entry) => entry.status === 'seed-current').length,
  candidateEntries: seedCorpusEntries.filter((entry) => entry.status === 'seed-candidate').length,
  entriesWithOrigin: seedCorpusEntries.filter((entry) => entry.origin_background.trim().length > 0).length,
  provisionalEntries: seedCorpusEntries.filter((entry) => entry.origin_confidence === 'provisional').length,
}

export const targetLanguageOptions = [
  { value: 'plain-english', label: 'Plain English' },
  { value: 'fr', label: 'French (later)' },
  { value: 'de', label: 'German (later)' },
  { value: 'platonic-mentor', label: 'Platonic mentor (later)' },
] as const
