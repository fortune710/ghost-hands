from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from app.clock import FakeClock
from app.main import create_app
from app.settings import Settings


@pytest.fixture
def settings() -> Settings:
    return Settings(
        env="test",
        join_base_url="https://ghosthands.fortunealebiosu.dev",
        pointer_base_url="https://ghosthands.fortunealebiosu.dev",
        session_unused_ttl_s=600,
        session_max_ttl_s=7200,
        max_pointers=1,
        auto_admit_default=True,
        stun_urls="stun:stun.cloudflare.com:3478",
        turn_urls=(
            "turn:turn.example:3478?transport=udp,"
            "turn:turn.example:3478?transport=tcp,"
            "turns:turn.example:443"
        ),
        turn_secret="test-turn-secret",
        cors_origins="http://localhost:5173",
    )


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock(datetime(2026, 11, 27, 12, 0, 0, tzinfo=UTC))


@pytest.fixture
def app(settings: Settings, clock: FakeClock):
    application = create_app(settings)
    application.state.clock = clock
    application.state.lifecycle.clock = clock
    # Avoid background sweeper racing tests; call expire_due explicitly.
    application.state.lifecycle.tick_s = 3600
    return application


@pytest.fixture
def client(app) -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c
