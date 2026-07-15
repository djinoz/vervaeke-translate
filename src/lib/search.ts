import type { SeedCorpusEntry } from '../types/corpus'

export function normalizeForSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function matchesQuery(entry: SeedCorpusEntry, query: string): boolean {
  const normalizedQuery = normalizeForSearch(query)
  if (!normalizedQuery) return true

  const haystack = normalizeForSearch(
    [
      entry.term,
      entry.translation,
      entry.origin_background,
      entry.vervaeke_usage,
      entry.notes,
    ].join(' '),
  )

  return normalizedQuery
    .split(' ')
    .filter(Boolean)
    .every((token) => haystack.includes(token))
}

export function searchCorpus(entries: SeedCorpusEntry[], query: string): SeedCorpusEntry[] {
  return entries
    .filter((entry) => matchesQuery(entry, query))
    .sort((left, right) => {
      const leftStarts = normalizeForSearch(left.term).startsWith(normalizeForSearch(query)) ? 1 : 0
      const rightStarts = normalizeForSearch(right.term).startsWith(normalizeForSearch(query)) ? 1 : 0

      if (leftStarts !== rightStarts) {
        return rightStarts - leftStarts
      }

      if (left.status !== right.status) {
        return left.status === 'seed-current' ? -1 : 1
      }

      return left.term.localeCompare(right.term)
    })
}
