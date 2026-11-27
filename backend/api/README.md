# Ghost Hands API

FastAPI backend for session lifecycle, WebSocket signaling, ICE/TURN vending, and health endpoints.

- Python 3.12 + `uv`
- Lint/typecheck: Ruff + mypy
- Local: `just serve` or `uv run uvicorn app.main:app --reload --port 8000`
- Production host: `api.ghosthands.fortunealebiosu.dev` (Fortune VPS, shared nginx ingress — see `deploy/nginx-ghosthands.conf`)
