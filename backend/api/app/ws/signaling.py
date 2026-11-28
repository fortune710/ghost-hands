from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.client_ip import client_ip_from_websocket
from app.domain.session import (
    COLOR_RE,
    PointerPeer,
    SessionStatus,
    new_peer_id,
    new_token,
    normalize_code,
    sanitize_name,
)
from app.security import secrets_equal
from app.turn import ice_servers_for

logger = logging.getLogger("ghosthands.signaling")
router = APIRouter(tags=["signaling"])

PING_INTERVAL_S = 20.0
MAX_MSG_BYTES = 64 * 1024


async def _send(ws: WebSocket, payload: dict[str, Any]) -> None:
    try:
        await ws.send_json(payload)
    except Exception:
        logger.debug("send failed", exc_info=True)


async def broadcast_session_ended(app: Any, code: str, reason: str) -> None:
    registry = app.state.registry
    host = registry.get_host(code)
    if host is not None:
        await _send(host, {"t": "session_ended", "reason": reason})
    for peer_id in registry.peer_ids(code):
        peer_ws = registry.get_peer(code, peer_id)
        if peer_ws is not None:
            await _send(peer_ws, {"t": "session_ended", "reason": reason})


@router.websocket("/ws/v1/sessions/{code}")
async def session_ws(websocket: WebSocket, code: str) -> None:
    await websocket.accept()
    app = websocket.app
    store = app.state.store
    settings = app.state.settings
    registry = app.state.registry
    metrics = app.state.metrics
    limiters = app.state.limiters
    lifecycle = app.state.lifecycle
    norm = normalize_code(code)

    client_ip = client_ip_from_websocket(websocket)

    session = await store.get(norm)
    if session is None or session.status == SessionStatus.ENDED:
        metrics.inc_error("ROOM_NOT_FOUND")
        await _send(websocket, {"t": "error", "code": "ROOM_NOT_FOUND", "msg": "Session not found"})
        await websocket.close(code=4404)
        return

    if session.is_expired(lifecycle.now()):
        metrics.inc_error("ROOM_EXPIRED")
        await _send(websocket, {"t": "error", "code": "ROOM_EXPIRED", "msg": "Session expired"})
        await websocket.close(code=4408)
        return

    role: str | None = None
    peer_id: str | None = None

    try:
        raw = await asyncio.wait_for(websocket.receive_text(), timeout=5.0)
        msg = json.loads(raw)
    except TimeoutError:
        await websocket.close(code=4401)
        return
    except (json.JSONDecodeError, WebSocketDisconnect):
        await websocket.close(code=4401)
        return

    t = msg.get("t")
    if t == "auth":
        if msg.get("proto") != 1 or not secrets_equal(
            str(msg.get("host_token", "")), session.host_token
        ):
            metrics.inc_error("UNAUTHORIZED")
            await _send(websocket, {"t": "error", "code": "UNAUTHORIZED", "msg": "Bad host token"})
            await websocket.close(code=4401)
            return
        role = "host"
        session.host_connected = True
        await store.put(session)
        previous = registry.set_host(norm, websocket)
        if previous is not None:
            try:
                await previous.close(code=4000)
            except Exception:
                pass
        lifecycle.clear_host_grace(norm)
        metrics.ws_connections = registry.ws_count
        await _send(
            websocket,
            {
                "t": "ready",
                "session_id": session.session_id,
                "expires_at": session.expires_at.isoformat().replace("+00:00", "Z"),
            },
        )
        # Flush SDP/ICE that arrived while the host was offline.
        for pending in registry.take_pending_to_host(norm):
            await _send(websocket, pending)
        # Tell approved pointers the host is ready so they can resend if needed.
        for pid in registry.peer_ids(norm):
            peer_ws = registry.get_peer(norm, pid)
            if peer_ws is not None:
                await _send(peer_ws, {"t": "host_ready"})
    elif t == "join":
        if not limiters.join.allow(f"{client_ip}:{norm}"):
            metrics.inc_error("RATE_LIMITED")
            await _send(websocket, {"t": "error", "code": "RATE_LIMITED", "msg": "Too many joins"})
            await websocket.close(code=4429)
            return
        if msg.get("proto") != 1:
            metrics.inc_error("PROTO_MISMATCH")
            await _send(
                websocket,
                {"t": "error", "code": "PROTO_MISMATCH", "msg": "proto must be 1"},
            )
            await websocket.close(code=4400)
            return

        name = sanitize_name(str(msg.get("name", "")))
        color = str(msg.get("color", "#4FC3F7"))
        if not name or not re.match(COLOR_RE, color):
            metrics.inc_error("BAD_MESSAGE")
            await _send(
                websocket,
                {"t": "error", "code": "BAD_MESSAGE", "msg": "Invalid name/color"},
            )
            await websocket.close(code=4400)
            return

        # Refresh session from store (may have changed).
        session = await store.get(norm)
        if session is None or session.status == SessionStatus.ENDED:
            metrics.inc_error("ROOM_NOT_FOUND")
            await _send(websocket, {"t": "error", "code": "ROOM_NOT_FOUND"})
            await websocket.close(code=4404)
            return
        if session.is_expired(lifecycle.now()):
            metrics.inc_error("ROOM_EXPIRED")
            await _send(websocket, {"t": "error", "code": "ROOM_EXPIRED"})
            await websocket.close(code=4408)
            return
        if session.is_full():
            metrics.inc_error("ROOM_FULL")
            await _send(
                websocket,
                {"t": "error", "code": "ROOM_FULL", "msg": "This session already has a pointer."},
            )
            await websocket.close(code=4403)
            return

        peer_id = new_peer_id()
        role = "pointer"
        approved_count = session.approved_count()
        auto = bool(session.auto_admit and approved_count == 0)
        peer = PointerPeer(
            peer_id=peer_id,
            name=name,
            color=color,
            approved=auto,
            pointer_token=new_token() if auto else None,
        )
        session.pointers[peer_id] = peer
        if auto:
            session.mark_live()
            metrics.approvals += 1
        metrics.joins += 1
        await store.put(session)
        registry.set_peer(norm, peer_id, websocket)
        metrics.ws_connections = registry.ws_count

        host_ws = registry.get_host(norm)
        if host_ws is not None:
            await _send(
                host_ws,
                {
                    "t": "join_request",
                    "peer": peer_id,
                    "name": name,
                    "color": color,
                },
            )

        if auto and peer.pointer_token:
            ice, ttl = ice_servers_for(settings, user_id=peer_id)
            await _send(
                websocket,
                {
                    "t": "approved",
                    "peer": peer_id,
                    "pointer_token": peer.pointer_token,
                    "ice_servers": ice,
                    "ice_ttl_s": ttl,
                },
            )
        else:
            await _send(websocket, {"t": "pending"})
    else:
        metrics.inc_error("BAD_MESSAGE")
        await _send(
            websocket,
            {"t": "error", "code": "BAD_MESSAGE", "msg": "auth or join required"},
        )
        await websocket.close(code=4400)
        return

    ping_task = asyncio.create_task(_ping_loop(websocket))

    try:
        while True:
            raw = await websocket.receive_text()
            if len(raw.encode("utf-8")) > MAX_MSG_BYTES:
                metrics.inc_error("BAD_MESSAGE")
                await _send(websocket, {"t": "error", "code": "BAD_MESSAGE", "msg": "too large"})
                continue
            socket_key = f"{norm}:{role}:{peer_id or 'host'}"
            if not limiters.ws_msg.allow(socket_key):
                metrics.inc_error("RATE_LIMITED")
                await _send(websocket, {"t": "error", "code": "RATE_LIMITED", "msg": "msg rate"})
                continue
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                metrics.inc_error("BAD_MESSAGE")
                await _send(websocket, {"t": "error", "code": "BAD_MESSAGE"})
                continue

            mt = msg.get("t")
            if mt == "pong":
                continue
            if mt == "ping":
                await _send(websocket, {"t": "pong"})
                continue

            session = await store.get(norm)
            if session is None or session.status == SessionStatus.ENDED:
                await _send(websocket, {"t": "session_ended", "reason": "expired"})
                break

            if role == "host":
                if not registry.is_current_host(norm, websocket):
                    await _send(
                        websocket,
                        {"t": "error", "code": "UNAUTHORIZED", "msg": "host replaced"},
                    )
                    break
                handled = await _handle_host(
                    msg,
                    websocket=websocket,
                    session_code=norm,
                    store=store,
                    registry=registry,
                    settings=settings,
                    metrics=metrics,
                    lifecycle=lifecycle,
                )
                if handled == "end":
                    break
                continue

            if role == "pointer" and peer_id:
                handled = await _handle_pointer(
                    msg,
                    websocket=websocket,
                    session_code=norm,
                    peer_id=peer_id,
                    store=store,
                    registry=registry,
                    metrics=metrics,
                )
                if handled == "leave":
                    break
    except WebSocketDisconnect:
        pass
    finally:
        ping_task.cancel()
        try:
            await ping_task
        except asyncio.CancelledError:
            pass
        await _cleanup(
            role=role,
            peer_id=peer_id,
            code=norm,
            websocket=websocket,
            store=store,
            registry=registry,
            metrics=metrics,
            lifecycle=lifecycle,
        )


async def _ping_loop(websocket: WebSocket) -> None:
    try:
        while True:
            await asyncio.sleep(PING_INTERVAL_S)
            await _send(websocket, {"t": "ping"})
    except asyncio.CancelledError:
        raise
    except Exception:
        return


async def _handle_host(
    msg: dict[str, Any],
    *,
    websocket: WebSocket,
    session_code: str,
    store: Any,
    registry: Any,
    settings: Any,
    metrics: Any,
    lifecycle: Any,
) -> str | None:
    mt = msg.get("t")
    session = await store.get(session_code)
    if session is None:
        return "end"

    if mt == "end":
        duration = (lifecycle.now() - session.created_at).total_seconds()
        session.status = SessionStatus.ENDED
        await store.put(session)
        await store.delete(session_code)
        metrics.sessions_ended += 1
        metrics.observe_duration(duration)
        await broadcast_session_ended(websocket.app, session_code, "host_ended")
        return "end"

    if mt == "approve":
        peer = str(msg.get("peer", ""))
        pointer = session.pointers.get(peer)
        if pointer is None:
            await _send(websocket, {"t": "error", "code": "BAD_MESSAGE", "msg": "unknown peer"})
            return None
        if session.approved_count() >= session.max_pointers and not pointer.approved:
            await _send(websocket, {"t": "error", "code": "ROOM_FULL"})
            return None
        pointer.approved = True
        pointer.pointer_token = pointer.pointer_token or new_token()
        session.mark_live()
        await store.put(session)
        metrics.approvals += 1
        ice, ttl = ice_servers_for(settings, user_id=peer)
        peer_ws = registry.get_peer(session_code, peer)
        if peer_ws is not None:
            await _send(
                peer_ws,
                {
                    "t": "approved",
                    "peer": peer,
                    "pointer_token": pointer.pointer_token,
                    "ice_servers": ice,
                    "ice_ttl_s": ttl,
                },
            )
        return None

    if mt == "deny":
        peer = str(msg.get("peer", ""))
        pointer = session.pointers.pop(peer, None)
        await store.put(session)
        metrics.denials += 1
        peer_ws = registry.get_peer(session_code, peer)
        if peer_ws is not None:
            await _send(peer_ws, {"t": "denied"})
            registry.clear_peer(session_code, peer)
            try:
                await peer_ws.close(code=4403)
            except Exception:
                pass
        if pointer is None:
            await _send(websocket, {"t": "error", "code": "BAD_MESSAGE", "msg": "unknown peer"})
        return None

    if mt == "kick":
        peer = str(msg.get("peer", ""))
        session.pointers.pop(peer, None)
        if session.approved_count() == 0:
            session.status = SessionStatus.WAITING
        await store.put(session)
        metrics.kicks += 1
        peer_ws = registry.get_peer(session_code, peer)
        if peer_ws is not None:
            await _send(peer_ws, {"t": "kicked"})
            registry.clear_peer(session_code, peer)
            try:
                await peer_ws.close(code=4403)
            except Exception:
                pass
        return None

    if mt in {"sdp", "ice"}:
        to = str(msg.get("to", ""))
        peer_ws = registry.get_peer(session_code, to)
        pointer = session.pointers.get(to)
        if peer_ws is None or pointer is None or not pointer.approved:
            await _send(
                websocket,
                {"t": "error", "code": "UNAUTHORIZED", "msg": "peer not approved for relay"},
            )
            return None
        outbound = dict(msg)
        outbound["from"] = "host"
        outbound.pop("to", None)
        await _send(peer_ws, outbound)
        return None

    metrics.inc_error("BAD_MESSAGE")
    await _send(websocket, {"t": "error", "code": "BAD_MESSAGE"})
    return None


async def _handle_pointer(
    msg: dict[str, Any],
    *,
    websocket: WebSocket,
    session_code: str,
    peer_id: str,
    store: Any,
    registry: Any,
    metrics: Any,
) -> str | None:
    mt = msg.get("t")
    session = await store.get(session_code)
    if session is None:
        return "leave"

    if mt == "leave":
        session.pointers.pop(peer_id, None)
        if session.approved_count() == 0 and session.status == SessionStatus.LIVE:
            session.status = SessionStatus.WAITING
        await store.put(session)
        host_ws = registry.get_host(session_code)
        if host_ws is not None:
            await _send(host_ws, {"t": "peer_left", "peer": peer_id, "reason": "leave"})
        return "leave"

    if mt in {"sdp", "ice"}:
        pointer = session.pointers.get(peer_id)
        if pointer is None or not pointer.approved:
            await _send(
                websocket,
                {"t": "error", "code": "UNAUTHORIZED", "msg": "not approved"},
            )
            return None
        outbound = dict(msg)
        outbound["from"] = peer_id
        outbound.pop("to", None)
        host_ws = registry.get_host(session_code)
        if host_ws is None:
            # Buffer until the host authenticates; pointer may also resend on host_ready.
            registry.queue_to_host(session_code, peer_id, outbound)
            await _send(
                websocket,
                {
                    "t": "error",
                    "code": "BAD_MESSAGE",
                    "msg": "host offline; offer queued — will deliver when host connects",
                },
            )
            return None
        await _send(host_ws, outbound)
        return None

    metrics.inc_error("BAD_MESSAGE")
    await _send(websocket, {"t": "error", "code": "BAD_MESSAGE"})
    return None


async def _cleanup(
    *,
    role: str | None,
    peer_id: str | None,
    code: str,
    websocket: WebSocket,
    store: Any,
    registry: Any,
    metrics: Any,
    lifecycle: Any,
) -> None:
    if role == "host":
        was_current = registry.clear_host(code, websocket)
        if was_current:
            session = await store.get(code)
            if session is not None and session.status != SessionStatus.ENDED:
                # Re-check: a replacement may have registered during the await.
                if registry.get_host(code) is None:
                    session.host_connected = False
                    await store.put(session)
                    lifecycle.note_host_disconnect(code)
                    for pid in registry.peer_ids(code):
                        peer_ws = registry.get_peer(code, pid)
                        if peer_ws is not None:
                            await _send(peer_ws, {"t": "host_reconnecting"})
        metrics.ws_connections = registry.ws_count
        return

    if role == "pointer" and peer_id:
        registry.clear_peer(code, peer_id, websocket)
        session = await store.get(code)
        if session is not None and peer_id in session.pointers:
            session.pointers.pop(peer_id, None)
            if session.approved_count() == 0 and session.status == SessionStatus.LIVE:
                session.status = SessionStatus.WAITING
            await store.put(session)
            host_ws = registry.get_host(code)
            if host_ws is not None:
                await _send(host_ws, {"t": "peer_left", "peer": peer_id, "reason": "timeout"})
        metrics.ws_connections = registry.ws_count
