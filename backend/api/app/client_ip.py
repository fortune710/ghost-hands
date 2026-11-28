from __future__ import annotations

from fastapi import Request, WebSocket


def client_ip_from_request(request: Request) -> str:
    """Trusted client IP behind our shared nginx ingress.

    Prefer `X-Real-IP` (set by nginx to `$remote_addr`, not client-controlled).
    Fall back to the immediate transport peer. Do not trust the first
    `X-Forwarded-For` hop — clients can spoof it.
    """
    real_ip = (request.headers.get("x-real-ip") or "").strip()
    if real_ip:
        return real_ip
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def client_ip_from_websocket(websocket: WebSocket) -> str:
    real_ip = (websocket.headers.get("x-real-ip") or "").strip()
    if real_ip:
        return real_ip
    if websocket.client and websocket.client.host:
        return websocket.client.host
    return "unknown"
