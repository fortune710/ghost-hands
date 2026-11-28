# Dev harness

Two-tab BroadcastChannel harness for local gesture / renderer testing without Tauri or the backend.

Routes live in `apps/pointer`:

- `/dev/pointer` — pose + ctrl publisher (Synthetic / Camera / Mouse)
- `/dev/receiver` — OverlayRenderer + ink over a faux VS Code backdrop

```bash
just harness
# then open both URLs in separate tabs:
#   http://localhost:5173/dev/pointer
#   http://localhost:5173/dev/receiver
```

## Pointer modes (M1)

| Mode | Behavior |
|---|---|
| **Synthetic** (default) | Demo right hand follows mouse (or a figure-8). Modes: point / pinch / palm / none. No webcam required. |
| **Camera** | MediaPipe Hand Landmarker on-device (`/models/hand_landmarker.task`). Falls back to Synthetic if model or camera fails. |
| **Mouse** | Simple tip fan (M0 fallback) — always POINT, no stroke FSM. |

Hotkeys on the pointer tab: **Space** hide hand, **C** publish clear.

## Receiver

- Streams pose frames (96 B) and ctrl (`stroke_start` / `stroke_end` / `clear`)
- While gesture is PINCH, appends ink at the tip; `stroke_end` snaps arrow / free / discard
- Open palm (or **C**) clears ink with a short wipe

Recorded landmark traces for gesture regression go in `tools/traces/`.
