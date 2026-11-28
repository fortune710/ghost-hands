from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from fastapi import WebSocket


@dataclass
class RoomSockets:
    host: WebSocket | None = None
    peers: dict[str, WebSocket] = field(default_factory=dict)
    # peer_id → queued outbound SDP/ICE for host (flushed when host authenticates)
    pending_to_host: dict[str, list[dict[str, Any]]] = field(default_factory=dict)


class ConnectionRegistry:
    """Maps session codes to live host/pointer WebSockets for SDP/ICE relay."""

    def __init__(self) -> None:
        self._rooms: dict[str, RoomSockets] = {}
        self._ws_count = 0

    @property
    def ws_count(self) -> int:
        return self._ws_count

    def room(self, code: str) -> RoomSockets:
        if code not in self._rooms:
            self._rooms[code] = RoomSockets()
        return self._rooms[code]

    def set_host(self, code: str, ws: WebSocket) -> WebSocket | None:
        """Register host socket. Returns previous host if replaced."""
        room = self.room(code)
        previous = room.host
        if previous is None:
            self._ws_count += 1
        elif previous is not ws:
            # Replacement — count stays the same (old socket still open until closed)
            pass
        room.host = ws
        return previous if previous is not ws else None

    def is_current_host(self, code: str, ws: WebSocket) -> bool:
        return self.get_host(code) is ws

    def clear_host(self, code: str, ws: WebSocket) -> bool:
        """Clear host only if `ws` is current. Returns True if cleared."""
        room = self._rooms.get(code)
        if room is None:
            return False
        if room.host is not ws:
            return False
        room.host = None
        self._ws_count = max(0, self._ws_count - 1)
        self._maybe_drop(code)
        return True

    def set_peer(self, code: str, peer_id: str, ws: WebSocket) -> None:
        room = self.room(code)
        if peer_id not in room.peers:
            self._ws_count += 1
        room.peers[peer_id] = ws

    def clear_peer(self, code: str, peer_id: str, ws: WebSocket | None = None) -> None:
        room = self._rooms.get(code)
        if room is None:
            return
        existing = room.peers.get(peer_id)
        if existing is None:
            return
        if ws is not None and existing is not ws:
            return
        del room.peers[peer_id]
        room.pending_to_host.pop(peer_id, None)
        self._ws_count = max(0, self._ws_count - 1)
        self._maybe_drop(code)

    def get_host(self, code: str) -> WebSocket | None:
        room = self._rooms.get(code)
        return room.host if room else None

    def get_peer(self, code: str, peer_id: str) -> WebSocket | None:
        room = self._rooms.get(code)
        if room is None:
            return None
        return room.peers.get(peer_id)

    def peer_ids(self, code: str) -> list[str]:
        room = self._rooms.get(code)
        return list(room.peers.keys()) if room else []

    def queue_to_host(self, code: str, peer_id: str, payload: dict[str, Any]) -> None:
        room = self.room(code)
        room.pending_to_host.setdefault(peer_id, []).append(payload)
        # Keep only the latest offer + subsequent ICE (cap 32)
        if len(room.pending_to_host[peer_id]) > 32:
            room.pending_to_host[peer_id] = room.pending_to_host[peer_id][-32:]

    def take_pending_to_host(self, code: str) -> list[dict[str, Any]]:
        room = self._rooms.get(code)
        if room is None:
            return []
        out: list[dict[str, Any]] = []
        for peer_id, msgs in list(room.pending_to_host.items()):
            out.extend(msgs)
            room.pending_to_host[peer_id] = []
        return out

    def _maybe_drop(self, code: str) -> None:
        room = self._rooms.get(code)
        if room and room.host is None and not room.peers and not room.pending_to_host:
            del self._rooms[code]
