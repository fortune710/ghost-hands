from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.routes import health, sessions
from app.settings import Settings, get_settings
from app.store.memory import InMemorySessionStore
from app.ws import signaling


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    app = FastAPI(title="Ghost Hands API", version="0.1.0")
    app.state.settings = settings
    app.state.store = InMemorySessionStore()

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
