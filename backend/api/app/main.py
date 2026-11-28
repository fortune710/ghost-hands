from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.clock import SystemClock
from app.lifecycle import SessionLifecycle
from app.metrics import Metrics
from app.ratelimit import RateLimiters
from app.routes import health, sessions
from app.settings import Settings, get_settings
from app.store.memory import InMemorySessionStore
from app.ws import signaling
from app.ws.registry import ConnectionRegistry
from app.ws.signaling import broadcast_session_ended


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    store = InMemorySessionStore()
    metrics = Metrics()
    registry = ConnectionRegistry()
    limiters = RateLimiters()
    clock = SystemClock()
    lifecycle = SessionLifecycle(store, metrics, clock)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        async def on_end(code: str, reason: str) -> None:
            await broadcast_session_ended(app, code, reason)

        lifecycle.set_end_notifier(on_end)
        lifecycle.start()
        yield
        await lifecycle.stop()

    app = FastAPI(title="Ghost Hands API", version="0.1.0", lifespan=lifespan)
    app.state.settings = settings
    app.state.store = store
    app.state.metrics = metrics
    app.state.registry = registry
    app.state.limiters = limiters
    app.state.lifecycle = lifecycle
    app.state.clock = clock

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(sessions.router)
    app.include_router(signaling.router)

    if settings.serve_pointer_static and settings.pointer_static_dir:
        static_dir = Path(settings.pointer_static_dir)
        if static_dir.is_dir():
            app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="pointer")

    return app


app = create_app()
