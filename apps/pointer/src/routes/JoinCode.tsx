import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { formatDisplayCode, normalizeCode } from '@ghost-hands/protocol';
import { ApiError, getSession } from '../lib/api';

const COLORS = ['#4FC3F7', '#FF8A65', '#81C784', '#CE93D8', '#FFD54F'];

const ERROR_COPY: Record<string, string> = {
  ROOM_NOT_FOUND: 'That room code was not found. Check the code with your sharer.',
  ROOM_EXPIRED: 'This session has expired. Ask your sharer to start a new room.',
  RATE_LIMITED: 'Too many lookups. Wait a moment and try again.',
};

export function JoinCode() {
  const { code: raw } = useParams();
  const navigate = useNavigate();
  const norm = useMemo(() => normalizeCode(raw ?? ''), [raw]);
  const displayCode = useMemo(() => formatDisplayCode(norm), [norm]);
  const [name, setName] = useState(() => localStorage.getItem('gh:name') ?? '');
  const [color, setColor] = useState(
    () => localStorage.getItem('gh:color') ?? COLORS[0]!,
  );
  const [loading, setLoading] = useState(true);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [roomStatus, setRoomStatus] = useState<string | null>(null);
  const [hostName, setHostName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setRoomError(null);
    void (async () => {
      try {
        const status = await getSession(norm);
        if (cancelled) return;
        setRoomStatus(status.status);
        setHostName(status.host_name);
        if (status.status === 'ended') {
          setRoomError('This session has ended.');
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError) {
          setRoomError(ERROR_COPY[err.code] ?? err.message);
        } else {
          setRoomError('Could not reach the session server.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [norm]);

  function onContinue(e: FormEvent) {
    e.preventDefault();
    if (roomError) return;
    const trimmed = name.trim().slice(0, 24);
    if (!trimmed) return;
    localStorage.setItem('gh:name', trimmed);
    localStorage.setItem('gh:color', color);
    navigate(`/live/${displayCode}`, { state: { name: trimmed, color } });
  }

  const blocked = Boolean(roomError);

  return (
    <main className="page">
      <h1 className="brand">Ghost Hands</h1>
      <p className="lede">
        Joining <strong>{displayCode}</strong>
        {hostName ? <> · host <strong>{hostName}</strong></> : null}
      </p>

      {loading ? (
        <p className="status">Checking room…</p>
      ) : roomError ? (
        <div className="banner" role="alert">
          {roomError}
        </div>
      ) : (
        <p className="status">
          Room is {roomStatus ?? 'open'}. Enter your pointer name to continue.
        </p>
      )}

      <form className="panel" onSubmit={onContinue}>
        <label htmlFor="name">Display name</label>
        <input
          id="name"
          type="text"
          maxLength={24}
          value={name}
          onChange={(ev) => setName(ev.target.value)}
          placeholder="Ada"
          required
          disabled={blocked}
        />
        <label>Color</label>
        <div className="row" style={{ marginBottom: '1rem' }}>
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Pick ${c}`}
              disabled={blocked}
              onClick={() => setColor(c)}
              style={{
                width: 36,
                height: 36,
                borderRadius: 999,
                border: color === c ? '3px solid white' : '1px solid #334155',
                background: c,
                cursor: blocked ? 'not-allowed' : 'pointer',
                opacity: blocked ? 0.5 : 1,
              }}
            />
          ))}
        </div>
        <div className="banner">
          Your video stays on this device. Only hand positions are sent.
        </div>
        <div className="row">
          <button className="primary" type="submit" disabled={blocked || loading}>
            Continue
          </button>
          <Link className="ghost" to="/join" style={{ padding: '0.7rem 1.1rem' }}>
            Different code
          </Link>
        </div>
      </form>
      <p className="status">
        Calibration is skipped by default (center ~70% auto-map).{' '}
        <Link to="/calibrate">Pointing feels off? Calibrate (5 s)</Link>
      </p>
    </main>
  );
}