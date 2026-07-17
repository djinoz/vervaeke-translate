import { onRequest } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'

import { createLocalServer, resolveLocalRuntime } from './server.js'

const localSubmissionsAdminSecret = defineSecret('LOCAL_SUBMISSIONS_ADMIN_SECRET')

let serverPromise

async function getServer() {
  if (!serverPromise) {
    serverPromise = resolveLocalRuntime().then(({ repository, repositoryKind, firestoreBlocker, emailMode, emailBlocker, authService }) => {
      const managedAdminSecret = localSubmissionsAdminSecret.value()
      return createLocalServer({
        repository,
        adminSecret: managedAdminSecret || process.env.LOCAL_SUBMISSIONS_ADMIN_SECRET,
        repositoryKind,
        firestoreBlocker,
        emailMode,
        emailBlocker,
        authService,
      }).server
    })
  }

  return serverPromise
}

export const api = onRequest({
  region: 'us-central1',
  cors: true,
  invoker: 'public',
  secrets: [localSubmissionsAdminSecret],
}, async (req, res) => {
  const server = await getServer()
  return server.emit('request', req, res)
})
