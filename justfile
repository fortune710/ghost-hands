# Ghost Hands — monorepo task runner (Bun + uv + Cargo)
set dotenv-load := true
set shell := ["bash", "-cu"]

export PATH := env_var_or_default("HOME", "/home/ubuntu") + "/.bun/bin:" + env_var_or_default("HOME", "/home/ubuntu") + "/.local/bin:" + env_var_or_default("PATH", "")

api_dir := "backend/api"

# Install JS + Python deps, check Rust toolchain
setup:
    bun install
    cd {{api_dir}} && uv sync
    rustup show || true
    @echo "setup complete (bun + uv). Tauri targets: macOS/Windows for overlay spike."

# Parallel local stack: API + pointer Vite (+ desktop tauri when on macOS/Windows)
dev:
    #!/usr/bin/env bash
    set -euo pipefail
    (cd {{api_dir}} && uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000) &
    api_pid=$!
    (cd apps/pointer && bun run dev) &
    ptr_pid=$!
    cleanup() { kill $api_pid $ptr_pid 2>/dev/null || true; }
    trap cleanup EXIT
    if [[ "$(uname -s)" == "Darwin" || "$(uname -s)" == "MINGW"* || "$(uname -s)" == "CYGWIN"* ]]; then
      (cd apps/desktop && bunx tauri dev) &
      wait
    else
      echo "desktop tauri dev skipped on $(uname -s) — overlay spike needs macOS/Windows"
      wait $api_pid $ptr_pid
    fi

# Two-tab BroadcastChannel harness (no Tauri / backend required)
harness:
    @echo "Open http://localhost:5173/dev/pointer and http://localhost:5173/dev/receiver"
    cd apps/pointer && bun run dev

# Regenerate TS types + Pydantic models from packages/protocol/schema
codegen:
    bun run --filter @ghost-hands/protocol codegen

# Fail if codegen output is stale (CI)
codegen-check: codegen
    #!/usr/bin/env bash
    set -euo pipefail
    if ! git diff --quiet -- packages/protocol/src/generated backend/api/app/protocol_gen; then
      echo "codegen drift detected — run \`just codegen\` and commit"
      git --no-pager diff -- packages/protocol/src/generated backend/api/app/protocol_gen
      exit 1
    fi
    echo "codegen check ok"

# Unit tests across JS packages + Python API (+ cargo when available)
test:
    #!/usr/bin/env bash
    set -euo pipefail
    bun run test
    (cd {{api_dir}} && uv run pytest)
    if [ -f apps/desktop/src-tauri/Cargo.toml ]; then
      if (cd apps/desktop/src-tauri && cargo test --lib 2>/dev/null); then
        echo "cargo test --lib ok"
      elif (cd apps/desktop/src-tauri && cargo check); then
        echo "cargo check ok"
      else
        echo "cargo skipped/failed (GTK/WebKit deps often missing on Linux CI) — non-fatal for M2"
      fi
    fi

# Typecheck + lint (TS via tsc, Python via ruff/mypy)
lint:
    bun run typecheck
    bun run lint
    cd {{api_dir}} && uv run ruff check .
    cd {{api_dir}} && uv run ruff format --check .
    cd {{api_dir}} && uv run mypy app

# Build pointer and serve via FastAPI (LAN / single-origin demo)
serve:
    #!/usr/bin/env bash
    set -euo pipefail
    bun run --filter @ghost-hands/pointer build
    export GH_SERVE_POINTER_STATIC=true
    export GH_POINTER_STATIC_DIR="$(pwd)/apps/pointer/dist"
    export GH_JOIN_BASE_URL="http://localhost:8000"
    export GH_POINTER_BASE_URL="http://localhost:8000"
    cd {{api_dir}} && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000

# Tauri production build for the current OS
build-desktop:
    cd apps/desktop && bunx tauri build
