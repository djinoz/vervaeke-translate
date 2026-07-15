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

  it('includes the first user-curated POD k1 additions', () => {
    expect(bySlug.has('flow-state')).toBe(true)
    expect(bySlug.has('socrates')).toBe(true)
    expect(bySlug.has('mindfulness')).toBe(true)
    expect(bySlug.has('heidegger')).toBe(true)
    expect(bySlug.has('psychotechnology')).toBe(true)
  })

  it('includes the user-curated POD k2 additions', () => {
    expect(bySlug.has('teleology')).toBe(true)
    expect(bySlug.has('meaning-crisis')).toBe(true)
    expect(bySlug.has('hegelian-dialectic')).toBe(true)
    expect(bySlug.has('consciousness')).toBe(true)
    expect(bySlug.has('spirituality')).toBe(true)
  })

  it('reports the new corpus size accurately', () => {
    expect(seedCorpusStats.totalEntries).toBe(123)
  })
})
