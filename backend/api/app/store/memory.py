from __future__ import annotations

from app.domain.session import Session, SessionStatus, normalize_code
from app.store.base import SessionStore


class InMemorySessionStore(SessionStore):
    def __init__(self) -> None:
        self._sessions: dict[str, Session] = {}

    async def put(self, session: Session) -> None:
        self._sessions[normalize_code(session.code)] = session

    async def get(self, code: str) -> Session | None:
        return self._sessions.get(normalize_code(code))

    async def delete(self, code: str) -> None:
        self._sessions.pop(normalize_code(code), None)

    async def list_active(self) -> list[Session]:
        return [s for s in self._sessions.values() if s.status != SessionStatus.ENDED]
