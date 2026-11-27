from __future__ import annotations

from abc import ABC, abstractmethod

from app.domain.session import Session


class SessionStore(ABC):
    @abstractmethod
    async def put(self, session: Session) -> None: ...

    @abstractmethod
    async def get(self, code: str) -> Session | None: ...

    @abstractmethod
    async def delete(self, code: str) -> None: ...

    @abstractmethod
    async def list_active(self) -> list[Session]: ...
