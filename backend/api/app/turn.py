from __future__ import annotations

from typing import Any

from app.settings import Settings


def ice_servers_for(settings: Settings) -> tuple[list[dict[str, Any]], int]:
    """Return (ice_servers, ttl_s). TURN HMAC minting lands in M2; STUN always available."""
    servers: list[dict[str, Any]] = [{"urls": settings.stun_url_list}]
    if settings.turn_url_list and settings.turn_secret:
        # Placeholder structure — real time-limited HMAC credentials in M2.
        servers.append(
            {
                "urls": settings.turn_url_list,
                "username": "pending-m2",
                "credential": "pending-m2",
            }
        )
    return servers, 3600
