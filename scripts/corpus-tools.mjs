import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const projectRoot = process.cwd()
const seedDir = path.join(projectRoot, 'data', 'seed')
const seedJsonPath = path.join(seedDir, 'vervaeke_seed_corpus.json')
const seedCsvPath = path.join(seedDir, 'vervaeke_seed_corpus.csv')
const bundlePath = path.join(seedDir, 'firestore_bundle.json')
const diffPath = path.join(seedDir, 'firestore_diff.json')

function parseArgs(argv) {
  const [command = 'help', ...rest] = argv
  const options = {}

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index]
    if (!token.startsWith('--')) continue

    const [rawKey, rawValue] = token.slice(2).split('=')
    const key = rawKey
    if (rawValue !== undefined) {
      options[key] = rawValue
      continue
    }

    const next = rest[index + 1]
    if (next && !next.startsWith('--')) {
      options[key] = next
      index += 1
    } else {
      options[key] = true
    }
  }

  return { command, options }
}

function slugify(value) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function ensureArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item))
  if (value === undefined || value === null || value === '') return []
  return [String(value)]
}

function normalizeEntry(entry) {
  const term = String(entry.term ?? '').trim()
  if (!term) {
    throw new Error(`entry is missing term: ${JSON.stringify(entry)}`)
  }

  return {
    term,
    slug: String(entry.slug ?? slugify(term)).trim(),
    target_language: String(entry.target_language ?? 'plain-english').trim(),
    translation: String(entry.translation ?? '').trim(),
    origin_background: String(entry.origin_background ?? '').trim(),
    vervaeke_usage: String(entry.vervaeke_usage ?? '').trim(),
    provenance: ensureArray(entry.provenance),
    source_note_title: String(entry.source_note_title ?? '').trim(),
    source_note_id: String(entry.source_note_id ?? '').trim(),
    source_link: String(entry.source_link ?? '').trim(),
    status: String(entry.status ?? 'seed-current').trim(),
    origin_confidence: String(entry.origin_confidence ?? 'blank').trim(),
    notes: String(entry.notes ?? '').trim(),
  }
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function loadSeed(filePath = seedJsonPath) {
  return loadJson(filePath).map(normalizeEntry)
}

function escapeCsv(value) {
  const stringValue = String(value ?? '')
  if (/[",\n\r]/.test(stringValue)) {
    return `"${stringValue.replaceAll('"', '""')}"`
  }
  return stringValue
}

function saveSeed(entries, jsonPath = seedJsonPath, csvPath = seedCsvPath) {
  const sorted = [...entries].sort((left, right) => left.term.localeCompare(right.term))
  fs.writeFileSync(jsonPath, `${JSON.stringify(sorted, null, 2)}\n`)

  const headers = [
    'term',
    'slug',
    'target_language',
    'translation',
    'origin_background',
    'vervaeke_usage',
    'provenance',
    'source_note_title',
    'source_note_id',
    'source_link',
    'status',
    'origin_confidence',
    'notes',
  ]

  const rows = [headers.join(',')]
  for (const entry of sorted) {
    rows.push(
      headers
        .map((header) => {
          const value = header === 'provenance' ? entry.provenance.join(' | ') : entry[header]
          return escapeCsv(value)
        })
        .join(','),
    )
  }

  fs.writeFileSync(csvPath, `${rows.join('\n')}\n`)
}

function sourceIdFromEntry(entry) {
  if (entry.source_note_id) return `source_${entry.source_note_id}`
  if (entry.source_note_title) return `source_${slugify(entry.source_note_title)}`
  return `source_manual_${entry.slug}`
}

function seedStatusToProductStatus(status) {
  if (status === 'seed-candidate') return 'candidate'
  return 'current'
}

function sourceKindFromEntry(entry) {
  const joined = [entry.source_note_title, ...entry.provenance].join(' ').toLowerCase()
  if (joined.includes('joplin')) return 'joplin-note'
  if (joined.includes('transcript')) return 'transcript'
  if (joined.includes('glossary')) return 'human-glossary'
  return 'manual'
}

function buildFirestoreBundle(entries) {
  const terms = {}
  const translations = {}
  const sources = {}

  for (const entry of entries) {
    const sourceId = sourceIdFromEntry(entry)
    const productStatus = seedStatusToProductStatus(entry.status)

    terms[entry.slug] = {
      slug: entry.slug,
      term: entry.term,
      normalizedTerm: slugify(entry.term).replaceAll('-', ' '),
      sourceLanguage: inferSourceLanguage(entry),
      searchTerms: buildSearchTerms(entry),
      public: true,
      seedStatus: productStatus,
      notes: entry.notes,
      primarySourceIds: unique([sourceId]),
      updatedFromSeed: true,
    }

    const translationId = `${entry.slug}__${entry.target_language}__seed`
    translations[translationId] = {
      termSlug: entry.slug,
      targetLanguage: entry.target_language,
      translation: entry.translation,
      originBackground: entry.origin_background,
      vervaekeUsage: entry.vervaeke_usage,
      status: productStatus,
      originConfidence: entry.origin_confidence,
      isPublic: true,
      isSeed: true,
      sortKey: productStatus === 'current' ? 100 : 200,
      sourceIds: unique([sourceId]),
      notes: entry.notes,
    }

    sources[sourceId] = {
      sourceId,
      kind: sourceKindFromEntry(entry),
      title: entry.source_note_title || entry.term,
      externalRef: entry.source_note_id,
      link: entry.source_link,
      public: true,
    }
  }

  return { terms, translations, sources }
}

function inferSourceLanguage(entry) {
  const joined = `${entry.term} ${entry.origin_background}`.toLowerCase()
  if (joined.includes('greek')) return 'greek'
  if (joined.includes('latin')) return 'latin'
  return 'mixed'
}

function buildSearchTerms(entry) {
  return unique(
    [
      entry.term,
      entry.slug.replaceAll('-', ' '),
      ...entry.provenance,
      ...entry.translation.split(/[^A-Za-z0-9]+/),
    ]
      .map((item) => item.toLowerCase().trim())
      .filter((item) => item.length >= 3),
  ).slice(0, 20)
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function computeBundleDiff(localBundle, remoteBundle) {
  const collections = ['terms', 'translations', 'sources']
  const diff = {}

  for (const collection of collections) {
    const local = localBundle[collection] ?? {}
    const remote = remoteBundle[collection] ?? {}
    const localIds = new Set(Object.keys(local))
    const remoteIds = new Set(Object.keys(remote))

    const added = [...localIds].filter((id) => !remoteIds.has(id)).sort()
    const removed = [...remoteIds].filter((id) => !localIds.has(id)).sort()
    const changed = [...localIds]
      .filter((id) => remoteIds.has(id) && JSON.stringify(local[id]) !== JSON.stringify(remote[id]))
      .sort()

    diff[collection] = {
      added,
      removed,
      changed,
      localCount: localIds.size,
      remoteCount: remoteIds.size,
    }
  }

  return diff
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function loadEntriesFromInput(inputPath) {
  const absolute = path.isAbsolute(inputPath) ? inputPath : path.join(projectRoot, inputPath)
  const parsed = loadJson(absolute)
  const asArray = Array.isArray(parsed) ? parsed : [parsed]
  return asArray.map(normalizeEntry)
}

function mergeEntries(currentEntries, incomingEntries) {
  const bySlug = new Map(currentEntries.map((entry) => [entry.slug, entry]))
  for (const incomingEntry of incomingEntries) {
    bySlug.set(incomingEntry.slug, incomingEntry)
  }
  return [...bySlug.values()].sort((left, right) => left.term.localeCompare(right.term))
}

function initializeAdmin() {
  if (getApps().length > 0) return getFirestore()

  const credentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  const serviceAccountPath = path.join(projectRoot, 'firebase-service-account.json')

  if (credentialPath && fs.existsSync(credentialPath)) {
    initializeApp({ credential: applicationDefault() })
    return getFirestore()
  }

  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = loadJson(serviceAccountPath)
    initializeApp({ credential: cert(serviceAccount) })
    return getFirestore()
  }

  throw new Error(
    'Live Firestore sync needs admin credentials. Set GOOGLE_APPLICATION_CREDENTIALS or place firebase-service-account.json in the repo root.',
  )
}

async function fetchLiveBundle() {
  const db = initializeAdmin()
  const collections = ['terms', 'translations', 'sources']
  const bundle = {}

  for (const collection of collections) {
    const snapshot = await db.collection(collection).get()
    bundle[collection] = {}
    snapshot.forEach((document) => {
      bundle[collection][document.id] = document.data()
    })
  }

  return bundle
}

async function pushBundle(localBundle) {
  const db = initializeAdmin()

  for (const [collection, docs] of Object.entries(localBundle)) {
    for (const [documentId, data] of Object.entries(docs)) {
      await db.collection(collection).doc(documentId).set(data, { merge: true })
    }
  }
}

function seedFromLiveBundle(bundle) {
  const terms = bundle.terms ?? {}
  const translations = bundle.translations ?? {}
  const sources = bundle.sources ?? {}

  return Object.values(translations)
    .filter((translation) => translation.isSeed)
    .map((translation) => {
      const term = terms[translation.termSlug] ?? {}
      const sourceId = translation.sourceIds?.[0]
      const source = sourceId ? sources[sourceId] ?? {} : {}
      return normalizeEntry({
        term: term.term ?? translation.termSlug,
        slug: translation.termSlug,
        target_language: translation.targetLanguage,
        translation: translation.translation,
        origin_background: translation.originBackground,
        vervaeke_usage: translation.vervaekeUsage,
        provenance: source.title ? ['firebase-live', source.title] : ['firebase-live'],
        source_note_title: source.title ?? '',
        source_note_id: source.externalRef ?? '',
        source_link: source.link ?? '',
        status: translation.status === 'candidate' ? 'seed-candidate' : 'seed-current',
        origin_confidence: translation.originConfidence ?? 'blank',
        notes: translation.notes ?? term.notes ?? '',
      })
    })
    .sort((left, right) => left.term.localeCompare(right.term))
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2))

  if (command === 'help') {
    console.log([
      'Usage:',
      '  node scripts/corpus-tools.mjs add --input data/seed/additions/file.json',
      '  node scripts/corpus-tools.mjs bundle',
      '  node scripts/corpus-tools.mjs diff-live',
      '  node scripts/corpus-tools.mjs push-live',
      '  node scripts/corpus-tools.mjs pull-live [--output data/seed/live_seed.json]',
    ].join('\n'))
    return
  }

  if (command === 'add') {
    const inputPath = options.input
    if (!inputPath) throw new Error('add requires --input <json-file>')
    const merged = mergeEntries(loadSeed(), loadEntriesFromInput(inputPath))
    saveSeed(merged)
    writeJson(bundlePath, buildFirestoreBundle(merged))
    console.log(`seed updated: ${merged.length} entries`) 
    return
  }

  if (command === 'bundle') {
    const bundle = buildFirestoreBundle(loadSeed())
    writeJson(bundlePath, bundle)
    console.log(`bundle written: ${bundlePath}`)
    return
  }

  if (command === 'diff-live') {
    const localBundle = buildFirestoreBundle(loadSeed())
    const remoteBundle = await fetchLiveBundle()
    const diff = computeBundleDiff(localBundle, remoteBundle)
    writeJson(diffPath, diff)
    console.log(`diff written: ${diffPath}`)
    console.log(JSON.stringify(diff, null, 2))
    return
  }

  if (command === 'push-live') {
    const localBundle = buildFirestoreBundle(loadSeed())
    const remoteBundle = await fetchLiveBundle()
    const diff = computeBundleDiff(localBundle, remoteBundle)
    writeJson(diffPath, diff)
    await pushBundle(localBundle)
    console.log('local seed pushed to Firestore collections terms/translations/sources')
    return
  }

  if (command === 'pull-live') {
    const remoteBundle = await fetchLiveBundle()
    const liveSeed = seedFromLiveBundle(remoteBundle)
    const output = options.output ? path.join(projectRoot, options.output) : path.join(seedDir, 'vervaeke_seed_corpus.from-firestore.json')
    const outputCsv = output.replace(/\.json$/, '.csv')
    saveSeed(liveSeed, output, outputCsv)
    console.log(`live seed exported: ${output}`)
    return
  }

  throw new Error(`unknown command: ${command}`)
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
