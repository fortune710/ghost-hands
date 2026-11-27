import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { formatDisplayCode, normalizeCode } from '@ghost-hands/protocol';

const COLORS = ['#4FC3F7', '#FF8A65', '#81C784', '#CE93D8', '#FFD54F'];

export function JoinCode() {
  const { code: raw } = useParams();
  const navigate = useNavigate();
  const displayCode = useMemo(() => formatDisplayCode(normalizeCode(raw ?? '')), [raw]);
  const [name, setName] = useState(() => localStorage.getItem('gh:name') ?? '');
  const [color, setColor] = useState(
    () => localStorage.getItem('gh:color') ?? COLORS[0]!,
  );

  function onContinue(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim().slice(0, 24);
    if (!trimmed) return;
    localStorage.setItem('gh:name', trimmed);
    localStorage.setItem('gh:color', color);
    navigate(`/live/${displayCode}`, { state: { name: trimmed, color } });
  }

  return (
    <main className="page">
      <h1 className="brand">Ghost Hands</h1>
      <p className="lede">
        Joining <strong>{displayCode}</strong>
      </p>
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
        />
        <label>Color</label>
        <div className="row" style={{ marginBottom: '1rem' }}>
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Pick ${c}`}
              onClick={() => setColor(c)}
              style={{
                width: 36,
                height: 36,
                borderRadius: 999,
                border: color === c ? '3px solid white' : '1px solid #334155',
                background: c,
                cursor: 'pointer',
              }}
            />
          ))}
        </div>
        <div className="banner">
          Your video stays on this device. Only hand positions are sent.
        </div>
        <div className="row">
          <button className="primary" type="submit">
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
