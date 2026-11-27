import { StrictMode, useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';

/**
 * M0 WebRTC DataChannel spike harness / probe.
 * Run inside WKWebView (macOS) / WebView2 (Windows) and pair with a Chrome tab.
 * Records whether unordered `pose` + reliable `ctrl` channels can be negotiated.
 */
function SpikeApp() {
  const [log, setLog] = useState<string[]>([]);
  const [pc, setPc] = useState<RTCPeerConnection | null>(null);

  const append = useCallback((line: string) => {
    setLog((prev) => [...prev.slice(-80), `${new Date().toISOString().slice(11, 19)} ${line}`]);
  }, []);

  async function startOfferer() {
    const conn = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }] });
    setPc(conn);
    const pose = conn.createDataChannel('pose', { ordered: false, maxRetransmits: 0 });
    const ctrl = conn.createDataChannel('ctrl', { ordered: true });
    pose.onopen = () => append('pose channel open');
    ctrl.onopen = () => append('ctrl channel open');
    pose.onmessage = (ev) => append(`pose ← ${ev.data?.byteLength ?? '?'} B`);
    ctrl.onmessage = (ev) => append(`ctrl ← ${String(ev.data)}`);
    conn.onicecandidate = (ev) => {
      if (ev.candidate) append(`ice ${ev.candidate.candidate.slice(0, 48)}…`);
    };
    const offer = await conn.createOffer();
    await conn.setLocalDescription(offer);
    append('local offer created — paste into Chrome answerer');
    await navigator.clipboard.writeText(JSON.stringify(conn.localDescription));
    append('offer copied to clipboard');
  }

  async function acceptAnswer() {
    if (!pc) return;
    const raw = window.prompt('Paste remote answer SDP JSON');
    if (!raw) return;
    const desc = JSON.parse(raw) as RTCSessionDescriptionInit;
    await pc.setRemoteDescription(desc);
    append('remote answer applied');
  }

  return (
    <main className="control">
      <h1>WebRTC DataChannel Spike</h1>
      <p className="muted">
        Probe WKWebView / WebView2 DataChannel support (M0 risk R3). Fallback: webrtc-rs in Rust.
      </p>
      <div className="row">
        <button type="button" onClick={() => void startOfferer()}>
          Create offer (pose + ctrl)
        </button>
        <button type="button" onClick={() => void acceptAnswer()} disabled={!pc}>
          Paste answer
        </button>
      </div>
      <pre className="log">{log.join('\n') || 'idle'}</pre>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SpikeApp />
  </StrictMode>,
);
