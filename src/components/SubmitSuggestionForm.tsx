import { useEffect, useRef, useState } from 'react'
import { sourceLanguageOptions } from '../lib/corpus'
import {
  confirmSuggestion,
  finalizeSuggestionEmailLink,
  getBackendInfo,
  getSuggestionStatus,
  submitNewTerm,
  submitTranslationSuggestion,
} from '../lib/submissionsApi'
import type { BackendInfo } from '../lib/submissionsApi'
import {
  completeSuggestionEmailLinkSignIn,
  firebaseConfigured,
  hasPendingEmailLinkInCurrentUrl,
  sendSuggestionEmailLink,
} from '../lib/firebase'
import type { SeedCorpusEntry } from '../types/corpus'

type Mode = 'translation-improvement' | 'new-term'
type ConfirmState = 'idle' | 'confirming' | 'confirmed' | 'error'
type EmailLinkDeliveryState = 'idle' | 'sending' | 'sent' | 'error'
type EmailLinkFinalizeState = 'idle' | 'processing' | 'confirmed' | 'error'

interface StubInfo {
  suggestionId: string
  approvalToken: string
  approvalPath: string
}

interface BackendInfoExtended extends BackendInfo {
  firestoreBlocker?: string | null
}

interface PendingEmailLinkInfo {
  suggestionId: string
  email: string
  nickname: string
}

interface Props {
  selectedEntry: SeedCorpusEntry | null
  selectedTargetLanguage: string
}

export default function SubmitSuggestionForm({ selectedEntry, selectedTargetLanguage }: Props) {
  const [mode, setMode] = useState<Mode>('translation-improvement')
  const [submitting, setSubmitting] = useState(false)
  const [successKind, setSuccessKind] = useState<Mode | null>(null)
  const [error, setError] = useState('')

  const [tiTranslation, setTiTranslation] = useState('')
  const [tiOrigin, setTiOrigin] = useState('')
  const [tiUsage, setTiUsage] = useState('')
  const [tiEmail, setTiEmail] = useState('')
  const [tiNickname, setTiNickname] = useState('')
  const [tiNicknameTouched, setTiNicknameTouched] = useState(false)

  const [ntTerm, setNtTerm] = useState('')
  const [ntLanguage, setNtLanguage] = useState('')
  const [ntTranslation, setNtTranslation] = useState('')
  const [ntOrigin, setNtOrigin] = useState('')
  const [ntUsage, setNtUsage] = useState('')
  const [ntEmail, setNtEmail] = useState('')
  const [ntNickname, setNtNickname] = useState('')
  const [ntNicknameTouched, setNtNicknameTouched] = useState(false)

  const [stubInfo, setStubInfo] = useState<StubInfo | null>(null)
  const [confirmState, setConfirmState] = useState<ConfirmState>('idle')
  const [confirmError, setConfirmError] = useState('')
  const [backendInfo, setBackendInfo] = useState<BackendInfoExtended | null>(null)
  const [backendReachable, setBackendReachable] = useState<boolean | null>(null)
  const [pendingEmailLink, setPendingEmailLink] = useState<PendingEmailLinkInfo | null>(null)
  const [emailLinkDeliveryState, setEmailLinkDeliveryState] = useState<EmailLinkDeliveryState>('idle')
  const [emailLinkFinalizeState, setEmailLinkFinalizeState] = useState<EmailLinkFinalizeState>('idle')
  const [emailLinkFinalizeMessage, setEmailLinkFinalizeMessage] = useState('')

  const unmountedRef = useRef(false)

  const firebaseEmailLinkMode = backendInfo?.emailMode === 'firebase-auth-email-link'

  useEffect(() => {
    getBackendInfo()
      .then((info) => {
        setBackendInfo(info)
        setBackendReachable(info !== null)
      })
      .catch(() => {
        setBackendReachable(false)
      })
  }, [])

  useEffect(() => {
    return () => { unmountedRef.current = true }
  }, [])

  useEffect(() => {
    if (!firebaseEmailLinkMode || !firebaseConfigured || !hasPendingEmailLinkInCurrentUrl()) return
    if (emailLinkFinalizeState === 'processing' || emailLinkFinalizeState === 'confirmed' || emailLinkFinalizeState === 'error') return

    async function finalizeEmailLinkRoundTrip() {
      setEmailLinkFinalizeState('processing')
      setEmailLinkFinalizeMessage('')
      setError('')
      try {
        const signInResult = await completeSuggestionEmailLinkSignIn()
        const finalizeResult = await finalizeSuggestionEmailLink(signInResult.suggestionId, signInResult.idToken)
        if (unmountedRef.current) return
        const confirmedKind: Mode = finalizeResult.suggestion.kind === 'new-term' ? 'new-term' : 'translation-improvement'
        const confirmedMessage = confirmedKind === 'new-term'
          ? "Thanks — your new term has been confirmed by email and is now awaiting moderator review."
          : "Thanks — your translation has been confirmed by email and added to the review queue."
        setPendingEmailLink({
          suggestionId: signInResult.suggestionId,
          email: signInResult.email,
          nickname: signInResult.nickname,
        })
        setSuccessKind(confirmedKind)
        setStubInfo(null)
        setConfirmState('confirmed')
        setConfirmError('')
        setEmailLinkDeliveryState('sent')
        setEmailLinkFinalizeState('confirmed')
        setEmailLinkFinalizeMessage(confirmedMessage)
        const cleanUrl = new URL(window.location.href)
        cleanUrl.search = ''
        cleanUrl.hash = ''
        window.history.replaceState({}, document.title, cleanUrl.toString())
      } catch (err) {
        if (unmountedRef.current) return

        const message = err instanceof Error ? err.message : 'Email-link confirmation failed'

        // Save suggestionId before cleaning the URL
        const pendingSuggestionId = new URL(window.location.href).searchParams.get('suggestionId')

        // Clean URL so a state reset (mode switch, etc.) cannot re-trigger this flow
        const cleanUrl = new URL(window.location.href)
        cleanUrl.search = ''
        cleanUrl.hash = ''
        window.history.replaceState({}, document.title, cleanUrl.toString())

        if (message.includes('Original submitter email is missing from local browser storage')) {
          try {
            if (pendingSuggestionId) {
              const existing = await getSuggestionStatus(pendingSuggestionId)
              if (existing.suggestion.status === 'contender' || existing.suggestion.status === 'await-review') {
                if (unmountedRef.current) return
                setPendingEmailLink(null)
                setSuccessKind('translation-improvement')
                setStubInfo(null)
                setConfirmState('confirmed')
                setConfirmError('')
                setEmailLinkDeliveryState('sent')
                setEmailLinkFinalizeState('confirmed')
                setEmailLinkFinalizeMessage("This email link was already consumed successfully — your suggestion is already in the review queue.")
                return
              }
            }
          } catch {
            // Fall through to the original error message when readback fails.
          }
        }

        if (unmountedRef.current) return
        setEmailLinkFinalizeState('error')
        setEmailLinkFinalizeMessage(message)
      }
    }

    void finalizeEmailLinkRoundTrip()
  }, [emailLinkFinalizeState, firebaseEmailLinkMode])

  function handleTranslationEmailChange(nextEmail: string) {
    setTiEmail(nextEmail)
    if (!tiNicknameTouched || !tiNickname || tiNickname === tiEmail) {
      setTiNickname(nextEmail)
    }
  }

  function handleNewTermEmailChange(nextEmail: string) {
    setNtEmail(nextEmail)
    if (!ntNicknameTouched || !ntNickname || ntNickname === ntEmail) {
      setNtNickname(nextEmail)
    }
  }

  async function deliverFirebaseEmailLink(info: PendingEmailLinkInfo) {
    setEmailLinkDeliveryState('sending')
    await sendSuggestionEmailLink({
      email: info.email,
      suggestionId: info.suggestionId,
      nickname: info.nickname,
    })
    setEmailLinkDeliveryState('sent')
  }

  async function handleTranslationSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!selectedEntry) return
    setSubmitting(true)
    setError('')
    setConfirmError('')
    setEmailLinkFinalizeMessage('')
    try {
      const result = await submitTranslationSuggestion({
        termSlug: selectedEntry.slug,
        proposedTargetLanguage: selectedTargetLanguage,
        proposedTranslation: tiTranslation,
        proposedOriginBackground: tiOrigin,
        proposedVervaekeUsage: tiUsage,
        submitterEmail: tiEmail,
        submitterNickname: tiNickname,
      })

      if (firebaseEmailLinkMode) {
        const emailLinkInfo = {
          suggestionId: result.suggestion.id,
          email: tiEmail,
          nickname: tiNickname,
        }
        setPendingEmailLink(emailLinkInfo)
        setStubInfo(null)
        await deliverFirebaseEmailLink(emailLinkInfo)
      } else if (result.localEmailStub) {
        setStubInfo({
          suggestionId: result.suggestion.id,
          approvalToken: result.localEmailStub.approvalToken,
          approvalPath: result.localEmailStub.approvalPath,
        })
      }

      setSuccessKind('translation-improvement')
      setTiTranslation('')
      setTiOrigin('')
      setTiUsage('')
      setTiEmail('')
      setTiNickname('')
      setTiNicknameTouched(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed')
      setEmailLinkDeliveryState('error')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleNewTermSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    setConfirmError('')
    setEmailLinkFinalizeMessage('')
    try {
      const result = await submitNewTerm({
        proposedSourceTerm: ntTerm,
        sourceLanguage: ntLanguage,
        proposedTranslation: ntTranslation,
        proposedOriginBackground: ntOrigin,
        proposedVervaekeUsage: ntUsage,
        submitterEmail: ntEmail,
        submitterNickname: ntNickname,
      })

      if (firebaseEmailLinkMode) {
        const emailLinkInfo = {
          suggestionId: result.suggestion.id,
          email: ntEmail,
          nickname: ntNickname,
        }
        setPendingEmailLink(emailLinkInfo)
        setStubInfo(null)
        await deliverFirebaseEmailLink(emailLinkInfo)
      } else if (result.localEmailStub) {
        setStubInfo({
          suggestionId: result.suggestion.id,
          approvalToken: result.localEmailStub.approvalToken,
          approvalPath: result.localEmailStub.approvalPath,
        })
      }

      setSuccessKind('new-term')
      setNtTerm('')
      setNtLanguage('')
      setNtTranslation('')
      setNtOrigin('')
      setNtUsage('')
      setNtEmail('')
      setNtNickname('')
      setNtNicknameTouched(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed')
      setEmailLinkDeliveryState('error')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleConfirm() {
    if (!stubInfo) return
    setConfirmState('confirming')
    setConfirmError('')
    try {
      await confirmSuggestion(stubInfo.suggestionId, stubInfo.approvalToken)
      setConfirmState('confirmed')
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : 'Confirmation failed')
      setConfirmState('error')
    }
  }

  async function handleResendEmailLink() {
    if (!pendingEmailLink) return
    setError('')
    try {
      await deliverFirebaseEmailLink(pendingEmailLink)
    } catch (err) {
      setEmailLinkDeliveryState('error')
      setError(err instanceof Error ? err.message : 'Could not resend confirmation email')
    }
  }

  function handleModeChange(next: Mode) {
    setMode(next)
    setSuccessKind(null)
    setError('')
    setStubInfo(null)
    setPendingEmailLink(null)
    setConfirmState('idle')
    setConfirmError('')
    setEmailLinkDeliveryState('idle')
    setEmailLinkFinalizeState('idle')
    setEmailLinkFinalizeMessage('')
  }

  function handleSubmitAnother() {
    setSuccessKind(null)
    setStubInfo(null)
    setPendingEmailLink(null)
    setConfirmState('idle')
    setConfirmError('')
    setError('')
    setEmailLinkDeliveryState('idle')
    setEmailLinkFinalizeState('idle')
    setEmailLinkFinalizeMessage('')
  }

  function handleDismissEmailLinkConfirmation() {
    setSuccessKind(null)
    setPendingEmailLink(null)
    setConfirmState('idle')
    setConfirmError('')
    setError('')
    setEmailLinkDeliveryState('idle')
    setEmailLinkFinalizeState('idle')
    setEmailLinkFinalizeMessage('')
  }

  const backendBadgeKind =
    backendReachable === false
      ? 'offline'
      : backendInfo?.repositoryKind === 'json-file'
        ? 'json-file'
        : backendInfo?.repositoryKind === 'firestore'
          ? 'firestore'
          : ''

  const backendBadgeLabel =
    backendReachable === false
      ? '✕ Backend offline — submissions will not persist'
      : backendInfo?.repositoryKind === 'json-file'
        ? `⚙ Local JSON · ${backendInfo.emailMode === 'firebase-auth-email-link' ? 'Firebase email-link' : 'Email stubbed'}${backendInfo.firestoreBlocker ? ` · No Firestore: ${backendInfo.firestoreBlocker}` : ''}`
        : backendInfo?.repositoryKind === 'firestore'
          ? `✓ Firestore · ${backendInfo.emailMode === 'firebase-auth-email-link' ? 'Firebase email-link' : 'Email stubbed'}`
          : backendInfo
            ? '✓ Backend connected'
            : null

  return (
    <section className="submit-card">
      <div className="submit-card-head">
        <div>
          <h2 className="submit-heading">Contribute a translation</h2>
          <p className="submit-subheading">
            Suggest a clearer translation for an existing term, or propose a new term for the glossary.
          </p>
        </div>
        {(backendBadgeLabel || backendReachable !== null) && (
          <div
            className={`submit-backend-badge ${backendBadgeKind}`}
            title="Backend persistence and email mode for this session"
          >
            {backendBadgeLabel ?? 'Checking backend…'}
          </div>
        )}
      </div>

      {emailLinkFinalizeState === 'processing' && (
        <div className="submit-success-banner">Confirming your secure email link…</div>
      )}
      {emailLinkFinalizeState === 'error' && emailLinkFinalizeMessage && (
        <p className="submit-error">{emailLinkFinalizeMessage}</p>
      )}

      <div className="submit-tabs">
        <button
          type="button"
          className={mode === 'translation-improvement' ? 'submit-tab active' : 'submit-tab'}
          onClick={() => handleModeChange('translation-improvement')}
        >
          Suggest better translation
        </button>
        <button
          type="button"
          className={mode === 'new-term' ? 'submit-tab active' : 'submit-tab'}
          onClick={() => handleModeChange('new-term')}
        >
          Propose new term
        </button>
      </div>

      {successKind ? (
        <div className="submit-success-area">
          {successKind === 'translation-improvement' ? (
            emailLinkFinalizeState === 'confirmed' ? (
              <>
                <div className="submit-success-banner">{emailLinkFinalizeMessage}</div>
                <button
                  type="button"
                  className="submit-secondary-btn"
                  onClick={handleDismissEmailLinkConfirmation}
                >
                  Dismiss
                </button>
              </>
            ) : (
              <>
                <div className="submit-success-banner">
                  {stubInfo
                    ? 'Suggestion received — awaiting email confirmation.'
                    : emailLinkDeliveryState === 'error'
                      ? 'Suggestion received, but the Firebase confirmation email did not send. Retry below.'
                      : "Thanks! Check your email — you'll get a secure sign-in link to activate your suggestion."}
                </div>
                {(pendingEmailLink || stubInfo) && (
                  <div className="submit-dev-stub">
                    <p className="submit-dev-stub-label">
                      {firebaseEmailLinkMode ? 'Firebase Auth email-link confirmation' : 'Dev mode — email stubbed'}
                    </p>
                    <p>
                      {firebaseEmailLinkMode ? (
                        <>
                          The confirmation link is sent to <strong>{pendingEmailLink!.email}</strong>.
                          Opening it in this browser will move the suggestion to <strong>contender</strong> after secure email verification.
                        </>
                      ) : (
                        <>
                          In production a confirmation link would be sent to <strong>{tiEmail}</strong>.
                          Click the button below to simulate that email click, or use the details for manual testing.
                        </>
                      )}
                    </p>
                    {firebaseEmailLinkMode ? (
                      <>
                        <dl className="submit-dev-info">
                          <dt>Suggestion ID</dt>
                          <dd><code>{pendingEmailLink!.suggestionId}</code></dd>
                          <dt>Nickname</dt>
                          <dd><code>{pendingEmailLink!.nickname}</code></dd>
                        </dl>
                        {emailLinkDeliveryState === 'error' && (
                          <button
                            type="button"
                            className="submit-dev-confirm-btn"
                            onClick={handleResendEmailLink}
                            disabled={submitting}
                          >
                            Resend confirmation email
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <dl className="submit-dev-info">
                          <dt>Suggestion ID</dt>
                          <dd><code>{stubInfo?.suggestionId}</code></dd>
                          <dt>Confirm endpoint</dt>
                          <dd><code>POST {stubInfo?.approvalPath}</code></dd>
                          <dt>Token</dt>
                          <dd><code>{stubInfo?.approvalToken}</code></dd>
                        </dl>
                        {confirmState === 'confirmed' ? (
                          <p className="submit-dev-confirmed">
                            Confirmed — suggestion is now <strong>contender</strong> in the moderator queue.
                            Switch to the <strong>Moderator</strong> tab to review it.
                          </p>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="submit-dev-confirm-btn"
                              onClick={handleConfirm}
                              disabled={confirmState === 'confirming'}
                            >
                              {confirmState === 'confirming' ? 'Confirming…' : 'Simulate email confirmation'}
                            </button>
                            {confirmState === 'error' && (
                              <p className="submit-error" style={{ marginTop: '0.5rem' }}>{confirmError}</p>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>
                )}
              </>
            )
          ) : emailLinkFinalizeState === 'confirmed' ? (
            <>
              <div className="submit-success-banner">{emailLinkFinalizeMessage}</div>
              <button
                type="button"
                className="submit-secondary-btn"
                onClick={handleDismissEmailLinkConfirmation}
              >
                Dismiss
              </button>
            </>
          ) : (
            <>
              <div className="submit-success-banner">
                {stubInfo
                  ? 'Term proposal received — awaiting email confirmation.'
                  : emailLinkDeliveryState === 'error'
                    ? 'Term proposal received, but the Firebase confirmation email did not send. Retry below.'
                    : pendingEmailLink
                      ? "Thanks! Check your email — you'll get a secure sign-in link to confirm your term for moderator review."
                      : "Thanks — your term proposal has been received and is now awaiting moderator review."}
              </div>
              {(pendingEmailLink || stubInfo) && (
                <div className="submit-dev-stub">
                  <p className="submit-dev-stub-label">
                    {firebaseEmailLinkMode ? 'Firebase Auth email-link confirmation' : 'Dev mode — email stubbed'}
                  </p>
                  <p>
                    {firebaseEmailLinkMode ? (
                      <>
                        The confirmation link is sent to <strong>{pendingEmailLink!.email}</strong>.
                        Opening it in this browser will move the proposal to <strong>await-review</strong> after secure email verification.
                      </>
                    ) : (
                      <>
                        In production a confirmation link would be sent to <strong>{ntEmail || stubInfo?.approvalPath}</strong>.
                        Click the button below to simulate that email click.
                      </>
                    )}
                  </p>
                  {firebaseEmailLinkMode ? (
                    <>
                      <dl className="submit-dev-info">
                        <dt>Suggestion ID</dt>
                        <dd><code>{pendingEmailLink!.suggestionId}</code></dd>
                        <dt>Nickname</dt>
                        <dd><code>{pendingEmailLink!.nickname}</code></dd>
                      </dl>
                      {emailLinkDeliveryState === 'error' && (
                        <button
                          type="button"
                          className="submit-dev-confirm-btn"
                          onClick={handleResendEmailLink}
                          disabled={submitting}
                        >
                          Resend confirmation email
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <dl className="submit-dev-info">
                        <dt>Suggestion ID</dt>
                        <dd><code>{stubInfo?.suggestionId}</code></dd>
                        <dt>Confirm endpoint</dt>
                        <dd><code>POST {stubInfo?.approvalPath}</code></dd>
                        <dt>Token</dt>
                        <dd><code>{stubInfo?.approvalToken}</code></dd>
                      </dl>
                      {confirmState === 'confirmed' ? (
                        <p className="submit-dev-confirmed">
                          Confirmed — term proposal is now in the <strong>await-review</strong> moderator queue.
                          Switch to the <strong>Moderator</strong> tab to review it.
                        </p>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="submit-dev-confirm-btn"
                            onClick={handleConfirm}
                            disabled={confirmState === 'confirming'}
                          >
                            {confirmState === 'confirming' ? 'Confirming…' : 'Simulate email confirmation'}
                          </button>
                          {confirmState === 'error' && (
                            <p className="submit-error" style={{ marginTop: '0.5rem' }}>{confirmError}</p>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          )}
          {!(emailLinkFinalizeState === 'confirmed') && (
            <button
              type="button"
              className="submit-secondary-btn"
              onClick={handleSubmitAnother}
            >
              Submit another
            </button>
          )}
        </div>
      ) : mode === 'translation-improvement' ? (
        <form className="submit-form" onSubmit={handleTranslationSubmit}>
          {selectedEntry ? (
            <p className="submit-context-label">
              Improving translation of <strong>{selectedEntry.term}</strong>{' '}
              → <em>{selectedTargetLanguage.replace(/-/g, ' ')}</em>
            </p>
          ) : (
            <p className="submit-context-label submit-no-term">Select a term above to suggest an improvement.</p>
          )}

          <label className="submit-field">
            <span>Your improved translation <span className="submit-required">*</span></span>
            <textarea
              value={tiTranslation}
              onChange={(e) => setTiTranslation(e.target.value)}
              required
              rows={3}
              placeholder="A clearer way to put it…"
              disabled={!selectedEntry || submitting}
            />
          </label>

          <div className="submit-optional-grid">
            <label className="submit-field">
              <span>Origin / background <span className="submit-optional">(optional)</span></span>
              <textarea
                value={tiOrigin}
                onChange={(e) => setTiOrigin(e.target.value)}
                rows={2}
                placeholder="Where the term comes from…"
                disabled={!selectedEntry || submitting}
              />
            </label>
            <label className="submit-field">
              <span>Vervaeke usage <span className="submit-optional">(optional)</span></span>
              <textarea
                value={tiUsage}
                onChange={(e) => setTiUsage(e.target.value)}
                rows={2}
                placeholder="How Vervaeke specializes this term…"
                disabled={!selectedEntry || submitting}
              />
            </label>
          </div>

          <div className="submit-optional-grid">
            <label className="submit-field">
              <span>Your email <span className="submit-required">*</span></span>
              <input
                type="email"
                value={tiEmail}
                onChange={(e) => handleTranslationEmailChange(e.target.value)}
                required
                placeholder="you@example.com"
                disabled={submitting}
              />
            </label>
            <label className="submit-field">
              <span>Nickname for the email <span className="submit-required">*</span></span>
              <input
                type="text"
                value={tiNickname}
                onChange={(e) => {
                  setTiNicknameTouched(true)
                  setTiNickname(e.target.value)
                }}
                required
                placeholder="Defaults to your email, but editable"
                disabled={submitting}
              />
            </label>
          </div>

          <div className="submit-bottom-row">
            <button type="submit" className="submit-btn" disabled={!selectedEntry || submitting}>
              {submitting ? 'Submitting…' : 'Submit suggestion'}
            </button>
          </div>

          {error && <p className="submit-error">{error}</p>}
        </form>
      ) : (
        <form className="submit-form" onSubmit={handleNewTermSubmit}>
          <p className="submit-context-label">Propose a Vervaeke term that isn't in the glossary yet.</p>

          <div className="submit-optional-grid">
            <div className="submit-field-grid compact-two-up">
              <label className="submit-field">
                <span>Proposed source term <span className="submit-required">*</span></span>
                <input
                  value={ntTerm}
                  onChange={(e) => setNtTerm(e.target.value)}
                  required
                  placeholder="What is the term?"
                  disabled={submitting}
                />
              </label>

              <label className="submit-field">
                <span>Source language <span className="submit-required">*</span></span>
                <select
                  value={ntLanguage}
                  onChange={(e) => setNtLanguage(e.target.value)}
                  required
                  disabled={submitting}
                >
                  <option value="">Choose source language…</option>
                  {sourceLanguageOptions.map((language) => (
                    <option key={language} value={language}>
                      {language.charAt(0).toUpperCase() + language.slice(1)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <label className="submit-field">
            <span>Plain English translation <span className="submit-required">*</span></span>
            <textarea
              value={ntTranslation}
              onChange={(e) => setNtTranslation(e.target.value)}
              required
              rows={3}
              placeholder="What it means in plain English…"
              disabled={submitting}
            />
          </label>

          <div className="submit-optional-grid">
            <label className="submit-field">
              <span>Origin / background <span className="submit-optional">(optional)</span></span>
              <textarea
                value={ntOrigin}
                onChange={(e) => setNtOrigin(e.target.value)}
                rows={2}
                placeholder="Where the term comes from…"
                disabled={submitting}
              />
            </label>
            <label className="submit-field">
              <span>Vervaeke usage <span className="submit-optional">(optional)</span></span>
              <textarea
                value={ntUsage}
                onChange={(e) => setNtUsage(e.target.value)}
                rows={2}
                placeholder="How Vervaeke specializes this term…"
                disabled={submitting}
              />
            </label>
          </div>

          <div className="submit-optional-grid">
            <label className="submit-field">
              <span>Your email <span className="submit-required">*</span></span>
              <input
                type="email"
                value={ntEmail}
                onChange={(e) => handleNewTermEmailChange(e.target.value)}
                required
                placeholder="you@example.com"
                disabled={submitting}
              />
            </label>
            <label className="submit-field">
              <span>Nickname for the email <span className="submit-required">*</span></span>
              <input
                type="text"
                value={ntNickname}
                onChange={(e) => {
                  setNtNicknameTouched(true)
                  setNtNickname(e.target.value)
                }}
                required
                placeholder="Defaults to your email, but editable"
                disabled={submitting}
              />
            </label>
          </div>

          <div className="submit-bottom-row">
            <button type="submit" className="submit-btn" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Propose term'}
            </button>
          </div>

          {error && <p className="submit-error">{error}</p>}
        </form>
      )}
    </section>
  )
}
