import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDisplayCode, normalizeCode } from '@ghost-hands/protocol';

const CODE_RE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/;

export function Join() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const normalized = normalizeCode(code);
    if (!CODE_RE.test(normalized)) {
      setError('Enter a 6-character code (letters/numbers; no 0/O/1/I/L).');
      return;
    }
    navigate(`/join/${formatDisplayCode(normalized)}`);
  }

  return (
    <main className="page">
      <h1 className="brand">Ghost Hands</h1>
      <p className="lede">Point at a shared screen with your hand. Nothing to install.</p>
      <form className="panel" onSubmit={onSubmit}>
        <label htmlFor="code">Session code</label>
        <input
          id="code"
          type="text"
          inputMode="text"
          autoComplete="off"
          placeholder="KX4-92P"
          value={code}
          onChange={(ev) => {
            setCode(ev.target.value.toUpperCase());
            setError(null);
          }}
        />
        {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}
        <div className="row">
          <button className="primary" type="submit">
            Join session
          </button>
        </div>
      </form>
      <p className="status" style={{ marginTop: '1.5rem' }}>
        Dev harness:{' '}
        <a href="/dev/pointer">/dev/pointer</a> · <a href="/dev/receiver">/dev/receiver</a>
      </p>
    </main>
  );
}
