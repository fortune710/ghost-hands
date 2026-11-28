from __future__ import annotations

from dataclasses import dataclass, field

from fastapi import WebSocket


@dataclass
class RoomSockets:
    host: WebSocket | None = None
    peers: dict[str, WebSocket] = field(default_factory=dict)


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

    def set_host(self, code: str, ws: WebSocket) -> None:
        room = self.room(code)
        if room.host is None:
            self._ws_count += 1
        room.host = ws

    def clear_host(self, code: str, ws: WebSocket) -> None:
        room = self._rooms.get(code)
        if room is None:
            return
        if room.host is ws:
            room.host = None
            self._ws_count = max(0, self._ws_count - 1)
        self._maybe_drop(code)

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

    def _maybe_drop(self, code: str) -> None:
        room = self._rooms.get(code)
        if room and room.host is None and not room.peers:
            del self._rooms[code]
