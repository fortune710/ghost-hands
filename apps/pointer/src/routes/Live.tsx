import { Link, useLocation, useParams } from 'react-router-dom';
import { formatDisplayCode, normalizeCode } from '@ghost-hands/protocol';

/**
 * Live session shell for M0 — MediaPipe + WebRTC offerer land in M1/M2.
 * Camera preview placeholder + privacy banner are wired now.
 */
export function Live() {
  const { code: raw } = useParams();
  const location = useLocation();
  const state = location.state as { name?: string; color?: string } | null;
  const displayCode = formatDisplayCode(normalizeCode(raw ?? ''));
  const name = state?.name ?? localStorage.getItem('gh:name') ?? 'Pointer';
  const color = state?.color ?? localStorage.getItem('gh:color') ?? '#4FC3F7';

  return (
    <main className="page">
      <h1 className="brand">Ghost Hands</h1>
      <p className="lede">
        {name} · {displayCode} · <span style={{ color }}>●</span> waiting for camera / signaling
        (M1–M2)
      </p>
      <div className="banner">
        Your video stays on this device. Only hand positions are sent.
      </div>
      <div className="panel">
        <p>
          Live tracking, DataChannel offerer, and mini-map land in M1/M2. For local two-tab
          testing now, open the BroadcastChannel harness:
        </p>
        <div className="row">
          <Link className="primary" to="/dev/pointer" style={{ textDecoration: 'none' }}>
            Open /dev/pointer
          </Link>
          <Link className="ghost" to="/join">
            Leave
          </Link>
        </div>
      </div>
    </main>
  );
}
