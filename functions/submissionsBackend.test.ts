// @ts-nocheck
import { describe, expect, it } from 'vitest'

import { createFirestoreSuggestionRepository, createMemorySuggestionRepository } from './repository.js'
import { createTrustedSuggestionApp } from './server.js'
import {
  getAllowedNextStatuses,
  initialStatusForKind,
  suggestionStatuses,
} from './statusMachine.js'

function createMockFirestore() {
  const data: Record<string, Record<string, unknown>> = {}

  function getCol(name: string) {
    if (!data[name]) data[name] = {}
    return data[name]
  }

  function makeDocSnap(colName: string, docId: string) {
    const col = getCol(colName)
    const docData = col[docId]
    return {
      exists: docData !== undefined,
      data: () => (docData !== undefined ? { ...docData as object } : undefined),
      id: docId,
    }
  }

  function makeDocRef(colName: string, docId: string) {
    return {
      _colName: colName,
      _docId: docId,
      async get() { return makeDocSnap(colName, docId) },
      async set(newData: unknown) { getCol(colName)[docId] = { ...(newData as object) } },
    }
  }

  function applyFilters(entries: [string, unknown][], filters: { field: string; op: string; value: unknown }[]) {
    return entries.filter(([, docData]) => {
      for (const { field, op, value } of filters) {
        if (op === '==' && (docData as Record<string, unknown>)[field] !== value) return false
      }
      return true
    })
  }

  function makeQuery(colName: string, filters: { field: string; op: string; value: unknown }[] = [], orderField: string | null = null, orderDir = 'asc') {
    return {
      where(field: string, op: string, value: unknown) {
        return makeQuery(colName, [...filters, { field, op, value }], orderField, orderDir)
      },
      orderBy(field: string, dir = 'asc') {
        return makeQuery(colName, filters, field, dir)
      },
      async get() {
        const col = getCol(colName)
        let entries = Object.entries(col)
        entries = applyFilters(entries, filters)
        if (orderField) {
          entries.sort(([, a], [, b]) => {
            const av = String((a as Record<string, unknown>)[orderField] ?? '')
            const bv = String((b as Record<string, unknown>)[orderField] ?? '')
            return orderDir === 'desc' ? bv.localeCompare(av) : av.localeCompare(bv)
          })
        }
        return {
          docs: entries.map(([id, docData]) => ({
            exists: true,
            data: () => ({ ...(docData as object) }),
            id,
          })),
        }
      },
    }
  }

  return {
    collection(colName: string) {
      return {
        doc(docId: string) { return makeDocRef(colName, docId) },
        where(field: string, op: string, value: unknown) { return makeQuery(colName, [{ field, op, value }]) },
        orderBy(field: string, dir = 'asc') { return makeQuery(colName, [], field, dir) },
        async get() { return makeQuery(colName).get() },
      }
    },
    async runTransaction(fn: (tx: unknown) => Promise<void>) {
      const writes: { ref: ReturnType<typeof makeDocRef>; newData: unknown }[] = []
      const tx = {
        async get(ref: ReturnType<typeof makeDocRef>) { return ref.get() },
        set(ref: ReturnType<typeof makeDocRef>, newData: unknown) { writes.push({ ref, newData }) },
      }
      await fn(tx)
      for (const { ref, newData } of writes) {
        await ref.set(newData)
      }
    },
  }
}

async function json(response: Response) {
  return response.json()
}

describe('local submissions backend', () => {
  it('forces translation suggestions into wait-click and ignores client status', async () => {
    const repository = createMemorySuggestionRepository()
    const app = createTrustedSuggestionApp({ repository, adminSecret: 'test-secret' })

    const response = await app.handle(
      new Request('http://local.test/api/suggestions/translation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          termSlug: 'Logos',
          proposedTargetLanguage: 'Plain English',
          proposedTranslation: 'Shared truth-bearing meaning space.',
          proposedOriginBackground: 'Greek background.',
          proposedVervaekeUsage: 'Vervaeke usage.',
          submitterEmail: 'Test@Example.com',
          status: 'current',
        }),
      }),
    )

    expect(response.status).toBe(201)
    const payload = await json(response)
    expect(payload.suggestion.status).toBe('wait-click')
    expect(payload.ignoredClientFields).toEqual(['status'])
    expect(payload.localEmailStub.approvalToken).toBeTruthy()

    const stored = await repository.getSuggestion(payload.suggestion.id)
    expect(stored?.status).toBe('wait-click')
    expect(stored?.submitterEmailHash).not.toBe('Test@Example.com')
  })

  it('submits existing-term suggestions in Firebase email-link mode without returning a stub token', async () => {
    const repository = createMemorySuggestionRepository()
    const upsertCalls: { email: string; displayName: string }[] = []
    const app = createTrustedSuggestionApp({
      repository,
      adminSecret: 'test-secret',
      emailMode: 'firebase-auth-email-link',
      emailBlocker: null,
      authService: {
        async upsertEmailLinkUser(payload: { email: string; displayName: string }) {
          upsertCalls.push(payload)
          return 'firebase-user-1'
        },
      },
    })

    const response = await app.handle(
      new Request('http://local.test/api/suggestions/translation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          termSlug: 'Logos',
          proposedTargetLanguage: 'Plain English',
          proposedTranslation: 'Shared truth-bearing meaning space.',
          proposedOriginBackground: 'Greek background.',
          proposedVervaekeUsage: 'Vervaeke usage.',
          submitterEmail: 'Test@Example.com',
          submitterNickname: 'Logos Fan',
          status: 'current',
        }),
      }),
    )

    expect(response.status).toBe(201)
    const payload = await json(response)
    expect(payload.suggestion.status).toBe('wait-click')
    expect(payload.ignoredClientFields).toEqual(['status'])
    expect(payload.localEmailStub).toBeNull()
    expect(upsertCalls).toEqual([{ email: 'test@example.com', displayName: 'Logos Fan' }])

    const stored = await repository.getSuggestion(payload.suggestion.id)
    expect(stored?.submitterNickname).toBe('Logos Fan')
    expect(stored?.status).toBe('wait-click')
  })

  it('forces new terms into await-review and ignores client status', async () => {
    const repository = createMemorySuggestionRepository()
    const app = createTrustedSuggestionApp({ repository, adminSecret: 'test-secret' })

    const response = await app.handle(
      new Request('http://local.test/api/suggestions/new-term', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          proposedSourceTerm: 'Dialogos of Care',
          sourceLanguage: 'Greek',
          proposedTargetLanguage: 'plain-english',
          proposedTranslation: 'A caring shared movement of meaning.',
          submitterEmail: 'person@example.com',
          status: 'current',
        }),
      }),
    )

    expect(response.status).toBe(201)
    const payload = await json(response)
    expect(payload.suggestion.status).toBe('await-review')
    expect(payload.suggestion.termSlug).toBe('dialogos-of-care')
    expect(payload.ignoredClientFields).toEqual(['status'])
  })

  it('requires the approval token before moving wait-click to contender', async () => {
    const repository = createMemorySuggestionRepository()
    const app = createTrustedSuggestionApp({ repository, adminSecret: 'test-secret' })

    const submitResponse = await app.handle(
      new Request('http://local.test/api/suggestions/translation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          termSlug: 'Logos',
          proposedTargetLanguage: 'plain-english',
          proposedTranslation: 'Meaningful intelligibility.',
          submitterEmail: 'person@example.com',
        }),
      }),
    )
    const submitPayload = await json(submitResponse)

    const badConfirm = await app.handle(
      new Request(`http://local.test/api/suggestions/${submitPayload.suggestion.id}/confirm`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: 'wrong-token' }),
      }),
    )
    expect(badConfirm.status).toBe(403)

    const goodConfirm = await app.handle(
      new Request(`http://local.test/api/suggestions/${submitPayload.suggestion.id}/confirm`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: submitPayload.localEmailStub.approvalToken }),
      }),
    )
    expect(goodConfirm.status).toBe(200)
    const confirmed = await json(goodConfirm)
    expect(confirmed.suggestion.status).toBe('contender')

    const events = await repository.listModerationEvents(submitPayload.suggestion.id)
    expect(events).toHaveLength(1)
    expect(events[0]?.fromStatus).toBe('wait-click')
    expect(events[0]?.toStatus).toBe('contender')
  })

  it('requires a verified Firebase ID token before moving wait-click to contender in email-link mode', async () => {
    const repository = createMemorySuggestionRepository()
    const app = createTrustedSuggestionApp({
      repository,
      adminSecret: 'test-secret',
      emailMode: 'firebase-auth-email-link',
      emailBlocker: null,
      authService: {
        async upsertEmailLinkUser() {
          return 'firebase-user-1'
        },
        async verifyEmailLinkIdToken(idToken: string) {
          if (idToken !== 'valid-id-token') {
            throw new Error('bad token')
          }
          return {
            uid: 'firebase-user-1',
            email: 'person@example.com',
          }
        },
      },
    })

    const submitResponse = await app.handle(
      new Request('http://local.test/api/suggestions/translation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          termSlug: 'Logos',
          proposedTargetLanguage: 'plain-english',
          proposedTranslation: 'Meaningful intelligibility.',
          submitterEmail: 'person@example.com',
          submitterNickname: 'Person',
        }),
      }),
    )
    const submitPayload = await json(submitResponse)

    const badFinalize = await app.handle(
      new Request(`http://local.test/api/suggestions/${submitPayload.suggestion.id}/finalize-email-link`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idToken: 'wrong-token' }),
      }),
    )
    expect(badFinalize.status).toBe(403)

    const goodFinalize = await app.handle(
      new Request(`http://local.test/api/suggestions/${submitPayload.suggestion.id}/finalize-email-link`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idToken: 'valid-id-token' }),
      }),
    )
    expect(goodFinalize.status).toBe(200)
    const confirmed = await json(goodFinalize)
    expect(confirmed.suggestion.status).toBe('contender')
    expect(confirmed.suggestion.submitterAuthUid).toBe('firebase-user-1')

    const events = await repository.listModerationEvents(submitPayload.suggestion.id)
    expect(events).toHaveLength(1)
    expect(events[0]?.reason).toBe('submitter-confirmed-email-link')
  })

  it('rejects mismatched Firebase-authenticated email addresses during email-link finalization', async () => {
    const repository = createMemorySuggestionRepository()
    const app = createTrustedSuggestionApp({
      repository,
      adminSecret: 'test-secret',
      emailMode: 'firebase-auth-email-link',
      emailBlocker: null,
      authService: {
        async upsertEmailLinkUser() {
          return 'firebase-user-1'
        },
        async verifyEmailLinkIdToken() {
          return {
            uid: 'firebase-user-2',
            email: 'other@example.com',
          }
        },
      },
    })

    const submitResponse = await app.handle(
      new Request('http://local.test/api/suggestions/translation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          termSlug: 'Logos',
          proposedTargetLanguage: 'plain-english',
          proposedTranslation: 'Meaningful intelligibility.',
          submitterEmail: 'person@example.com',
          submitterNickname: 'Person',
        }),
      }),
    )
    const submitPayload = await json(submitResponse)

    const finalizeResponse = await app.handle(
      new Request(`http://local.test/api/suggestions/${submitPayload.suggestion.id}/finalize-email-link`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idToken: 'valid-id-token' }),
      }),
    )
    expect(finalizeResponse.status).toBe(403)
  })

  it('rejects illegal server-side transitions even with the local admin secret', async () => {
    const repository = createMemorySuggestionRepository({
      suggestions: [
        {
          id: 'suggestion-1',
          kind: 'new-term',
          termSlug: 'logos',
          sourceLanguage: 'greek',
          proposedSourceTerm: 'Logos',
          normalizedSourceTerm: 'logos',
          proposedTargetLanguage: 'plain-english',
          proposedTranslation: 'Reason and meaningful order.',
          proposedOriginBackground: '',
          proposedVervaekeUsage: '',
          submitterEmailHash: 'hashed',
          captchaScore: 0.5,
          captchaVerified: false,
          status: 'await-review',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          approvalTokenHash: '',
          approvalClickedAt: '',
          lastModerationReason: '',
        },
      ],
    })
    const app = createTrustedSuggestionApp({ repository, adminSecret: 'test-secret' })

    const response = await app.handle(
      new Request('http://local.test/api/suggestions/suggestion-1/transition', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-local-admin-secret': 'test-secret',
        },
        body: JSON.stringify({
          status: 'wait-click',
          reason: 'trying to cheat moderation',
        }),
      }),
    )

    expect(response.status).toBe(400)
    const payload = await json(response)
    expect(payload.message).toContain('Illegal suggestion status transition')

    const stored = await repository.getSuggestion('suggestion-1')
    expect(stored?.status).toBe('await-review')
  })

  it('lists statuses and allowed transitions for local QA', async () => {
    const repository = createMemorySuggestionRepository()
    const app = createTrustedSuggestionApp({ repository, adminSecret: 'test-secret' })

    const response = await app.handle(new Request('http://local.test/api/suggestion-statuses'))
    expect(response.status).toBe(200)

    const payload = await json(response)
    expect(payload.statuses).toHaveLength(suggestionStatuses.length)
    expect(payload.statuses.find((entry: { status: string }) => entry.status === 'wait-click')).toBeTruthy()
    expect(initialStatusForKind('translation-improvement')).toBe('wait-click')
    expect(initialStatusForKind('new-term')).toBe('await-review')
    expect(getAllowedNextStatuses('wait-click')).toContain('contender')
  })

  it('exposes only paginated queue summaries without moderator detail fields', async () => {
    const repository = createMemorySuggestionRepository()
    const app = createTrustedSuggestionApp({ repository, adminSecret: 'test-secret' })

    for (let index = 0; index < 3; index += 1) {
      const response = await app.handle(
        new Request('http://local.test/api/suggestions/translation', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            termSlug: `logos-${index}`,
            proposedTargetLanguage: 'plain-english',
            proposedTranslation: `Meaning ${index}`,
            submitterEmail: `tester${index}@example.com`,
            submitterNickname: `nick-${index}`,
          }),
        }),
      )
      expect(response.status).toBe(201)
    }

    const pageOne = await app.handle(new Request('http://local.test/api/suggestions?page=1&pageSize=2'))
    expect(pageOne.status).toBe(200)
    const payload = await json(pageOne)
    expect(payload.page).toBe(1)
    expect(payload.pageSize).toBe(2)
    expect(payload.total).toBe(3)
    expect(payload.totalPages).toBe(2)
    expect(payload.suggestions).toHaveLength(2)
    expect(payload.suggestions[0]).toMatchObject({
      submitterNickname: 'nick-2',
      status: 'wait-click',
    })
    expect(payload.suggestions[0].proposedTranslation).toBeUndefined()
    expect(payload.suggestions[0].submitterEmailHash).toBeUndefined()
  })

  it('requires the admin secret for moderator unlock and suggestion detail', async () => {
    const repository = createMemorySuggestionRepository()
    const app = createTrustedSuggestionApp({ repository, adminSecret: 'test-secret' })

    const submitResponse = await app.handle(
      new Request('http://local.test/api/suggestions/new-term', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          proposedSourceTerm: 'Dialogos of Care',
          sourceLanguage: 'Greek',
          proposedTargetLanguage: 'plain-english',
          proposedTranslation: 'A caring shared movement of meaning.',
          submitterEmail: 'person@example.com',
          submitterNickname: 'care-bear',
        }),
      }),
    )
    const submitPayload = await json(submitResponse)

    const lockedAuthCheck = await app.handle(new Request('http://local.test/api/moderator-auth-check'))
    expect(lockedAuthCheck.status).toBe(403)

    const unlockedAuthCheck = await app.handle(
      new Request('http://local.test/api/moderator-auth-check', {
        headers: { 'x-local-admin-secret': 'test-secret' },
      }),
    )
    expect(unlockedAuthCheck.status).toBe(200)

    const publicStatus = await app.handle(new Request(`http://local.test/api/suggestions/${submitPayload.suggestion.id}/status`))
    expect(publicStatus.status).toBe(200)
    const publicStatusPayload = await json(publicStatus)
    expect(publicStatusPayload.suggestion.submitterNickname).toBe('care-bear')
    expect(publicStatusPayload.suggestion.proposedTranslation).toBeUndefined()

    const lockedDetail = await app.handle(new Request(`http://local.test/api/suggestions/${submitPayload.suggestion.id}`))
    expect(lockedDetail.status).toBe(403)

    const unlockedDetail = await app.handle(
      new Request(`http://local.test/api/suggestions/${submitPayload.suggestion.id}`, {
        headers: { 'x-local-admin-secret': 'test-secret' },
      }),
    )
    expect(unlockedDetail.status).toBe(200)
    const unlockedDetailPayload = await json(unlockedDetail)
    expect(unlockedDetailPayload.suggestion.proposedTranslation).toBe('A caring shared movement of meaning.')
  })
})

describe('Firestore-backed suggestion repository', () => {
  it('persists and retrieves suggestions via the Firestore seam', async () => {
    const db = createMockFirestore()
    const repository = createFirestoreSuggestionRepository(db)

    const suggestion = {
      id: 'fs-test-1',
      kind: 'new-term',
      termSlug: 'logos',
      sourceLanguage: 'greek',
      proposedSourceTerm: 'Logos',
      normalizedSourceTerm: 'logos',
      proposedTargetLanguage: 'plain-english',
      proposedTranslation: 'Shared intelligible order.',
      proposedOriginBackground: '',
      proposedVervaekeUsage: '',
      submitterEmailHash: 'hashed',
      captchaScore: 0.5,
      captchaVerified: false,
      status: 'await-review',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      approvalTokenHash: '',
      approvalClickedAt: '',
      lastModerationReason: '',
    }

    await repository.createSuggestion(suggestion)
    const fetched = await repository.getSuggestion('fs-test-1')
    expect(fetched?.status).toBe('await-review')
    expect(fetched?.termSlug).toBe('logos')

    const list = await repository.listSuggestions({ kind: 'new-term' })
    expect(list).toHaveLength(1)
    expect(list[0]?.id).toBe('fs-test-1')

    const updated = await repository.updateSuggestion('fs-test-1', (current) => ({
      ...current,
      status: 'current',
      updatedAt: '2026-01-02T00:00:00.000Z',
    }))
    expect(updated?.status).toBe('current')

    const refetched = await repository.getSuggestion('fs-test-1')
    expect(refetched?.status).toBe('current')

    const event = {
      id: 'event-1',
      entityType: 'suggestion',
      entityId: 'fs-test-1',
      fromStatus: 'await-review',
      toStatus: 'current',
      actor: 'local-admin',
      reason: 'approved',
      createdAt: '2026-01-02T00:00:00.000Z',
    }
    await repository.appendModerationEvent(event)
    const events = await repository.listModerationEvents('fs-test-1')
    expect(events).toHaveLength(1)
    expect(events[0]?.toStatus).toBe('current')
  })

  it('enforces server-side status machine when the app is Firestore-backed', async () => {
    const db = createMockFirestore()
    const repository = createFirestoreSuggestionRepository(db)
    const app = createTrustedSuggestionApp({ repository, adminSecret: 'test-secret' })

    const submitResponse = await app.handle(
      new Request('http://local.test/api/suggestions/translation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          termSlug: 'logos',
          proposedTargetLanguage: 'plain-english',
          proposedTranslation: 'Meaningful intelligibility.',
          submitterEmail: 'test@example.com',
          status: 'current',
        }),
      }),
    )

    expect(submitResponse.status).toBe(201)
    const submitPayload = await json(submitResponse)
    expect(submitPayload.suggestion.status).toBe('wait-click')
    expect(submitPayload.ignoredClientFields).toEqual(['status'])

    const stored = await repository.getSuggestion(submitPayload.suggestion.id)
    expect(stored?.status).toBe('wait-click')

    const confirmResponse = await app.handle(
      new Request(`http://local.test/api/suggestions/${submitPayload.suggestion.id}/confirm`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: submitPayload.localEmailStub.approvalToken }),
      }),
    )
    expect(confirmResponse.status).toBe(200)
    const confirmed = await json(confirmResponse)
    expect(confirmed.suggestion.status).toBe('contender')

    const events = await repository.listModerationEvents(submitPayload.suggestion.id)
    expect(events).toHaveLength(1)
    expect(events[0]?.fromStatus).toBe('wait-click')
    expect(events[0]?.toStatus).toBe('contender')
  })

  it('returns null for missing suggestions without throwing', async () => {
    const db = createMockFirestore()
    const repository = createFirestoreSuggestionRepository(db)

    const result = await repository.getSuggestion('nonexistent-id')
    expect(result).toBeNull()

    const updateResult = await repository.updateSuggestion('nonexistent-id', (s) => s)
    expect(updateResult).toBeNull()
  })
})
