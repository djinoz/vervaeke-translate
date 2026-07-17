import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function convertTimestamps(obj) {
  if (!obj || typeof obj !== 'object') return obj
  const result = { ...obj }
  for (const key of Object.keys(result)) {
    const v = result[key]
    if (v && typeof v.toDate === 'function') {
      result[key] = v.toDate().toISOString()
    }
  }
  return result
}

function docToObject(doc) {
  if (!doc.exists) return null
  return convertTimestamps(doc.data())
}

function sortNewestFirst(items) {
  return [...items].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

export function createMemorySuggestionRepository(seed = { suggestions: [], moderationEvents: [] }) {
  const state = {
    suggestions: sortNewestFirst(seed.suggestions ?? []),
    moderationEvents: sortNewestFirst(seed.moderationEvents ?? []),
  }

  return {
    async createSuggestion(suggestion) {
      state.suggestions.unshift(clone(suggestion))
      return clone(suggestion)
    },
    async getSuggestion(id) {
      return clone(state.suggestions.find((suggestion) => suggestion.id === id) ?? null)
    },
    async listSuggestions(filters = {}) {
      return clone(
        state.suggestions.filter((suggestion) => {
          if (filters.kind && suggestion.kind !== filters.kind) {
            return false
          }

          if (filters.status && suggestion.status !== filters.status) {
            return false
          }

          if (filters.termSlug && suggestion.termSlug !== filters.termSlug) {
            return false
          }

          return true
        }),
      )
    },
    async updateSuggestion(id, updateFn) {
      const index = state.suggestions.findIndex((suggestion) => suggestion.id === id)
      if (index === -1) {
        return null
      }

      const current = clone(state.suggestions[index])
      const next = clone(updateFn(current))
      state.suggestions[index] = next
      return clone(next)
    },
    async appendModerationEvent(event) {
      state.moderationEvents.unshift(clone(event))
      return clone(event)
    },
    async listModerationEvents(entityId) {
      return clone(
        state.moderationEvents.filter((event) => (entityId ? event.entityId === entityId : true)),
      )
    },
  }
}

async function ensureStore(storePath) {
  try {
    const raw = await readFile(storePath, 'utf8')
    const parsed = JSON.parse(raw)

    return {
      suggestions: sortNewestFirst(parsed.suggestions ?? []),
      moderationEvents: sortNewestFirst(parsed.moderationEvents ?? []),
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      await mkdir(path.dirname(storePath), { recursive: true })
      const empty = { suggestions: [], moderationEvents: [] }
      await writeFile(storePath, JSON.stringify(empty, null, 2))
      return empty
    }

    throw error
  }
}

export function createFirestoreSuggestionRepository(db) {
  const suggestionsCol = db.collection('suggestions')
  const eventsCol = db.collection('moderation_events')

  return {
    async createSuggestion(suggestion) {
      await suggestionsCol.doc(suggestion.id).set(suggestion)
      return clone(suggestion)
    },

    async getSuggestion(id) {
      const doc = await suggestionsCol.doc(id).get()
      return docToObject(doc)
    },

    async listSuggestions(filters = {}) {
      const snapshot = await suggestionsCol.orderBy('createdAt', 'desc').get()
      return snapshot.docs.map(docToObject).filter((s) => {
        if (filters.kind && s.kind !== filters.kind) return false
        if (filters.status && s.status !== filters.status) return false
        if (filters.termSlug && s.termSlug !== filters.termSlug) return false
        return true
      })
    },

    async updateSuggestion(id, updateFn) {
      const ref = suggestionsCol.doc(id)
      let result = null
      await db.runTransaction(async (tx) => {
        const doc = await tx.get(ref)
        if (!doc.exists) return
        const current = convertTimestamps(doc.data())
        const next = clone(updateFn(current))
        tx.set(ref, next)
        result = next
      })
      return result
    },

    async appendModerationEvent(event) {
      await eventsCol.doc(event.id).set(event)
      return clone(event)
    },

    async listModerationEvents(entityId) {
      const query = entityId ? eventsCol.where('entityId', '==', entityId) : eventsCol
      const snapshot = await query.get()
      return snapshot.docs
        .map(docToObject)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    },
  }
}

export function createJsonFileSuggestionRepository(storePath) {
  async function readStore() {
    return ensureStore(storePath)
  }

  async function persist(store) {
    await mkdir(path.dirname(storePath), { recursive: true })
    await writeFile(storePath, JSON.stringify(store, null, 2))
  }

  return {
    async createSuggestion(suggestion) {
      const store = await readStore()
      store.suggestions.unshift(clone(suggestion))
      await persist(store)
      return clone(suggestion)
    },
    async getSuggestion(id) {
      const store = await readStore()
      return clone(store.suggestions.find((suggestion) => suggestion.id === id) ?? null)
    },
    async listSuggestions(filters = {}) {
      const store = await readStore()
      return clone(
        store.suggestions.filter((suggestion) => {
          if (filters.kind && suggestion.kind !== filters.kind) {
            return false
          }

          if (filters.status && suggestion.status !== filters.status) {
            return false
          }

          if (filters.termSlug && suggestion.termSlug !== filters.termSlug) {
            return false
          }

          return true
        }),
      )
    },
    async updateSuggestion(id, updateFn) {
      const store = await readStore()
      const index = store.suggestions.findIndex((suggestion) => suggestion.id === id)
      if (index === -1) {
        return null
      }

      const current = clone(store.suggestions[index])
      const next = clone(updateFn(current))
      store.suggestions[index] = next
      await persist(store)
      return clone(next)
    },
    async appendModerationEvent(event) {
      const store = await readStore()
      store.moderationEvents.unshift(clone(event))
      await persist(store)
      return clone(event)
    },
    async listModerationEvents(entityId) {
      const store = await readStore()
      return clone(
        store.moderationEvents.filter((event) => (entityId ? event.entityId === entityId : true)),
      )
    },
  }
}
