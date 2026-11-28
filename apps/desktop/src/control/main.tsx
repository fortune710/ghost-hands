import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';
import { createSession, endSession } from '../lib/api';
import {
  clearSession,
  loadSession,
  openBridge,
  postBridge,
  saveSession,
  type DesktopSessionState,
} from '../lib/sessionBridge';
import { joinUrl as buildJoinUrl } from '../lib/config';

function ControlApp() {
  const [autoAdmit, setAutoAdmit] = useState(true);
  const [session, setSession] = useState<DesktopSessionState | null>(() => loadSession());
  const [status, setStatus] = useState('Idle — start a session, then open the overlay');
  const [pending, setPending] = useState<{ peer: string; name: string; color: string } | null>(
    null,
  );

  useEffect(() => {
    const ch = openBridge((msg) => {
      if (msg.type === 'status') {
        setStatus(msg.status);
        if (msg.pending !== undefined) setPending(msg.pending);
      } else if (msg.type === 'pointer') {
        setSession((prev) => (prev ? { ...prev, pointer: msg.pointer, status: 'live' } : prev));
      } else if (msg.type === 'clear') {
        setSession(null);
        setPending(null);
      }
    });
    return () => ch?.close();
  }, []);

  const stop = useCallback(async () => {
    const current = loadSession();
    postBridge({ type: 'end' });
    if (current) {
      try {
        await endSession(current.code, current.host_token);
      } catch {
        /* ignore */
      }
    }
    clearSession();
    setSession(null);
    setPending(null);
    setStatus('Ended');
  }, []);

  const start = useCallback(async () => {
    setStatus('Creating session…');
    try {
      const created = await createSession({
        host_name: 'Sharer',
        auto_admit: autoAdmit,
      });
      const state: DesktopSessionState = {
        code: created.code,
        display_code: created.display_code,
        join_url: created.join_url || buildJoinUrl(created.display_code),
        host_token: created.host_token,
        ice_servers: created.ice_servers,
        auto_admit: autoAdmit,
        status: 'waiting',
        pointer: null,
      };
      setSession(state);
      saveSession(state);
      setStatus(`Session ${state.display_code} — overlay will answer WebRTC`);
    } catch (err) {
      setStatus(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [autoAdmit]);

  async function copyLink() {
    if (!session) return;
    try {
      await navigator.clipboard.writeText(session.join_url);
      setStatus('Join link copied');
    } catch {
      setStatus('Copy failed');
    }
  }

  return (
    <main className="control">
      <h1>Ghost Hands</h1>
      <p className="muted">Sharer control · M2 signaling</p>
      <section className="card">
        <p>
          Session code: <strong>{session?.display_code ?? '—'}</strong>
        </p>
        {session ? (
          <p className="muted" style={{ wordBreak: 'break-all' }}>
            {session.join_url}
          </p>
        ) : null}
        <div className="row">
          <button type="button" onClick={() => void start()} disabled={!!session}>
            Start Session
          </button>
          <button type="button" onClick={() => void copyLink()} disabled={!session}>
            Copy link
          </button>
          <button type="button" onClick={() => void stop()} disabled={!session}>
            End Session
          </button>
        </div>
        <p className="muted">{status}</p>
      </section>

      {pending ? (
        <section className="card">
          <p>
            <strong style={{ color: pending.color }}>{pending.name}</strong> wants to point.
          </p>
          <div className="row">
            <button
              type="button"
              onClick={() => {
                postBridge({ type: 'approve', peer: pending.peer });
                setPending(null);
              }}
            >
              Allow
            </button>
            <button
              type="button"
              onClick={() => {
                postBridge({ type: 'deny', peer: pending.peer });
                setPending(null);
              }}
            >
              Deny
            </button>
          </div>
        </section>
      ) : null}

      <section className="card">
        <label>
          <input
            type="checkbox"
            checked={autoAdmit}
            disabled={!!session}
            onChange={(e) => setAutoAdmit(e.target.checked)}
          />{' '}
          Auto-admit first pointer (on by default)
        </label>
        <p className="muted">
          When off, every pointer requires one-click Allow / Deny (PRD D-6 / Q1).
        </p>
      </section>
      <p className="muted">
        The overlay window owns the host WebSocket + WebRTC answerer and renders network pose
        frames.
      </p>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ControlApp />
  </StrictMode>,
);
