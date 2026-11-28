from __future__ import annotations

import base64
import hashlib
import hmac
import time
from typing import Any

from app.settings import Settings

# Coturn / RFC 5389 long-term credential style used with static-auth-secret:
# username = "<expiry_unix>:<user_id>", credential = base64(HMAC-SHA1(secret, username))
ICE_TTL_S = 3600


def mint_turn_credential(
    secret: str,
    *,
    user_id: str = "gh",
    ttl_s: int = ICE_TTL_S,
    now: int | None = None,
) -> tuple[str, str, int]:
    """Return (username, credential, ttl_s) for time-limited TURN access."""
    expiry = (now if now is not None else int(time.time())) + ttl_s
    username = f"{expiry}:{user_id}"
    digest = hmac.new(secret.encode("utf-8"), username.encode("utf-8"), hashlib.sha1).digest()
    credential = base64.b64encode(digest).decode("ascii")
    return username, credential, ttl_s


def ice_servers_for(
    settings: Settings,
    *,
    user_id: str = "gh",
    now: int | None = None,
) -> tuple[list[dict[str, Any]], int]:
    """Return (ice_servers, ttl_s). STUN always; TURN when secret + URLs configured."""
    servers: list[dict[str, Any]] = []
    if settings.stun_url_list:
        servers.append({"urls": settings.stun_url_list})

    ttl = ICE_TTL_S
    if settings.turn_url_list and settings.turn_secret:
        username, credential, ttl = mint_turn_credential(
            settings.turn_secret,
            user_id=user_id,
            ttl_s=ICE_TTL_S,
            now=now,
        )
        servers.append(
            {
                "urls": settings.turn_url_list,
                "username": username,
                "credential": credential,
            }
        )
    return servers, ttl
