# Latency hook + manual network tests (M2)

## Local p50 pose-to-render

The pointer Live page maintains `window.__GH_LATENCY__ = { p50: number }` (milliseconds).

It measures **local** send→sample latency on the pointer (encode/send path) as a stand-in for glass-to-glass during loopback smoke. True glass-to-glass needs a sharer-side render timestamp (overlay can be extended in M3).

### How to run

1. Start API + pointer (`just dev` or separate uvicorn + Vite).
2. Open `http://localhost:5173/dev/host` (sharer) and copy the join link.
3. Open the join link in a second tab; continue to Live (synthetic tracking by default).
4. When status is **Live**, in the pointer tab DevTools console:
   ```js
   window.__GH_LATENCY__.p50
   ```
5. Target for loopback: well under the same-continent N-1 budget (p50 < 120 ms end-to-end). Loopback p50 should typically be single-digit to low tens of ms for the local hook.

Optional: `?camera=1` on Live to use the webcam instead of synthetic.

## Two different networks

1. Deploy staging/prod API + pointer (see [deploy-m2.md](./deploy-m2.md)).
2. Laptop A (sharer): desktop control **Start Session** (or `/dev/host` in a browser for a quick check), share the join URL.
3. Laptop B on a **different network** (e.g. phone hotspot): open the join URL, allow camera (or synthetic), wait for Live.
4. Confirm ghost hand moves on the sharer; note ICE type in chrome://webrtc-internals (host/srflx/relay).
5. Pass: connect success + subjective latency acceptable; ideally local overlay p50 &lt; 130 ms once a sharer-side timer exists.

## TURN-only (UDP blocked)

1. Ensure `GH_TURN_URLS` includes TCP and `turns:…:443`, and `GH_TURN_SECRET` is set.
2. On the pointer machine, block UDP to the internet (OS firewall / corporate policy / browser WebRTC UDP block extension). Keep TCP 443.
3. Join a session and confirm connection via **relay** candidates in chrome://webrtc-internals.
4. Pass: DataChannels open and poses render while UDP is blocked.

## What the cloud agent verified vs what still needs humans

| Verified in VM | Still needs real deploy / networks |
|---|---|
| Unit + contract tests, lint, typecheck, Vite build | VPS nginx + container deploy |
| Loopback API + two browser peers (`/dev/host` + `/join`) | Two different networks |
| TURN credential minting (HMAC unit tests) | TURN-only with UDP blocked against real coturn/Cloudflare |
| Local `__GH_LATENCY__.p50` hook present | Same-continent glass-to-glass p50 &lt; 130 ms on staging |
