import { Link } from 'react-router-dom';
import { DEFAULT_ACTIVE_ZONE } from '@ghost-hands/gestures';

export function Calibrate() {
  return (
    <main className="page">
      <h1 className="brand">Calibrate</h1>
      <p className="lede">
        Optional ~5 s calibration. Default auto-zone is already center ~70% (
        {DEFAULT_ACTIVE_ZONE.x0}–{DEFAULT_ACTIVE_ZONE.x1}).
      </p>
      <div className="panel">
        <p>
          2-point / 4-corner calibration UI ships in M4. For now, reset clears any saved zone
          back to auto-mapping.
        </p>
        <div className="row">
          <button
            className="primary"
            type="button"
            onClick={() => {
              localStorage.removeItem('gh:zone');
            }}
          >
            Reset to auto
          </button>
          <Link className="ghost" to="/join">
            Back
          </Link>
        </div>
      </div>
    </main>
  );
}
