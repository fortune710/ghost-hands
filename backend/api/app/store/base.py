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

    @abstractmethod
    async def code_available(self, code: str) -> bool: ...

    @abstractmethod
    async def find_by_token(self, token: str) -> Session | None: ...

    @abstractmethod
    async def record_failed_lookup(self, code: str) -> int: ...

    @abstractmethod
    async def is_code_locked(self, code: str) -> bool: ...

    @abstractmethod
    async def clear_failed_lookups(self, code: str) -> None: ...
