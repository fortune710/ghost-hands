from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Header, HTTPException, Request, Response, status
from pydantic import BaseModel, Field

from app.domain.session import SessionStatus, create_session, normalize_code
from app.security import secrets_equal
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
    auto_admit: bool | None = None


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


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


@router.post("/sessions", status_code=status.HTTP_201_CREATED, response_model=CreateSessionResponse)
async def create_session_route(
    body: CreateSessionRequest,
    request: Request,
) -> CreateSessionResponse:
    settings = _settings(request)
    store = _store(request)
    metrics = request.app.state.metrics
    limiters = request.app.state.limiters
    lifecycle = request.app.state.lifecycle

    ip = _client_ip(request)
    if not limiters.create.allow(ip):
        metrics.inc_error("RATE_LIMITED")
        raise HTTPException(status_code=429, detail={"error": "RATE_LIMITED"})

    auto_admit = settings.auto_admit_default if body.auto_admit is None else body.auto_admit

    session = None
    for _ in range(16):
        candidate = create_session(
            host_name=body.host_name,
            max_pointers=settings.max_pointers,
            unused_ttl_s=settings.session_unused_ttl_s,
            max_ttl_s=settings.session_max_ttl_s,
            auto_admit=auto_admit,
            now=lifecycle.now(),
        )
        if await store.code_available(candidate.code):
            session = candidate
            break
    if session is None:
        raise HTTPException(status_code=500, detail={"error": "CODE_EXHAUSTED"})

    await store.put(session)
    metrics.sessions_created += 1
    ice, ttl = ice_servers_for(settings, user_id="host")
    return CreateSessionResponse(
        session_id=session.session_id,
        code=session.code,
        display_code=session.display_code,
        join_url=session.join_url(settings.join_base_url),
        host_token=session.host_token,
        expires_at=session.expires_at.isoformat().replace("+00:00", "Z"),
        max_pointers=session.max_pointers,
        ice_servers=ice,
        ice_ttl_s=ttl,
    )


@router.get("/sessions/{code}", response_model=SessionStatusResponse)
async def get_session(code: str, request: Request) -> SessionStatusResponse:
    store = _store(request)
    metrics = request.app.state.metrics
    lifecycle = request.app.state.lifecycle
    norm = normalize_code(code)

    if await store.is_code_locked(norm):
        metrics.inc_error("RATE_LIMITED")
        raise HTTPException(status_code=429, detail={"error": "RATE_LIMITED"})

    session = await store.get(norm)
    if session is None or session.status == SessionStatus.ENDED:
        await store.record_failed_lookup(norm)
        metrics.inc_error("ROOM_NOT_FOUND")
        raise HTTPException(status_code=404, detail={"error": "ROOM_NOT_FOUND"})

    if session.is_expired(lifecycle.now()):
        metrics.inc_error("ROOM_EXPIRED")
        raise HTTPException(status_code=404, detail={"error": "ROOM_EXPIRED"})

    await store.clear_failed_lookups(norm)
    return SessionStatusResponse(status=session.status.value, host_name=session.host_name)


@router.delete("/sessions/{code}", status_code=status.HTTP_204_NO_CONTENT)
async def end_session(
    code: str,
    request: Request,
    authorization: str | None = Header(default=None),
) -> Response:
    store = _store(request)
    metrics = request.app.state.metrics
    lifecycle = request.app.state.lifecycle
    session = await store.get(normalize_code(code))
    if session is None:
        raise HTTPException(status_code=404, detail={"error": "ROOM_NOT_FOUND"})
    token = (authorization or "").removeprefix("Bearer ").strip()
    if not token or not secrets_equal(token, session.host_token):
        metrics.inc_error("UNAUTHORIZED")
        raise HTTPException(status_code=401, detail={"error": "UNAUTHORIZED"})

    duration = (lifecycle.now() - session.created_at).total_seconds()
    session.status = SessionStatus.ENDED
    await store.put(session)
    await store.delete(session.code)
    metrics.sessions_ended += 1
    metrics.observe_duration(duration)

    # Best-effort notify open sockets
    from app.ws.signaling import broadcast_session_ended

    await broadcast_session_ended(request.app, normalize_code(code), "host_ended")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/ice-servers")
async def get_ice_servers(
    request: Request,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    store = _store(request)
    metrics = request.app.state.metrics
    token = (authorization or "").removeprefix("Bearer ").strip()
    if not token:
        metrics.inc_error("UNAUTHORIZED")
        raise HTTPException(status_code=401, detail={"error": "UNAUTHORIZED"})

    session = await store.find_by_token(token)
    if session is None:
        metrics.inc_error("UNAUTHORIZED")
        raise HTTPException(status_code=401, detail={"error": "UNAUTHORIZED"})

    # Pointer tokens must be for an approved peer
    if not secrets_equal(token, session.host_token):
        approved = False
        for peer in session.pointers.values():
            if peer.pointer_token and secrets_equal(token, peer.pointer_token) and peer.approved:
                approved = True
                break
        if not approved:
            metrics.inc_error("UNAUTHORIZED")
            raise HTTPException(status_code=401, detail={"error": "UNAUTHORIZED"})

    ice, ttl = ice_servers_for(_settings(request), user_id=session.session_id)
    return {"ice_servers": ice, "ice_ttl_s": ttl}
