from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.domain.session import (
    PointerPeer,
    SessionStatus,
    new_peer_id,
    new_token,
    normalize_code,
)
from app.routes.sessions import secrets_equal
from app.turn import ice_servers_for

router = APIRouter(tags=["signaling"])


@router.websocket("/ws/v1/sessions/{code}")
async def session_ws(websocket: WebSocket, code: str) -> None:
    await websocket.accept()
    app = websocket.app
    store = app.state.store
    settings = app.state.settings

    session = await store.get(normalize_code(code))
    if session is None or session.status == SessionStatus.ENDED:
        await websocket.send_json(
            {"t": "error", "code": "ROOM_NOT_FOUND", "msg": "Session not found"}
        )
        await websocket.close(code=4404)
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
            await websocket.send_json({"t": "error", "code": "UNAUTHORIZED"})
            await websocket.close(code=4401)
            return
        role = "host"
        session.host_connected = True
        await store.put(session)
        await websocket.send_json(
            {
                "t": "ready",
                "session_id": session.session_id,
                "expires_at": session.expires_at.isoformat().replace("+00:00", "Z"),
            }
        )
    elif t == "join":
        name = str(msg.get("name", ""))[:24]
        color = str(msg.get("color", "#4FC3F7"))
        if msg.get("proto") != 1:
            await websocket.send_json({"t": "error", "code": "PROTO_MISMATCH"})
            await websocket.close(code=4400)
            return
        approved_count = sum(1 for p in session.pointers.values() if p.approved)
        if approved_count >= session.max_pointers and not session.auto_admit:
            await websocket.send_json({"t": "error", "code": "ROOM_FULL"})
            await websocket.close(code=4403)
            return
        if len(session.pointers) >= session.max_pointers and not session.auto_admit:
            await websocket.send_json({"t": "error", "code": "ROOM_FULL"})
            await websocket.close(code=4403)
            return
        if len([p for p in session.pointers.values() if p.approved]) >= session.max_pointers:
            await websocket.send_json({"t": "error", "code": "ROOM_FULL"})
            await websocket.close(code=4403)
            return

        peer_id = new_peer_id()
        role = "pointer"
        auto = session.auto_admit and approved_count == 0
        peer = PointerPeer(
            peer_id=peer_id,
            name=name,
            color=color,
            approved=auto,
            pointer_token=new_token() if auto else None,
        )
        session.pointers[peer_id] = peer
        if auto:
            session.status = SessionStatus.LIVE
        await store.put(session)

        # Host notification is relayed once host WS registry exists (M2).
        if auto and peer.pointer_token:
            ice, ttl = ice_servers_for(settings)
            await websocket.send_json(
                {
                    "t": "approved",
                    "peer": peer_id,
                    "pointer_token": peer.pointer_token,
                    "ice_servers": ice,
                    "ice_ttl_s": ttl,
                }
            )
        else:
            await websocket.send_json({"t": "pending"})
    else:
        await websocket.send_json({"t": "error", "code": "BAD_MESSAGE"})
        await websocket.close(code=4400)
        return

    try:
        while True:
            raw = await websocket.receive_text()
            if len(raw) > 64 * 1024:
                await websocket.send_json({"t": "error", "code": "BAD_MESSAGE", "msg": "too large"})
                continue
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"t": "error", "code": "BAD_MESSAGE"})
                continue

            mt = msg.get("t")
            if mt == "pong":
                continue
            if mt == "ping":
                await websocket.send_json({"t": "pong"})
                continue
            if role == "host" and mt == "end":
                session.status = SessionStatus.ENDED
                await store.put(session)
                await websocket.send_json({"t": "session_ended", "reason": "host_ended"})
                break
            if role == "pointer" and mt == "leave":
                if peer_id and peer_id in session.pointers:
                    del session.pointers[peer_id]
                    await store.put(session)
                break
            # SDP/ICE relay + approve/deny land fully in M2 with connection registry.
            if mt in {"sdp", "ice", "approve", "deny", "kick"}:
                await websocket.send_json(
                    {
                        "t": "error",
                        "code": "BAD_MESSAGE",
                        "msg": "relay not wired until M2 registry",
                    }
                )
                continue
            await websocket.send_json({"t": "error", "code": "BAD_MESSAGE"})
    except WebSocketDisconnect:
        pass
    finally:
        if role == "host":
            session.host_connected = False
            await store.put(session)
