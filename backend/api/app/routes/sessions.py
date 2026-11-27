from __future__ import annotations

from datetime import UTC
from typing import Any

from fastapi import APIRouter, Header, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.domain.session import SessionStatus, create_session, normalize_code
from app.settings import Settings
from app.store.base import SessionStore
from app.turn import ice_servers_for

router = APIRouter(prefix="/api/v1", tags=["sessions"])


class ClientInfo(BaseModel):
    app_version: str = Field(max_length=32)
    os: str


class CreateSessionRequest(BaseModel):
    host_name: str | None = Field(default=None, max_length=24)
    client: ClientInfo | None = None


class CreateSessionResponse(BaseModel):
    session_id: str
    code: str
    display_code: str
    join_url: str
    host_token: str
    expires_at: str
    max_pointers: int
    ice_servers: list[dict[str, Any]]
    ice_ttl_s: int


class SessionStatusResponse(BaseModel):
    status: str
    host_name: str | None = None


def _store(request: Request) -> SessionStore:
    store: SessionStore = request.app.state.store
    return store


def _settings(request: Request) -> Settings:
    settings: Settings = request.app.state.settings
    return settings


@router.post("/sessions", status_code=status.HTTP_201_CREATED, response_model=CreateSessionResponse)
async def create_session_route(
    body: CreateSessionRequest,
    request: Request,
) -> CreateSessionResponse:
    settings = _settings(request)
    store = _store(request)

    # Ensure unique active code (retry a few times).
    session = None
    for _ in range(8):
        candidate = create_session(
            host_name=body.host_name,
            max_pointers=settings.max_pointers,
            unused_ttl_s=settings.session_unused_ttl_s,
            auto_admit=settings.auto_admit_default,
        )
        if await store.get(candidate.code) is None:
            session = candidate
            break
    if session is None:
        raise HTTPException(status_code=500, detail={"error": "CODE_EXHAUSTED"})

    await store.put(session)
    ice, ttl = ice_servers_for(settings)
    return CreateSessionResponse(
        session_id=session.session_id,
        code=session.code,
        display_code=session.display_code,
        join_url=session.join_url(settings.join_base_url),
        host_token=session.host_token,
        expires_at=session.expires_at.astimezone(UTC).isoformat().replace("+00:00", "Z"),
        max_pointers=session.max_pointers,
        ice_servers=ice,
        ice_ttl_s=ttl,
    )


@router.get("/sessions/{code}", response_model=SessionStatusResponse)
async def get_session(code: str, request: Request) -> SessionStatusResponse:
    session = await _store(request).get(normalize_code(code))
    if session is None or session.status == SessionStatus.ENDED:
        raise HTTPException(status_code=404, detail={"error": "ROOM_NOT_FOUND"})
    return SessionStatusResponse(status=session.status.value, host_name=session.host_name)


@router.delete("/sessions/{code}", status_code=status.HTTP_204_NO_CONTENT)
async def end_session(
    code: str,
    request: Request,
    authorization: str | None = Header(default=None),
) -> None:
    store = _store(request)
    session = await store.get(normalize_code(code))
    if session is None:
        raise HTTPException(status_code=404, detail={"error": "ROOM_NOT_FOUND"})
    token = (authorization or "").removeprefix("Bearer ").strip()
    if not token or not secrets_equal(token, session.host_token):
        raise HTTPException(status_code=401, detail={"error": "UNAUTHORIZED"})
    session.status = SessionStatus.ENDED
    await store.put(session)


@router.get("/ice-servers")
async def get_ice_servers(
    request: Request,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    if not authorization:
        raise HTTPException(status_code=401, detail={"error": "UNAUTHORIZED"})
    ice, ttl = ice_servers_for(_settings(request))
    return {"ice_servers": ice, "ice_ttl_s": ttl}


def secrets_equal(a: str, b: str) -> bool:
    # Constant-time compare for tokens (PRD S-7).
    if len(a) != len(b):
        return False
    result = 0
    for x, y in zip(a.encode(), b.encode(), strict=True):
        result |= x ^ y
    return result == 0
