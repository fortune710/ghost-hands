# E2E

Playwright suites against real signaling land here.

For M2 local smoke (API + two browser peers on loopback):

1. Start API: `cd backend/api && uv run uvicorn app.main:app --port 8000`
2. Start pointer: `cd apps/pointer && bun run dev`
3. Open `/dev/host` and `/join/<code>` in two tabs (or use a Playwright script against those URLs).

See `docs/latency-and-network-tests.md` for latency + two-network / TURN-only manual tests.
