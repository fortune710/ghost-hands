# MediaPipe Hand Landmarker assets

Place the Hand Landmarker model and WASM files here so the pointer app can run on-device without a CDN.

## Model

Download the float16 Hand Landmarker (≈7.5 MB):

```bash
curl -fsSL -o hand_landmarker.task \
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
```

Expected path: `apps/pointer/public/models/hand_landmarker.task`

If the model is missing, `HandTracker` falls back to the synthetic demo hand automatically — the build still succeeds.

## WASM

Copy Vision WASM from the installed package (after `bun install`):

```bash
cp -R node_modules/@mediapipe/tasks-vision/wasm/* apps/pointer/public/models/wasm/
```

Or from the monorepo root:

```bash
cp -R apps/pointer/node_modules/@mediapipe/tasks-vision/wasm/. \
  apps/pointer/public/models/wasm/
```

`HandTracker` tries `/models/wasm` first, then the jsDelivr CDN as a last resort.

The `wasm/` directory is gitignored (~33 MB). Copy it locally after install when you want offline WASM; otherwise the CDN fallback is used.

## Privacy

Video frames never leave the browser. Only 21 normalized landmarks + gesture state are published (BroadcastChannel locally, WebRTC DataChannel in M2).
