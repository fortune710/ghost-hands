# Ghost Hands

Remote hand-pointer overlay for screen shares. The **pointer** opens a browser tab (no install); the **sharer** runs a Tauri desktop overlay that draws a see-through ghost hand + fading ink over any app. Video never leaves the pointer device — only 21 normalized `(x, y)` landmarks + gesture state (~96 B @ 30 Hz) travel over a WebRTC DataChannel.

**PRD:** v1.1.1 (approved 2026-11-27) · Domain: [`ghosthands.fortunealebiosu.dev`](https://ghosthands.fortunealebiosu.dev) · API: [`api.ghosthands.fortunealebiosu.dev`](https://api.ghosthands.fortunealebiosu.dev)

## Monorepo layout

| Path | Role |
|---|---|
| `apps/pointer` | Zero-install React + Vite pointer web app (Vercel) |
| `apps/desktop` | Tauri v2 + React sharer (macOS / Windows overlay) |
| `packages/protocol` | Wire schemas, pose codec, codegen → TS + Pydantic |
| `packages/gestures` | One-Euro filter, gesture FSM, active-zone mapping |
| `packages/renderer` | Canvas2D ghost hand + fading ink |
| `packages/config` | Shared TS / ESLint / Prettier presets |
| `backend/api` | FastAPI + WebSockets (uv, Python 3.12) |
| `tools/dev-harness` | Notes for the `/dev/pointer` + `/dev/receiver` harness |
| `e2e` | Playwright suites (M2+) |

**Tooling:** Bun workspaces + Turborepo (JS/TS), Cargo (Tauri), uv + Ruff + mypy (Python). Do **not** use pnpm.

## Quick start

```bash
just setup          # bun install + uv sync
just codegen        # TS types + Pydantic models from schema/
just harness        # http://localhost:5173/dev/pointer + /dev/receiver
just dev            # API :8000 + pointer :5173 (+ tauri on macOS/Windows)
just test           # Vitest + pytest (+ cargo check)
just lint           # tsc + ruff + mypy
```

Join URLs: `https://ghosthands.fortunealebiosu.dev/join/<code>` (staging: `staging.ghosthands.fortunealebiosu.dev`).

## Binding product defaults (Fortune)

- **Auto-admit on by default** (toggle in sharer settings) — one-click Allow when off.
- **Zero-setup calibration** — center ~70% auto-map (`0.15..0.85`); optional 5 s calibration later.
- **Pose payload** — 96 B, 21×`(x,y)` + gesture flags; no `z`, no video upload.
- **Hosting** — pointer on Vercel; FastAPI on Fortune’s VPS behind shared nginx (`backend/api/deploy/nginx-ghosthands.conf`).

## Milestone status

### M0 — scaffold

Monorepo scaffold, protocol codegen, BroadcastChannel harness, FastAPI skeleton, CI, and Tauri overlay/WebRTC spike harnesses.

| Verified in CI / Linux VM | Needs real macOS / Windows |
|---|---|
| Bun install, typecheck, lint, Vitest | Transparent / always-on-top / click-through overlay over full-screen apps |
| `just codegen` + drift check | Overlay visible in Zoom / Meet / OBS capture |
| uv: Ruff, mypy, pytest | WebRTC DataChannel inside WKWebView + WebView2 ↔ Chrome |
| Cargo check where feasible (Linux) | Decision to keep webview RTC or fall back to `webrtc-rs` (Q3) |

### M1 — pointer tracking + gestures

On-device MediaPipe Hand Landmarker in `apps/pointer`, synthetic demo fallback, PosePipeline (smooth → classify → FSM → map), Canvas2D renderer, and a two-tab harness that can underline code on the mock VS Code backdrop.

| Done | Deferred |
|---|---|
| 96 B pose codec + schema codegen (zero drift) | WebRTC DataChannel offerer (M2) |
| One-Euro, gesture FSM, 600 ms arrow snap, 2-point / 4-corner mapping | Production calibration via sharer `calib_target` (M4 polish) |
| Canvas2D ghost hand + fading ink / arrows / clear wipe | Desktop overlay consuming live poses (M3) |
| `HandTracker` + synthetic / camera / mouse harness | Homography end-to-end in Live UI (library ready) |
| `/dev/pointer` → `/dev/receiver` at 30–60 fps | |

## Environments

| Env | Pointer | API |
|---|---|---|
| local | `http://localhost:5173` | `http://localhost:8000` |
| staging | `https://staging.ghosthands.fortunealebiosu.dev` | shared ingress / staging API host |
| prod | `https://ghosthands.fortunealebiosu.dev` | `https://api.ghosthands.fortunealebiosu.dev` |

Copy `.env.example` → `.env` for local overrides.
