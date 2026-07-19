import type {
  ModerationEvent,
  StatusMeta,
  Suggestion,
  SuggestionKind,
  SuggestionListPage,
  SuggestionStatus,
  SuggestionSummary,
} from '../types/suggestions'

const BASE = import.meta.env.VITE_SUBMISSIONS_API_BASE ?? ''

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init)
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error((body as { message?: string }).message ?? res.statusText)
  }
  return res.json() as Promise<T>
}

export async function listSuggestions(filters: {
  kind?: SuggestionKind | ''
  status?: SuggestionStatus | ''
  termSlug?: string
  page?: number
  pageSize?: number
  includeHidden?: boolean
}): Promise<SuggestionListPage> {
  const params = new URLSearchParams()
  if (filters.kind) params.set('kind', filters.kind)
  if (filters.status) params.set('status', filters.status)
  if (filters.termSlug) params.set('termSlug', filters.termSlug)
  if (filters.page) params.set('page', String(filters.page))
  if (filters.pageSize) params.set('pageSize', String(filters.pageSize))
  if (filters.includeHidden) params.set('includeHidden', '1')
  const qs = params.toString()
  return apiFetch<SuggestionListPage>(`/api/suggestions${qs ? `?${qs}` : ''}`)
}

export async function verifyModeratorSecret(adminSecret: string): Promise<boolean> {
  const data = await apiFetch<{ ok: boolean }>('/api/moderator-auth-check', {
    headers: {
      'x-local-admin-secret': adminSecret,
    },
  })
  return data.ok === true
}

export async function getSuggestionStatus(id: string): Promise<{ suggestion: SuggestionSummary }> {
  return apiFetch(`/api/suggestions/${id}/status`)
}

export async function getSuggestion(id: string, adminSecret: string): Promise<{ suggestion: Suggestion; moderationEvents: ModerationEvent[] }> {
  return apiFetch(`/api/suggestions/${id}`, {
    headers: {
      'x-local-admin-secret': adminSecret,
    },
  })
}

export async function transitionSuggestion(
  id: string,
  status: SuggestionStatus,
  reason: string,
  adminSecret: string,
): Promise<Suggestion> {
  const data = await apiFetch<{ suggestion: Suggestion }>(`/api/suggestions/${id}/transition`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-local-admin-secret': adminSecret,
    },
    body: JSON.stringify({ status, reason }),
  })
  return data.suggestion
}

export async function getStatusMeta(): Promise<StatusMeta[]> {
  const data = await apiFetch<{ statuses: StatusMeta[] }>('/api/suggestion-statuses')
  return data.statuses
}

export async function deleteSuggestion(
  id: string,
  adminSecret: string,
  reason: string,
  scope = 'test-data-cleanup',
): Promise<void> {
  await apiFetch(`/api/suggestions/${id}`, {
    method: 'DELETE',
    headers: {
      'x-local-admin-secret': adminSecret,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ scope, reason }),
  })
}

export async function checkHealth(): Promise<boolean> {
  try {
    const data = await apiFetch<{ ok: boolean }>('/api/health')
    return data.ok === true
  } catch {
    return false
  }
}

export interface BackendInfo {
  ok: boolean
  mode: string
  repositoryKind?: string
  emailMode?: string
  firestoreAvailable?: boolean
  firestoreBlocker?: string | null
  emailLive?: boolean
  emailBlocker?: string | null
  confirmationMode?: string
}

export async function getBackendInfo(): Promise<BackendInfo | null> {
  try {
    return await apiFetch<BackendInfo>('/api/health')
  } catch {
    return null
  }
}

export async function confirmSuggestion(id: string, token: string): Promise<{ suggestion: Suggestion }> {
  return apiFetch(`/api/suggestions/${id}/confirm`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
  })
}

export async function finalizeSuggestionEmailLink(id: string, idToken: string): Promise<{ suggestion: Suggestion }> {
  return apiFetch(`/api/suggestions/${id}/finalize-email-link`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken }),
  })
}

export interface TranslationSuggestionPayload {
  termSlug: string
  proposedTargetLanguage: string
  proposedTranslation: string
  proposedOriginBackground?: string
  proposedVervaekeUsage?: string
  submitterEmail: string
  submitterNickname: string
}

export interface NewTermPayload {
  proposedSourceTerm: string
  sourceLanguage: string
  proposedTranslation: string
  proposedTargetLanguage?: string
  proposedOriginBackground?: string
  proposedVervaekeUsage?: string
  submitterEmail: string
  submitterNickname: string
}

export interface LocalEmailStub {
  delivery: 'stubbed'
  approvalToken: string
  approvalPath: string
}

export async function submitTranslationSuggestion(
  payload: TranslationSuggestionPayload,
): Promise<{ suggestion: Suggestion; localEmailStub: LocalEmailStub | null; ignoredClientFields: string[] }> {
  return apiFetch('/api/suggestions/translation', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function submitNewTerm(
  payload: NewTermPayload,
): Promise<{ suggestion: Suggestion; localEmailStub: LocalEmailStub | null; ignoredClientFields: string[] }> {
  return apiFetch('/api/suggestions/new-term', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
}
