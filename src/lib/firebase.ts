import { initializeApp } from 'firebase/app'
import {
  getAuth,
  isSignInWithEmailLink,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signOut,
  updateProfile,
  type ActionCodeSettings,
} from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const LOCAL_STORAGE_EMAIL_KEY = 'vervaeke-translate.email-link.email'
const LOCAL_STORAGE_NICKNAME_KEY = 'vervaeke-translate.email-link.nickname'

export const firebaseConfigured = Object.values(firebaseConfig).every((value) => typeof value === 'string' && value.trim().length > 0)

export const firebaseApp = firebaseConfigured ? initializeApp(firebaseConfig) : null
export const db = firebaseApp ? getFirestore(firebaseApp) : null
export const auth = firebaseApp ? getAuth(firebaseApp) : null

function requireAuth() {
  if (!auth) {
    throw new Error('Firebase Auth is not configured in this browser build')
  }
  return auth
}

function buildActionCodeSettings(suggestionId: string): ActionCodeSettings {
  const url = new URL(window.location.href)
  url.searchParams.set('suggestionId', suggestionId)
  url.searchParams.set('emailLink', '1')

  return {
    url: url.toString(),
    handleCodeInApp: true,
  }
}

function readSuggestionIdFromLink(urlString: string): string {
  const url = new URL(urlString)
  const direct = url.searchParams.get('suggestionId')
  if (direct) return direct

  const continueUrl = url.searchParams.get('continueUrl')
  if (continueUrl) {
    const nested = new URL(continueUrl)
    const nestedSuggestionId = nested.searchParams.get('suggestionId')
    if (nestedSuggestionId) return nestedSuggestionId
  }

  throw new Error('Suggestion ID missing from email link')
}

export async function sendSuggestionEmailLink(options: {
  email: string
  suggestionId: string
  nickname: string
}): Promise<void> {
  const resolvedAuth = requireAuth()
  const email = options.email.trim()
  const nickname = options.nickname.trim()

  localStorage.setItem(LOCAL_STORAGE_EMAIL_KEY, email)
  localStorage.setItem(LOCAL_STORAGE_NICKNAME_KEY, nickname)

  await sendSignInLinkToEmail(resolvedAuth, email, buildActionCodeSettings(options.suggestionId))
}

export function hasPendingEmailLinkInCurrentUrl(): boolean {
  if (typeof window === 'undefined' || !auth) return false
  return isSignInWithEmailLink(auth, window.location.href)
}

export async function completeSuggestionEmailLinkSignIn(): Promise<{
  suggestionId: string
  idToken: string
  email: string
  nickname: string
}> {
  const resolvedAuth = requireAuth()

  if (!isSignInWithEmailLink(resolvedAuth, window.location.href)) {
    throw new Error('Current URL is not a Firebase email-link sign-in URL')
  }

  const email = localStorage.getItem(LOCAL_STORAGE_EMAIL_KEY)?.trim()
  if (!email) {
    throw new Error('Original submitter email is missing from local browser storage for this email-link confirmation')
  }

  const nickname = localStorage.getItem(LOCAL_STORAGE_NICKNAME_KEY)?.trim() || email
  const result = await signInWithEmailLink(resolvedAuth, email, window.location.href)

  if (nickname && result.user.displayName !== nickname) {
    await updateProfile(result.user, { displayName: nickname })
  }

  const idToken = await result.user.getIdToken(true)
  const suggestionId = readSuggestionIdFromLink(window.location.href)

  localStorage.removeItem(LOCAL_STORAGE_EMAIL_KEY)
  localStorage.removeItem(LOCAL_STORAGE_NICKNAME_KEY)
  await signOut(resolvedAuth)

  return {
    suggestionId,
    idToken,
    email,
    nickname,
  }
}
