import './App.css'

const nextSteps = [
  'Create the Firebase project and wire .env.local',
  'Freeze the phrase/language/submission data model',
  'Build the translator shell UI with typeahead + output panel',
  'Keep all moderation and status transitions in trusted server code',
]

const statusModel = [
  'wait-click',
  'await-review',
  'contender',
  'current',
  'replaced',
  'rejected-unworthy',
  'hidden-inappropriate',
  'hidden-owner-deleted',
]

function App() {
  return (
    <main className="app-shell">
      <section className="hero-card">
        <p className="eyebrow">Starter scaffold</p>
        <h1>Vervaeke Translate</h1>
        <p className="lede">
          A playful “translator” for Vervaeke phrases, with plain-language translations,
          spoof philosopher modes, and a moderated public submission pipeline.
        </p>
        <div className="pill-row">
          <span>React + Vite</span>
          <span>Firebase Hosting</span>
          <span>Firestore</span>
          <span>Server-side status logic</span>
        </div>
      </section>

      <section className="grid two-up">
        <article className="card">
          <h2>What exists now</h2>
          <ul>
            <li>Project scaffold under <code>~/projects/vervaeke-translate</code></li>
            <li>Firebase setup guide adapted from sibling projects</li>
            <li>Starter Hosting + Firestore config files</li>
            <li>Placeholder frontend ready for real product slices</li>
          </ul>
        </article>

        <article className="card">
          <h2>What does not exist yet</h2>
          <ul>
            <li>Typeahead glossary corpus</li>
            <li>Submission endpoints</li>
            <li>Email click-confirmation flow</li>
            <li>Moderation/admin tooling</li>
          </ul>
        </article>
      </section>

      <section className="grid two-up">
        <article className="card">
          <h2>Firebase shape</h2>
          <p>
            Public reads can be broad, but writes that affect publication or moderation
            state must go through trusted server code.
          </p>
          <ul>
            <li>Frontend: Firebase Hosting</li>
            <li>Data: Firestore</li>
            <li>Trusted mutations: Cloud Functions or Cloud Run</li>
            <li>Submission protection: CAPTCHA, rate limits, tarpitting</li>
          </ul>
        </article>

        <article className="card">
          <h2>Status model</h2>
          <div className="status-list">
            {statusModel.map((status) => (
              <code key={status}>{status}</code>
            ))}
          </div>
        </article>
      </section>

      <section className="card">
        <h2>Setup checklist</h2>
        <ol>
          {nextSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="footnote">
          Follow <code>FIREBASE_SETUP.md</code> for the concrete Firebase steps.
        </p>
      </section>
    </main>
  )
}

export default App
