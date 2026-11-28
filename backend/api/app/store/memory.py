from __future__ import annotations

from app.domain.session import Session, SessionStatus, normalize_code
from app.store.base import SessionStore


class InMemorySessionStore(SessionStore):
    def __init__(self) -> None:
        self._sessions: dict[str, Session] = {}
        # Codes that must not be reused within 24 h (MVP: process lifetime).
        self._retired_codes: set[str] = set()
        # Failed public lookups per code (lock after 20).
        self._failed_lookups: dict[str, int] = {}
        self._locked_codes: set[str] = set()

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
        self._failed_lookups[key] = self._failed_lookups.get(key, 0) + 1
        count = self._failed_lookups[key]
        if count >= 20:
            self._locked_codes.add(key)
        return count

    async def is_code_locked(self, code: str) -> bool:
        return normalize_code(code) in self._locked_codes

    async def clear_failed_lookups(self, code: str) -> None:
        key = normalize_code(code)
        self._failed_lookups.pop(key, None)
