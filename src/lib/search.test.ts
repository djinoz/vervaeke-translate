import { describe, expect, it } from 'vitest'

import { searchCorpus } from './search'
import type { SeedCorpusEntry } from '../types/corpus'

const sampleEntries: SeedCorpusEntry[] = [
  {
    term: 'Dialogos',
    slug: 'dialogos',
    target_language: 'plain-english',
    translation: 'Shared movement of meaning through dialogue.',
    origin_background: 'Greek dialogos with dia and logos roots.',
    vervaeke_usage: 'Participatory dialogue rather than debate.',
    provenance: ['seed'],
    source_note_title: 'sample',
    source_note_id: '',
    source_link: '',
    status: 'seed-candidate',
    origin_confidence: 'provisional',
    notes: '',
  },
  {
    term: 'Logos',
    slug: 'logos',
    target_language: 'plain-english',
    translation: 'Reason, word, and intelligible order.',
    origin_background: 'Classical Greek philosophical background.',
    vervaeke_usage: 'Shared truth-bearing space.',
    provenance: ['seed'],
    source_note_title: 'sample',
    source_note_id: '',
    source_link: '',
    status: 'seed-current',
    origin_confidence: 'provisional',
    notes: '',
  },
  {
    term: 'Religio',
    slug: 'religio',
    target_language: 'plain-english',
    translation: 'Meaning-binding dimension of life.',
    origin_background: 'Latin-rooted term related to binding or reconnecting.',
    vervaeke_usage: 'Not identical with institutional religion.',
    provenance: ['seed'],
    source_note_title: 'sample',
    source_note_id: '',
    source_link: '',
    status: 'seed-current',
    origin_confidence: 'grounded',
    notes: '',
  },
]

describe('searchCorpus', () => {
  it('prefers exact term-prefix hits over later text matches', () => {
    const results = searchCorpus(sampleEntries, 'log')
    expect(results[0]?.term).toBe('Logos')
  })

  it('finds entries through origin/background text', () => {
    const results = searchCorpus(sampleEntries, 'latin reconnecting')
    expect(results.map((entry) => entry.term)).toEqual(['Religio'])
  })

  it('keeps current entries ahead of candidate ones when both match', () => {
    const results = searchCorpus(sampleEntries, 'meaning')
    expect(results[0]?.status).toBe('seed-current')
    expect(results.at(-1)?.term).toBe('Dialogos')
  })
})
