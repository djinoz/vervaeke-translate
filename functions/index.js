import { onRequest } from 'firebase-functions/v2/https'

import { createLocalServer, resolveLocalRuntime } from './server.js'

let serverPromise

async function getServer() {
  if (!serverPromise) {
    serverPromise = resolveLocalRuntime().then(({ repository, repositoryKind, firestoreBlocker, emailMode, emailBlocker, authService }) => {
      return createLocalServer({
        repository,
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
}, async (req, res) => {
  const server = await getServer()
  return server.emit('request', req, res)
})
