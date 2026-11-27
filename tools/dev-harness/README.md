# Dev harness

Two-tab BroadcastChannel harness for local gesture / renderer testing without Tauri or the backend.

Routes live in `apps/pointer`:

- `/dev/pointer` — mouse-driven pose publisher (96 B frames)
- `/dev/receiver` — ghost-hand receiver over a faux VS Code backdrop

```bash
just harness
# then open both URLs in separate tabs
```

Recorded landmark traces for gesture regression (M1+) go in `tools/traces/`.
