from __future__ import annotations

import time
from collections import OrderedDict

from app.domain.session import Session, SessionStatus, normalize_code
from app.store.base import SessionStore

# PRD S-6: rate-limit counters TTL ~10 min. Bound memory for code-scan abuse.
FAILED_LOOKUP_TTL_S = 600.0
FAILED_LOOKUP_MAX_KEYS = 5_000
LOCKED_CODE_MAX = 2_000


class InMemorySessionStore(SessionStore):
    def __init__(self) -> None:
        self._sessions: dict[str, Session] = {}
        # Codes that must not be reused within 24 h (MVP: process lifetime).
        self._retired_codes: set[str] = set()
        # Failed public lookups per code: code -> (count, last_seen_monotonic)
        self._failed_lookups: OrderedDict[str, tuple[int, float]] = OrderedDict()
        self._locked_codes: OrderedDict[str, float] = OrderedDict()

    async def put(self, session: Session) -> None:
        self._sessions[normalize_code(session.code)] = session

    async def get(self, code: str) -> Session | None:
        return self._sessions.get(normalize_code(code))

    async def delete(self, code: str) -> None:
        key = normalize_code(code)
        session = self._sessions.pop(key, None)
        if session is not None:
            self._retired_codes.add(key)

    async def list_active(self) -> list[Session]:
        return [s for s in self._sessions.values() if s.status != SessionStatus.ENDED]

    async def code_available(self, code: str) -> bool:
        key = normalize_code(code)
        if key in self._retired_codes:
            return False
        existing = self._sessions.get(key)
        return existing is None or existing.status == SessionStatus.ENDED

    async def find_by_token(self, token: str) -> Session | None:
        for session in self._sessions.values():
            if session.status == SessionStatus.ENDED:
                continue
            if session.host_token == token:
                return session
            for peer in session.pointers.values():
                if peer.pointer_token and peer.pointer_token == token:
                    return session
        return None

    async def record_failed_lookup(self, code: str) -> int:
        key = normalize_code(code)
        now = time.monotonic()
        self._purge_failed(now)
        count, _ = self._failed_lookups.get(key, (0, now))
        count += 1
        self._failed_lookups[key] = (count, now)
        self._failed_lookups.move_to_end(key)
        while len(self._failed_lookups) > FAILED_LOOKUP_MAX_KEYS:
            self._failed_lookups.popitem(last=False)
        if count >= 20:
            self._locked_codes[key] = now
            self._locked_codes.move_to_end(key)
            while len(self._locked_codes) > LOCKED_CODE_MAX:
                self._locked_codes.popitem(last=False)
        return count

    async def is_code_locked(self, code: str) -> bool:
        key = normalize_code(code)
        now = time.monotonic()
        self._purge_failed(now)
        locked_at = self._locked_codes.get(key)
        if locked_at is None:
            return False
        if now - locked_at > FAILED_LOOKUP_TTL_S:
            self._locked_codes.pop(key, None)
            return False
        return True

    async def clear_failed_lookups(self, code: str) -> None:
        key = normalize_code(code)
        self._failed_lookups.pop(key, None)

    def _purge_failed(self, now: float) -> None:
        stale = [
            k for k, (_, seen) in self._failed_lookups.items() if now - seen > FAILED_LOOKUP_TTL_S
        ]
        for k in stale:
            self._failed_lookups.pop(k, None)
        stale_locked = [
            k for k, seen in self._locked_codes.items() if now - seen > FAILED_LOOKUP_TTL_S
        ]
        for k in stale_locked:
            self._locked_codes.pop(k, None)
