from __future__ import annotations

import secrets
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from typing import Any

# PRD §8.1 — 31-char alphabet, no confusable characters.
CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
COLOR_RE = r"^#[0-9A-Fa-f]{6}$"


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
    return "".join(ch for ch in code.upper() if ch.isalnum())


def sanitize_name(name: str, max_len: int = 24) -> str:
    cleaned = "".join(ch for ch in name if ch.isprintable() and ord(ch) >= 32)
    return cleaned.strip()[:max_len]


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
    max_expires_at: datetime
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

    def approved_count(self) -> int:
        return sum(1 for p in self.pointers.values() if p.approved)

    def is_full(self) -> bool:
        return len(self.pointers) >= self.max_pointers or self.approved_count() >= self.max_pointers

    def mark_live(self, now: datetime | None = None) -> None:
        self.status = SessionStatus.LIVE
        # Once used, sessions live until max TTL (PRD B-4).
        self.expires_at = self.max_expires_at

    def is_expired(self, now: datetime) -> bool:
        if self.status == SessionStatus.ENDED:
            return True
        return now >= self.expires_at or now >= self.max_expires_at


def create_session(
    *,
    host_name: str | None,
    max_pointers: int,
    unused_ttl_s: int,
    max_ttl_s: int,
    auto_admit: bool,
    now: datetime | None = None,
) -> Session:
    created = now or datetime.now(UTC)
    unused_exp = created + timedelta(seconds=unused_ttl_s)
    max_exp = created + timedelta(seconds=max_ttl_s)
    return Session(
        session_id=new_session_id(),
        code=generate_code(),
        host_token=new_token(),
        host_name=sanitize_name(host_name) if host_name else None,
        created_at=created,
        expires_at=min(unused_exp, max_exp),
        max_expires_at=max_exp,
        max_pointers=max_pointers,
        auto_admit=auto_admit,
    )
