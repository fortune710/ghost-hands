from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from datetime import datetime

from app.clock import Clock, SystemClock
from app.domain.session import SessionStatus
from app.metrics import Metrics
from app.store.base import SessionStore

logger = logging.getLogger("ghosthands.lifecycle")

EndNotifier = Callable[[str, str], Awaitable[None]]


class SessionLifecycle:
    """Unused TTL / max TTL sweeper + host-disconnect grace (PRD B-4)."""

    def __init__(
        self,
        store: SessionStore,
        metrics: Metrics,
        clock: Clock | None = None,
        *,
        host_grace_s: float = 30.0,
        tick_s: float = 1.0,
    ) -> None:
        self.store = store
        self.metrics = metrics
        self.clock = clock or SystemClock()
        self.host_grace_s = host_grace_s
        self.tick_s = tick_s
        self._task: asyncio.Task[None] | None = None
        self._host_grace: dict[str, datetime] = {}
        self._on_end: EndNotifier | None = None
        self._stopped = False

    def set_end_notifier(self, fn: EndNotifier) -> None:
        self._on_end = fn

    def now(self) -> datetime:
        return self.clock.now()

    def note_host_disconnect(self, code: str) -> None:
        self._host_grace[code] = self.now()

    def clear_host_grace(self, code: str) -> None:
        self._host_grace.pop(code, None)

    def start(self) -> None:
        if self._task is None:
            self._stopped = False
            self._task = asyncio.create_task(self._run(), name="session-lifecycle")

    async def stop(self) -> None:
        self._stopped = True
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

    async def expire_due(self) -> list[tuple[str, str]]:
        """Expire sessions that are past TTL or host-grace. Returns [(code, reason)]."""
        now = self.now()
        ended: list[tuple[str, str]] = []
        for session in await self.store.list_active():
            reason: str | None = None
            if session.is_expired(now):
                reason = "expired"
            else:
                grace_start = self._host_grace.get(session.code)
                if grace_start is not None:
                    elapsed = (now - grace_start).total_seconds()
                    if elapsed >= self.host_grace_s:
                        reason = "host_timeout"

            if reason is None:
                continue

            duration = (now - session.created_at).total_seconds()
            session.status = SessionStatus.ENDED
            await self.store.put(session)
            await self.store.delete(session.code)
            self._host_grace.pop(session.code, None)
            self.metrics.sessions_ended += 1
            self.metrics.observe_duration(duration)
            ended.append((session.code, reason))
            if self._on_end is not None:
                await self._on_end(session.code, reason)
        return ended

    async def _run(self) -> None:
        while not self._stopped:
            try:
                await self.expire_due()
            except Exception:
                logger.exception("lifecycle tick failed")
            await asyncio.sleep(self.tick_s)
