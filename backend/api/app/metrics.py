from __future__ import annotations

import time
from collections import defaultdict
from dataclasses import dataclass, field


@dataclass
class Metrics:
    """In-process Prometheus-style counters (no PII)."""

    sessions_created: int = 0
    sessions_ended: int = 0
    joins: int = 0
    approvals: int = 0
    denials: int = 0
    kicks: int = 0
    ws_connections: int = 0
    errors_by_code: dict[str, int] = field(default_factory=lambda: defaultdict(int))
    # Cumulative histogram state (not a rolling window).
    duration_count: int = 0
    duration_sum: float = 0.0
    duration_buckets: list[int] = field(default_factory=lambda: [0, 0, 0, 0, 0, 0])
    _bucket_bounds: tuple[int, ...] = (60, 300, 600, 1800, 3600, 7200)
    started_at: float = field(default_factory=time.monotonic)

    def inc_error(self, code: str) -> None:
        self.errors_by_code[code] += 1

    def observe_duration(self, seconds: float) -> None:
        self.duration_count += 1
        self.duration_sum += seconds
        for i, bound in enumerate(self._bucket_bounds):
            if seconds <= bound:
                self.duration_buckets[i] += 1
                break

    def render_prometheus(self, active_sessions: int, active_ws: int) -> str:
        lines = [
            "# HELP ghosthands_up 1 if process is up",
            "# TYPE ghosthands_up gauge",
            "ghosthands_up 1",
            "# HELP ghosthands_active_sessions Active (non-ended) sessions",
            "# TYPE ghosthands_active_sessions gauge",
            f"ghosthands_active_sessions {active_sessions}",
            "# HELP ghosthands_ws_connections Open signaling WebSocket connections",
            "# TYPE ghosthands_ws_connections gauge",
            f"ghosthands_ws_connections {active_ws}",
            "# HELP ghosthands_sessions_created_total Sessions created",
            "# TYPE ghosthands_sessions_created_total counter",
            f"ghosthands_sessions_created_total {self.sessions_created}",
            "# HELP ghosthands_sessions_ended_total Sessions ended",
            "# TYPE ghosthands_sessions_ended_total counter",
            f"ghosthands_sessions_ended_total {self.sessions_ended}",
            "# HELP ghosthands_joins_total Pointer join attempts accepted into a room",
            "# TYPE ghosthands_joins_total counter",
            f"ghosthands_joins_total {self.joins}",
            "# HELP ghosthands_approvals_total Pointer approvals",
            "# TYPE ghosthands_approvals_total counter",
            f"ghosthands_approvals_total {self.approvals}",
            "# HELP ghosthands_denials_total Pointer denials",
            "# TYPE ghosthands_denials_total counter",
            f"ghosthands_denials_total {self.denials}",
            "# HELP ghosthands_kicks_total Pointer kicks",
            "# TYPE ghosthands_kicks_total counter",
            f"ghosthands_kicks_total {self.kicks}",
            "# HELP ghosthands_errors_total Errors by code",
            "# TYPE ghosthands_errors_total counter",
        ]
        for code, count in sorted(self.errors_by_code.items()):
            safe = code.replace('"', "")
            lines.append(f'ghosthands_errors_total{{code="{safe}"}} {count}')

        lines.append("# HELP ghosthands_session_duration_seconds Session duration")
        lines.append("# TYPE ghosthands_session_duration_seconds histogram")
        cumulative = 0
        for bound, count in zip(self._bucket_bounds, self.duration_buckets, strict=True):
            cumulative += count
            lines.append(f'ghosthands_session_duration_seconds_bucket{{le="{bound}"}} {cumulative}')
        # +Inf includes observations above the last bound
        above = self.duration_count - cumulative
        lines.append(
            f'ghosthands_session_duration_seconds_bucket{{le="+Inf"}} {cumulative + max(0, above)}'
        )
        lines.append(f"ghosthands_session_duration_seconds_count {self.duration_count}")
        lines.append(f"ghosthands_session_duration_seconds_sum {self.duration_sum:.3f}")
        lines.append("")
        return "\n".join(lines)
