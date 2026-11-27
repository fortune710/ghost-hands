from __future__ import annotations

import time
from collections import defaultdict, deque


class SlidingWindowRateLimiter:
    """Simple in-memory rate limiter (10-min TTL counters per PRD S-6)."""

    def __init__(self, limit: int, window_s: float = 60.0, ttl_s: float = 600.0) -> None:
        self.limit = limit
        self.window_s = window_s
        self.ttl_s = ttl_s
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._last_seen: dict[str, float] = {}

    def allow(self, key: str, now: float | None = None) -> bool:
        t = now if now is not None else time.monotonic()
        self._purge(t)
        q = self._hits[key]
        while q and t - q[0] > self.window_s:
            q.popleft()
        if len(q) >= self.limit:
            return False
        q.append(t)
        self._last_seen[key] = t
        return True

    def _purge(self, now: float) -> None:
        stale = [k for k, seen in self._last_seen.items() if now - seen > self.ttl_s]
        for k in stale:
            self._hits.pop(k, None)
            self._last_seen.pop(k, None)
