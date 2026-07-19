import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createFirestoreSuggestionRepository, createJsonFileSuggestionRepository } from './repository.js'
import {
  assertTransitionAllowed,
  confirmedStatusForKind,
  getAllowedNextStatuses,
  initialStatusForKind,
  isSuggestionStatus,
  suggestionStatuses,
} from './statusMachine.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const __repoRoot = path.resolve(__dirname, '..')

function stripOptionalQuotes(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1)
  }
  return value
}

function loadBackendEnvFile() {
  const configuredPath = (process.env.ENV_BACKEND_FILE || '').trim()
  const envPath = configuredPath
    ? path.resolve(__repoRoot, configuredPath)
    : path.join(__repoRoot, '.env.backend.local')

  if (!existsSync(envPath)) return

  const content = readFileSync(envPath, 'utf8')
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const eq = line.indexOf('=')
    if (eq <= 0) continue

    const key = line.slice(0, eq).trim()
    if (!key || process.env[key] !== undefined) continue

    const value = stripOptionalQuotes(line.slice(eq + 1).trim())
    process.env[key] = value
  }
}

loadBackendEnvFile()

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function createJsonResponse(status, payload) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  })
}

function badRequest(message, details) {
  return createJsonResponse(400, {
    error: 'bad-request',
    message,
    details,
  })
}

function notFound(message = 'Suggestion not found') {
  return createJsonResponse(404, {
    error: 'not-found',
    message,
  })
}

function forbidden(message = 'Forbidden') {
  return createJsonResponse(403, {
    error: 'forbidden',
    message,
  })
}

function serverError(error) {
  return createJsonResponse(500, {
    error: 'internal-error',
    message: error instanceof Error ? error.message : 'Unknown server error',
  })
}

async function parseJson(request) {
  if (request.method === 'GET' || request.method === 'HEAD') {
    return {}
  }

  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    return {}
  }

  try {
    return await request.json()
  } catch {
    throw new Error('Invalid JSON body')
  }
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function validateEmail(value) {
  const email = normalizeText(value).toLowerCase()
  if (!email.includes('@') || email.startsWith('@') || email.endsWith('@')) {
    throw new Error('submitterEmail must be a plausible email address')
  }

  return email
}

function validateNickname(value, fallbackEmail = '') {
  const nickname = normalizeText(value || fallbackEmail)
  if (!nickname) {
    throw new Error('submitterNickname is required')
  }

  if (nickname.length > 80) {
    throw new Error('submitterNickname must be 80 characters or fewer')
  }

  return nickname
}

function validateTranslationSubmission(payload) {
  const termSlug = slugify(normalizeText(payload.termSlug))
  const proposedTargetLanguage = slugify(normalizeText(payload.proposedTargetLanguage || payload.targetLanguage))
  const proposedTranslation = normalizeText(payload.proposedTranslation || payload.translation)
  const submitterEmail = validateEmail(payload.submitterEmail)
  const submitterNickname = validateNickname(payload.submitterNickname, submitterEmail)

  if (!termSlug) {
    throw new Error('termSlug is required')
  }

  if (!proposedTargetLanguage) {
    throw new Error('proposedTargetLanguage is required')
  }

  if (!proposedTranslation) {
    throw new Error('proposedTranslation is required')
  }

  return {
    kind: 'translation-improvement',
    termSlug,
    sourceLanguage: '',
    proposedSourceTerm: '',
    normalizedSourceTerm: '',
    proposedTargetLanguage,
    proposedTranslation,
    proposedOriginBackground: normalizeText(payload.proposedOriginBackground),
    proposedVervaekeUsage: normalizeText(payload.proposedVervaekeUsage),
    submitterEmail,
    submitterNickname,
    captchaToken: normalizeText(payload.captchaToken),
  }
}

function validateNewTermSubmission(payload) {
  const proposedSourceTerm = normalizeText(payload.proposedSourceTerm || payload.term)
  const sourceLanguage = slugify(normalizeText(payload.sourceLanguage))
  const normalizedSourceTerm = slugify(proposedSourceTerm)
  const proposedTranslation = normalizeText(payload.proposedTranslation || payload.translation)
  const submitterEmail = validateEmail(payload.submitterEmail)
  const submitterNickname = validateNickname(payload.submitterNickname, submitterEmail)

  if (!proposedSourceTerm) {
    throw new Error('proposedSourceTerm is required')
  }

  if (!normalizedSourceTerm) {
    throw new Error('proposedSourceTerm must contain letters or numbers')
  }

  if (!sourceLanguage) {
    throw new Error('sourceLanguage is required')
  }

  if (!proposedTranslation) {
    throw new Error('proposedTranslation is required')
  }

  return {
    kind: 'new-term',
    termSlug: normalizedSourceTerm,
    sourceLanguage,
    proposedSourceTerm,
    normalizedSourceTerm,
    proposedTargetLanguage: slugify(normalizeText(payload.proposedTargetLanguage || payload.targetLanguage || 'plain-english')),
    proposedTranslation,
    proposedOriginBackground: normalizeText(payload.proposedOriginBackground),
    proposedVervaekeUsage: normalizeText(payload.proposedVervaekeUsage),
    submitterEmail,
    submitterNickname,
    captchaToken: normalizeText(payload.captchaToken),
  }
}

function makeCaptchaAssessment(captchaToken) {
  return {
    provider: 'local-mock',
    verified: captchaToken.length > 0,
    score: captchaToken.length > 0 ? 0.99 : 0.5,
  }
}

function redactSuggestion(suggestion) {
  const {
    approvalTokenHash: _approvalTokenHash,
    submitterEmailHash,
    ...publicFields
  } = suggestion

  return {
    ...publicFields,
    submitterEmailHash,
  }
}

function summarizeSuggestionForQueue(suggestion) {
  return {
    id: suggestion.id,
    kind: suggestion.kind,
    termSlug: suggestion.termSlug,
    proposedSourceTerm: suggestion.proposedSourceTerm,
    proposedTargetLanguage: suggestion.proposedTargetLanguage || '',
    previewSnippet: (suggestion.proposedTranslation || '').slice(0, 120),
    submitterNickname: suggestion.submitterNickname,
    status: suggestion.status,
    createdAt: suggestion.createdAt,
  }
}

function parsePositiveInt(rawValue, fallback, { min = 1, max = 100 } = {}) {
  const parsed = Number.parseInt(String(rawValue || ''), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

function isValidAdminSecret(request, adminSecret) {
  const headerSecret = request.headers.get('x-local-admin-secret') || ''
  return Boolean(headerSecret) && headerSecret === adminSecret
}

function constantTimeTokenMatch(expectedHash, token) {
  const candidateHash = sha256(token)
  const left = Buffer.from(expectedHash)
  const right = Buffer.from(candidateHash)

  if (left.length !== right.length) {
    return false
  }

  return timingSafeEqual(left, right)
}

function shouldHideSuggestionFromPublic(status) {
  return status === 'hidden-inappropriate' || status === 'hidden-owner-deleted'
}

function buildLocalSuggestion(submission, initialStatus, nowIso, approvalToken) {
  const suggestion = {
    id: randomUUID(),
    kind: submission.kind,
    termSlug: submission.termSlug,
    sourceLanguage: submission.sourceLanguage,
    proposedSourceTerm: submission.proposedSourceTerm,
    normalizedSourceTerm: submission.normalizedSourceTerm,
    proposedTargetLanguage: submission.proposedTargetLanguage,
    proposedTranslation: submission.proposedTranslation,
    proposedOriginBackground: submission.proposedOriginBackground,
    proposedVervaekeUsage: submission.proposedVervaekeUsage,
    submitterNickname: submission.submitterNickname,
    submitterEmailHash: sha256(submission.submitterEmail),
    submitterAuthUid: '',
    captchaScore: makeCaptchaAssessment(submission.captchaToken).score,
    captchaVerified: makeCaptchaAssessment(submission.captchaToken).verified,
    status: initialStatus,
    createdAt: nowIso,
    updatedAt: nowIso,
    approvalTokenHash: approvalToken ? sha256(approvalToken) : '',
    approvalClickedAt: '',
    lastModerationReason: '',
  }

  return suggestion
}

async function resolveFirebaseAdminApp(projectId) {
  const { initializeApp, getApps } = await import('firebase-admin/app')
  const apps = getApps()
  return apps.length ? apps[0] : initializeApp({ projectId })
}

async function resolveAuthRuntime(projectId) {
  const requestedEmailMode = normalizeText(process.env.LOCAL_SUBMISSIONS_EMAIL_MODE || 'stubbed') || 'stubbed'
  if (requestedEmailMode !== 'firebase-auth-email-link') {
    return {
      emailMode: 'stubbed',
      emailBlocker: 'Firebase Auth email-link mode is disabled (set LOCAL_SUBMISSIONS_EMAIL_MODE=firebase-auth-email-link to enable it)',
      authService: null,
    }
  }

  if (!projectId) {
    return {
      emailMode: 'stubbed',
      emailBlocker: 'LOCAL_SUBMISSIONS_EMAIL_MODE requested Firebase email-link mode, but FIRESTORE_PROJECT_ID is not set for the server runtime',
      authService: null,
    }
  }

  try {
    const app = await resolveFirebaseAdminApp(projectId)
    const { getAuth } = await import('firebase-admin/auth')
    const adminAuth = getAuth(app)

    return {
      emailMode: 'firebase-auth-email-link',
      emailBlocker: null,
      authService: {
        async verifyEmailLinkIdToken(idToken) {
          const decoded = await adminAuth.verifyIdToken(idToken, true)
          if (!decoded.email) {
            throw new Error('Firebase ID token did not contain an email address')
          }
          if (!decoded.email_verified) {
            throw new Error('Firebase email-link sign-in did not produce a verified email')
          }
          return {
            uid: decoded.uid,
            email: decoded.email,
          }
        },
      },
    }
  } catch (error) {
    return {
      emailMode: 'stubbed',
      emailBlocker: error instanceof Error ? `Firebase Auth init failed: ${error.message}` : `Firebase Auth init failed: ${String(error)}`,
      authService: null,
    }
  }
}

export function createTrustedSuggestionApp({
  repository,
  adminSecret = process.env.LOCAL_SUBMISSIONS_ADMIN_SECRET || 'local-dev-secret',
  repositoryKind = 'unknown',
  emailMode = 'stubbed',
  firestoreBlocker = null,
  emailBlocker = null,
  authService = null,
} = {}) {
  if (!repository) {
    throw new Error('repository is required')
  }

  const resolvedEmailBlocker =
    emailBlocker !== null
      ? emailBlocker
      : emailMode === 'firebase-auth-email-link'
        ? null
        : 'Firebase Auth email-link confirmation is not active for this local backend yet'

  return {
    async handle(request) {
      try {
        const url = new URL(request.url)
        const pathname = url.pathname.replace(/\/$/, '') || '/'

        if (request.method === 'GET' && pathname === '/api/health') {
          return createJsonResponse(200, {
            ok: true,
            mode: 'local-submissions-backend',
            repositoryKind,
            emailMode,
            confirmationMode: emailMode === 'firebase-auth-email-link' ? 'firebase-auth-email-link' : 'local-email-stub',
            firestoreAvailable: repositoryKind === 'firestore',
            firestoreBlocker: repositoryKind !== 'firestore' ? firestoreBlocker : null,
            emailLive: emailMode === 'firebase-auth-email-link',
            emailBlocker: resolvedEmailBlocker,
            suggestionStatuses,
          })
        }

        if (request.method === 'GET' && pathname === '/api/suggestion-statuses') {
          return createJsonResponse(200, {
            statuses: suggestionStatuses.map((status) => ({
              status,
              allowedNextStatuses: getAllowedNextStatuses(status),
            })),
          })
        }

        if (request.method === 'GET' && pathname === '/api/suggestions') {
          const includeHidden = url.searchParams.get('includeHidden') === '1'
          const suggestions = (await repository.listSuggestions({
            kind: url.searchParams.get('kind') || '',
            status: url.searchParams.get('status') || '',
            termSlug: slugify(url.searchParams.get('termSlug') || ''),
          })).filter((suggestion) => includeHidden || !shouldHideSuggestionFromPublic(suggestion.status))
          const pageSize = parsePositiveInt(url.searchParams.get('pageSize'), 12, { min: 1, max: 100 })
          const page = parsePositiveInt(url.searchParams.get('page'), 1, { min: 1, max: 10000 })
          const total = suggestions.length
          const totalPages = Math.max(1, Math.ceil(total / pageSize))
          const normalizedPage = Math.min(page, totalPages)
          const start = (normalizedPage - 1) * pageSize
          const paged = suggestions.slice(start, start + pageSize)

          return createJsonResponse(200, {
            suggestions: paged.map(summarizeSuggestionForQueue),
            page: normalizedPage,
            pageSize,
            total,
            totalPages,
          })
        }

        if (request.method === 'GET' && pathname === '/api/moderator-auth-check') {
          if (!isValidAdminSecret(request, adminSecret)) {
            return forbidden('Valid x-local-admin-secret header required to unlock moderator detail view')
          }

          return createJsonResponse(200, { ok: true })
        }

        if (request.method === 'POST' && pathname === '/api/suggestions/translation') {
          let payload
          try {
            payload = await parseJson(request)
          } catch (error) {
            return badRequest(error instanceof Error ? error.message : 'Invalid JSON body')
          }

          let submission
          try {
            submission = validateTranslationSubmission(payload)
          } catch (error) {
            return badRequest(error instanceof Error ? error.message : 'Invalid translation submission')
          }

          const nowIso = new Date().toISOString()
          const approvalToken = randomUUID()
          const suggestion = buildLocalSuggestion(
            submission,
            initialStatusForKind('translation-improvement'),
            nowIso,
            approvalToken,
          )

          await repository.createSuggestion(suggestion)

          return createJsonResponse(201, {
            suggestion: redactSuggestion(suggestion),
            localEmailStub: emailMode === 'firebase-auth-email-link'
              ? null
              : {
                  delivery: 'stubbed',
                  approvalToken,
                  approvalPath: `/api/suggestions/${suggestion.id}/confirm`,
                },
            ignoredClientFields: payload.status ? ['status'] : [],
          })
        }

        if (request.method === 'POST' && pathname === '/api/suggestions/new-term') {
          let payload
          try {
            payload = await parseJson(request)
          } catch (error) {
            return badRequest(error instanceof Error ? error.message : 'Invalid JSON body')
          }

          let submission
          try {
            submission = validateNewTermSubmission(payload)
          } catch (error) {
            return badRequest(error instanceof Error ? error.message : 'Invalid new-term submission')
          }

          const nowIso = new Date().toISOString()
          const approvalToken = randomUUID()
          const suggestion = buildLocalSuggestion(submission, initialStatusForKind('new-term'), nowIso, approvalToken)
          await repository.createSuggestion(suggestion)

          return createJsonResponse(201, {
            suggestion: redactSuggestion(suggestion),
            localEmailStub: emailMode === 'firebase-auth-email-link'
              ? null
              : {
                  delivery: 'stubbed',
                  approvalToken,
                  approvalPath: `/api/suggestions/${suggestion.id}/confirm`,
                },
            ignoredClientFields: payload.status ? ['status'] : [],
          })
        }

        const finalizeEmailLinkMatch = pathname.match(/^\/api\/suggestions\/([^/]+)\/finalize-email-link$/)
        if (request.method === 'POST' && finalizeEmailLinkMatch) {
          if (emailMode !== 'firebase-auth-email-link') {
            return badRequest('Firebase Auth email-link confirmation is not active on this backend')
          }

          if (!authService?.verifyEmailLinkIdToken) {
            return serverError(new Error('Firebase Auth email-link mode is enabled but authService.verifyEmailLinkIdToken is missing'))
          }

          const suggestionId = finalizeEmailLinkMatch[1]
          const suggestion = await repository.getSuggestion(suggestionId)
          if (!suggestion) {
            return notFound()
          }

          let payload
          try {
            payload = await parseJson(request)
          } catch (error) {
            return badRequest(error instanceof Error ? error.message : 'Invalid JSON body')
          }

          const idToken = normalizeText(payload.idToken)
          if (!idToken) {
            return badRequest('idToken is required')
          }

          let verified
          try {
            verified = await authService.verifyEmailLinkIdToken(idToken)
          } catch (error) {
            return forbidden(error instanceof Error ? error.message : 'Invalid Firebase ID token')
          }

          const verifiedEmail = validateEmail(verified.email || '')
          if (sha256(verifiedEmail) !== suggestion.submitterEmailHash) {
            return forbidden('Authenticated email does not match the original submitter email')
          }

          const finalizeTargetStatus = confirmedStatusForKind(suggestion.kind)
          try {
            assertTransitionAllowed(suggestion.status, finalizeTargetStatus)
          } catch (error) {
            return badRequest(error instanceof Error ? error.message : 'Illegal transition')
          }

          const nowIso = new Date().toISOString()
          const updated = await repository.updateSuggestion(suggestionId, (current) => ({
            ...current,
            status: finalizeTargetStatus,
            submitterAuthUid: verified.uid || current.submitterAuthUid || '',
            approvalClickedAt: nowIso,
            updatedAt: nowIso,
            lastModerationReason: 'submitter-confirmed-email-link',
          }))

          await repository.appendModerationEvent({
            id: randomUUID(),
            entityType: 'suggestion',
            entityId: suggestionId,
            fromStatus: suggestion.status,
            toStatus: finalizeTargetStatus,
            actor: 'submitter-email-link',
            reason: 'submitter-confirmed-email-link',
            createdAt: nowIso,
          })

          return createJsonResponse(200, {
            suggestion: redactSuggestion(updated),
          })
        }

        const confirmMatch = pathname.match(/^\/api\/suggestions\/([^/]+)\/confirm$/)
        if (request.method === 'POST' && confirmMatch) {
          const suggestionId = confirmMatch[1]
          const suggestion = await repository.getSuggestion(suggestionId)
          if (!suggestion) {
            return notFound()
          }

          let payload
          try {
            payload = await parseJson(request)
          } catch (error) {
            return badRequest(error instanceof Error ? error.message : 'Invalid JSON body')
          }

          const token = normalizeText(payload.token)
          if (!token) {
            return badRequest('token is required')
          }

          if (!suggestion.approvalTokenHash || !constantTimeTokenMatch(suggestion.approvalTokenHash, token)) {
            return forbidden('Invalid approval token')
          }

          const confirmTargetStatus = confirmedStatusForKind(suggestion.kind)
          try {
            assertTransitionAllowed(suggestion.status, confirmTargetStatus)
          } catch (error) {
            return badRequest(error instanceof Error ? error.message : 'Illegal transition')
          }

          const nowIso = new Date().toISOString()
          const updated = await repository.updateSuggestion(suggestionId, (current) => ({
            ...current,
            status: confirmTargetStatus,
            approvalClickedAt: nowIso,
            updatedAt: nowIso,
            lastModerationReason: 'submitter-confirmed-email',
          }))

          await repository.appendModerationEvent({
            id: randomUUID(),
            entityType: 'suggestion',
            entityId: suggestionId,
            fromStatus: suggestion.status,
            toStatus: confirmTargetStatus,
            actor: 'submitter-email-link',
            reason: 'submitter-confirmed-email',
            createdAt: nowIso,
          })

          return createJsonResponse(200, {
            suggestion: redactSuggestion(updated),
          })
        }

        const publicStatusMatch = pathname.match(/^\/api\/suggestions\/([^/]+)\/status$/)
        if (request.method === 'GET' && publicStatusMatch) {
          const suggestion = await repository.getSuggestion(publicStatusMatch[1])
          if (!suggestion) {
            return notFound()
          }

          return createJsonResponse(200, {
            suggestion: summarizeSuggestionForQueue(suggestion),
          })
        }

        const detailMatch = pathname.match(/^\/api\/suggestions\/([^/]+)$/)
        if (request.method === 'GET' && detailMatch) {
          if (!isValidAdminSecret(request, adminSecret)) {
            return forbidden('Valid x-local-admin-secret header required for suggestion detail endpoint')
          }

          const suggestion = await repository.getSuggestion(detailMatch[1])
          if (!suggestion) {
            return notFound()
          }

          const events = await repository.listModerationEvents(suggestion.id)
          return createJsonResponse(200, {
            suggestion: redactSuggestion(suggestion),
            moderationEvents: events,
          })
        }

        const deleteMatch = pathname.match(/^\/api\/suggestions\/([^/]+)$/)
        if (request.method === 'DELETE' && deleteMatch) {
          if (!isValidAdminSecret(request, adminSecret)) {
            return forbidden('Valid x-local-admin-secret header required for delete endpoint')
          }

          let deletePayload
          try {
            deletePayload = await parseJson(request)
          } catch (error) {
            return badRequest(error instanceof Error ? error.message : 'Invalid JSON body')
          }

          const deleteScope = normalizeText(deletePayload.scope)
          const deleteReason = normalizeText(deletePayload.reason)
          if (deleteScope !== 'test-data-cleanup') {
            return badRequest('scope must be "test-data-cleanup"')
          }
          if (!deleteReason) {
            return badRequest('reason is required')
          }

          const suggestionId = deleteMatch[1]
          const suggestion = await repository.getSuggestion(suggestionId)
          if (!suggestion) {
            return notFound()
          }

          const nowIso = new Date().toISOString()
          await repository.appendDeletionAudit({
            id: randomUUID(),
            action: 'hard-delete-submission',
            entityType: 'suggestion',
            entityId: suggestionId,
            actor: 'local-admin',
            reason: deleteReason,
            scope: 'test-data-cleanup',
            deletedAt: nowIso,
            kind: suggestion.kind,
            termSlug: suggestion.termSlug ?? null,
            status: suggestion.status,
            submitterEmailHash: suggestion.submitterEmailHash ?? null,
            createdAt: suggestion.createdAt,
          })

          await repository.deleteSuggestion(suggestionId)

          return createJsonResponse(200, { ok: true, deleted: suggestionId, scope: 'test-data-cleanup' })
        }

        const transitionMatch = pathname.match(/^\/api\/suggestions\/([^/]+)\/transition$/)
        if (request.method === 'POST' && transitionMatch) {
          if (!isValidAdminSecret(request, adminSecret)) {
            return forbidden('Valid x-local-admin-secret header required for transition endpoint')
          }

          const suggestionId = transitionMatch[1]
          const suggestion = await repository.getSuggestion(suggestionId)
          if (!suggestion) {
            return notFound()
          }

          let payload
          try {
            payload = await parseJson(request)
          } catch (error) {
            return badRequest(error instanceof Error ? error.message : 'Invalid JSON body')
          }

          const nextStatus = normalizeText(payload.status)
          const reason = normalizeText(payload.reason)
          if (!isSuggestionStatus(nextStatus)) {
            return badRequest('status must be a known suggestion status', {
              allowedStatuses: suggestionStatuses,
            })
          }

          try {
            assertTransitionAllowed(suggestion.status, nextStatus)
          } catch (error) {
            return badRequest(error instanceof Error ? error.message : 'Illegal transition', {
              fromStatus: suggestion.status,
              allowedNextStatuses: getAllowedNextStatuses(suggestion.status),
            })
          }

          const nowIso = new Date().toISOString()
          const updated = await repository.updateSuggestion(suggestionId, (current) => ({
            ...current,
            status: nextStatus,
            updatedAt: nowIso,
            lastModerationReason: reason,
          }))

          await repository.appendModerationEvent({
            id: randomUUID(),
            entityType: 'suggestion',
            entityId: suggestionId,
            fromStatus: suggestion.status,
            toStatus: nextStatus,
            actor: 'local-admin',
            reason,
            createdAt: nowIso,
          })

          return createJsonResponse(200, {
            suggestion: redactSuggestion(updated),
          })
        }

        return notFound('Route not found')
      } catch (error) {
        return serverError(error)
      }
    },
  }
}

export async function resolveRepository(options = {}) {
  if (options.repository) return { repository: options.repository, kind: options.repositoryKind || 'unknown', firestoreBlocker: null }

  const projectId = process.env.FIRESTORE_PROJECT_ID || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT
  if (projectId) {
    try {
      const app = await resolveFirebaseAdminApp(projectId)
      const { getFirestore } = await import('firebase-admin/firestore')
      const db = getFirestore(app)
      console.log(`Using Firestore repository (project: ${projectId})`)
      return { repository: createFirestoreSuggestionRepository(db), kind: 'firestore', firestoreBlocker: null }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      console.warn('Firestore init failed, falling back to JSON store:', reason)
      const defaultStorePath = process.env.LOCAL_SUBMISSIONS_STORE_PATH || path.join(__dirname, '.local-data', 'submissions.json')
      console.log(`Using JSON file repository: ${defaultStorePath}`)
      return {
        repository: createJsonFileSuggestionRepository(defaultStorePath),
        kind: 'json-file',
        firestoreBlocker: `init failed: ${reason}`,
      }
    }
  }

  const defaultStorePath = process.env.LOCAL_SUBMISSIONS_STORE_PATH || path.join(__dirname, '.local-data', 'submissions.json')
  console.log(`Using JSON file repository: ${defaultStorePath}`)
  console.log('Firestore not configured: set FIRESTORE_PROJECT_ID + server-side ADC credentials to enable')
  return {
    repository: createJsonFileSuggestionRepository(defaultStorePath),
    kind: 'json-file',
    firestoreBlocker: 'FIRESTORE_PROJECT_ID not set (server env only — VITE_FIREBASE_* are browser-only)',
  }
}

export async function resolveLocalRuntime(options = {}) {
  const { repository, kind, firestoreBlocker } = await resolveRepository(options)
  const projectId = process.env.FIRESTORE_PROJECT_ID || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT
  const authRuntime = await resolveAuthRuntime(projectId)

  return {
    repository,
    repositoryKind: kind,
    firestoreBlocker,
    emailMode: authRuntime.emailMode,
    emailBlocker: authRuntime.emailBlocker,
    authService: authRuntime.authService,
  }
}

export function createLocalServer(options = {}) {
  const defaultStorePath = process.env.LOCAL_SUBMISSIONS_STORE_PATH || path.join(__dirname, '.local-data', 'submissions.json')
  const repository = options.repository || createJsonFileSuggestionRepository(defaultStorePath)
  const repositoryKind = options.repositoryKind || (options.repository ? 'unknown' : 'json-file')
  const firestoreBlocker = options.firestoreBlocker ?? null
  const app = createTrustedSuggestionApp({ ...options, repository, repositoryKind, firestoreBlocker })

  const server = createServer(async (req, res) => {
    const origin = `http://${req.headers.host || '127.0.0.1'}`
    const body = req.method === 'GET' || req.method === 'HEAD'
      ? undefined
      : (Object.prototype.hasOwnProperty.call(req, 'rawBody') && req.rawBody
          ? req.rawBody
          : req)
    const request = new Request(new URL(req.url || '/', origin), {
      method: req.method,
      headers: req.headers,
      body,
      duplex: body === req ? 'half' : undefined,
    })

    const response = await app.handle(request)
    res.statusCode = response.status
    response.headers.forEach((value, key) => {
      res.setHeader(key, value)
    })

    const buffer = Buffer.from(await response.arrayBuffer())
    res.end(buffer)
  })

  return { server, app, repository, storePath: defaultStorePath }
}

if (process.argv[1] === __filename) {
  const port = Number(process.env.LOCAL_SUBMISSIONS_PORT || 8787)
  resolveLocalRuntime().then(({ repository, repositoryKind, firestoreBlocker, emailMode, emailBlocker, authService }) => {
    const { server } = createLocalServer({
      repository,
      repositoryKind,
      firestoreBlocker,
      emailMode,
      emailBlocker,
      authService,
    })
    server.listen(port, '0.0.0.0', () => {
      console.log(`Local submissions backend listening on http://0.0.0.0:${port}`)
      console.log(`Repository: ${repositoryKind} | Email: ${emailMode} | Admin header: x-local-admin-secret`)
      if (firestoreBlocker) {
        console.log(`Firestore not active: ${firestoreBlocker}`)
        console.log('To enable: set FIRESTORE_PROJECT_ID=vervaeke-translate and configure server-side ADC')
      }
      if (emailBlocker) {
        console.log(`Email-link mode not active: ${emailBlocker}`)
      }
    })
  })
}
