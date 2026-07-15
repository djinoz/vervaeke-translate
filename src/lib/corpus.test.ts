import { describe, expect, it } from 'vitest'

import { seedCorpusEntries, seedCorpusStats } from './corpus'

const bySlug = new Map(seedCorpusEntries.map((entry) => [entry.slug, entry]))

describe('seed corpus', () => {
  it('includes the 4P / 4E framework entries', () => {
    expect(bySlug.has('4ps-of-knowing')).toBe(true)
    expect(bySlug.has('propositional-knowing')).toBe(true)
    expect(bySlug.has('procedural-knowing')).toBe(true)
    expect(bySlug.has('perspectival-knowing')).toBe(true)
    expect(bySlug.has('participatory-knowing')).toBe(true)
    expect(bySlug.has('4e-cognition')).toBe(true)
    expect(bySlug.has('embodied-cognition')).toBe(true)
    expect(bySlug.has('embedded-cognition')).toBe(true)
    expect(bySlug.has('enactive-cognition')).toBe(true)
    expect(bySlug.has('extended-cognition')).toBe(true)
  })

  it('includes the high-centrality meaning-crisis additions', () => {
    expect(bySlug.has('relevance-realization')).toBe(true)
    expect(bySlug.has('reciprocal-narrowing-parasitic-processing')).toBe(true)
    expect(bySlug.has('reciprocal-opening')).toBe(true)
    expect(bySlug.has('being-vs-having-mode')).toBe(true)
    expect(bySlug.has('super-salience')).toBe(true)
  })

  it('upgrades participatory knowing with background and usage', () => {
    const entry = bySlug.get('participatory-knowing')
    expect(entry?.origin_background.length).toBeGreaterThan(20)
    expect(entry?.vervaeke_usage.length).toBeGreaterThan(20)
  })

  it('reports the new corpus size accurately', () => {
    expect(seedCorpusStats.totalEntries).toBe(58)
  })
})
