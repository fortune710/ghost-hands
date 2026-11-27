from __future__ import annotations

import secrets
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from typing import Any

# PRD §8.1 — 31-char alphabet, no confusable characters.
CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"


class SessionStatus(StrEnum):
    WAITING = "waiting"
    LIVE = "live"
    ENDED = "ended"


def generate_code(length: int = 6) -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(length))


def format_display_code(code: str) -> str:
    raw = code.replace("-", "").upper()
    return f"{raw[:3]}-{raw[3:]}" if len(raw) == 6 else raw


def normalize_code(code: str) -> str:
    return code.replace("-", "").upper()


def new_token() -> str:
    return secrets.token_urlsafe(32)


def new_session_id() -> str:
    return f"ses_{secrets.token_urlsafe(12)}"


def new_peer_id() -> str:
    return f"p_{secrets.token_hex(3)}"


@dataclass
class PointerPeer:
    peer_id: str
    name: str
    color: str
    approved: bool = False
    pointer_token: str | None = None


@dataclass
class Session:
    session_id: str
    code: str
    host_token: str
    host_name: str | None
    created_at: datetime
    expires_at: datetime
    max_pointers: int
    auto_admit: bool
    status: SessionStatus = SessionStatus.WAITING
    pointers: dict[str, PointerPeer] = field(default_factory=dict)
    host_connected: bool = False
    meta: dict[str, Any] = field(default_factory=dict)

    @property
    def display_code(self) -> str:
        return format_display_code(self.code)

    def join_url(self, base: str) -> str:
        return f"{base.rstrip('/')}/join/{self.display_code}"


def create_session(
    *,
    host_name: str | None,
    max_pointers: int,
    unused_ttl_s: int,
    auto_admit: bool,
) -> Session:
    now = datetime.now(UTC)
    return Session(
        session_id=new_session_id(),
        code=generate_code(),
        host_token=new_token(),
        host_name=host_name,
        created_at=now,
        expires_at=now + timedelta(seconds=unused_ttl_s),
        max_pointers=max_pointers,
        auto_admit=auto_admit,
    )
