# Ghost Hands M2 deploy runbook

Pointer on **Vercel**, API on **Fortune's VPS** behind the shared nginx ingress. This document covers staging + production. Do **not** deploy from a cloud agent VM — there is no VPS access here.

## Hosts

| Env | Pointer | API |
|---|---|---|
| local | `http://localhost:5173` | `http://localhost:8000` |
| staging | `https://staging.ghosthands.fortunealebiosu.dev` | same API host or staging upstream as configured |
| prod | `https://ghosthands.fortunealebiosu.dev` | `https://api.ghosthands.fortunealebiosu.dev` |

Vercel project **Root Directory**: `apps/pointer`.

## Environment variables

### Backend (`backend/api`, prefix `GH_`)

| Variable | Required | Notes |
|---|---|---|
| `GH_ENV` | yes | `local` / `staging` / `prod` |
| `GH_HOST` | no | default `0.0.0.0` |
| `GH_PORT` | no | default `8000` |
| `GH_PUBLIC_API_URL` | yes | e.g. `https://api.ghosthands.fortunealebiosu.dev` |
| `GH_POINTER_BASE_URL` | yes | e.g. `https://ghosthands.fortunealebiosu.dev` |
| `GH_JOIN_BASE_URL` | yes | join link base (usually same as pointer base) |
| `GH_SESSION_UNUSED_TTL_S` | no | default `600` (10 min) |
| `GH_SESSION_MAX_TTL_S` | no | default `7200` (2 h) |
| `GH_MAX_POINTERS` | no | default `1` |
| `GH_AUTO_ADMIT_DEFAULT` | no | default `true` |
| `GH_STUN_URLS` | no | comma-separated; default Cloudflare STUN |
| `GH_TURN_URLS` | prod | comma-separated `turn:` / `turns:` URLs (UDP + TCP + TLS/443) |
| `GH_TURN_SECRET` | with TURN | shared secret for time-limited HMAC credentials (TTL 1 h) |
| `GH_CORS_ORIGINS` | yes | comma-separated origins (prod + staging pointer URLs) |
| `GH_SERVE_POINTER_STATIC` | no | `true` only for `just serve` LAN mode |
| `GH_POINTER_STATIC_DIR` | with static | path to `apps/pointer/dist` |

### Pointer (Vercel / Vite)

| Variable | Required | Notes |
|---|---|---|
| `VITE_API_BASE_URL` | yes | `https://api.ghosthands.fortunealebiosu.dev` |
| `VITE_WS_BASE_URL` | yes | `wss://api.ghosthands.fortunealebiosu.dev` |
| `VITE_POINTER_BASE_URL` | optional | defaults to current origin |

### Desktop (build-time)

Same `VITE_API_BASE_URL` / `VITE_WS_BASE_URL` / `VITE_POINTER_BASE_URL` as in `apps/desktop`.

## VPS API deploy (Docker Compose)

1. Clone the monorepo on the VPS (or sync a release tag) to `/opt/ghost-hands`.
2. Copy env:
   ```bash
   cp /opt/ghost-hands/.env.example /opt/ghost-hands/backend/api/.env
   # edit: GH_TURN_*, GH_CORS_ORIGINS, URLs
   ```
3. Build and start:
   ```bash
   cd /opt/ghost-hands/backend/api
   docker compose up -d --build
   curl -fsS http://127.0.0.1:8000/healthz
   ```
4. Install nginx rule from `backend/api/deploy/nginx-ghosthands.conf` into the shared ingress (ensure `map $http_upgrade $connection_upgrade` exists). TLS certs stay on the shared ingress.
5. Reload nginx: `sudo nginx -t && sudo systemctl reload nginx`.
6. Verify: `curl -fsS https://api.ghosthands.fortunealebiosu.dev/healthz` and `/metrics`.

### Alternative: systemd (no Docker)

See `backend/api/deploy/ghosthands-api.service`. Use a single uvicorn worker — the MVP store is in-memory.

## Optional coturn

If not using Cloudflare TURN, use `backend/api/deploy/coturn.conf.template`. Set `GH_TURN_SECRET` to the same `static-auth-secret` and list UDP/TCP/`turns:443` in `GH_TURN_URLS`.

## Vercel pointer (staging + prod)

1. Import the GitHub repo; set **Root Directory** to `apps/pointer`.
2. Framework: Vite. Build: `bun run build` (or `npm run build` if Bun unavailable on Vercel — prefer enabling Bun).
3. Staging project/domain: `staging.ghosthands.fortunealebiosu.dev` with env pointing at the API. You can copy headers from `vercel.staging.json` into the project’s `vercel.json` for staging deploys.
4. Production domain: `ghosthands.fortunealebiosu.dev`.
5. Set `VITE_API_BASE_URL` and `VITE_WS_BASE_URL` per environment, then redeploy.

## Local verification (no VPS)

```bash
just setup
just codegen-check
just lint
just test
# API
(cd backend/api && uv run uvicorn app.main:app --port 8000) &
# Pointer
(cd apps/pointer && bun run dev)
# Smoke: open /dev/host and /join/<code> in two browser tabs on loopback
```

## Manual network tests (post-deploy)

See [latency-and-network-tests.md](./latency-and-network-tests.md) for:

- local p50 pose-to-render (`window.__GH_LATENCY__`)
- two different networks
- TURN-only (UDP blocked)
