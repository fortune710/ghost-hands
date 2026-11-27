import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';

function ControlApp() {
  const [autoAdmit, setAutoAdmit] = useState(true);
  const [code] = useState<string | null>(null);

  return (
    <main className="control">
      <h1>Ghost Hands</h1>
      <p className="muted">Sharer control window (M0 scaffold)</p>
      <section className="card">
        <p>
          Session code: <strong>{code ?? '— start a session in M3 —'}</strong>
        </p>
        <div className="row">
          <button type="button" disabled>
            Start Session
          </button>
          <button type="button" disabled>
            Copy link
          </button>
        </div>
      </section>
      <section className="card">
        <label>
          <input
            type="checkbox"
            checked={autoAdmit}
            onChange={(e) => setAutoAdmit(e.target.checked)}
          />{' '}
          Auto-admit first pointer (on by default)
        </label>
        <p className="muted">
          When off, every pointer requires one-click Allow / Deny (PRD D-6 / Q1).
        </p>
      </section>
      <p className="muted">
        Overlay + WebRTC spike pages: <code>index.overlay.html</code>, <code>index.spike.html</code>
      </p>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ControlApp />
  </StrictMode>,
);
