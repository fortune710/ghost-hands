import pytest

from app.clock import FakeClock


def test_create_and_get_session(client) -> None:
    res = client.post(
        "/api/v1/sessions",
        json={"host_name": "Fortune", "client": {"app_version": "0.1.0", "os": "macos"}},
    )
    assert res.status_code == 201
    body = res.json()
    assert len(body["code"]) == 6
    assert body["display_code"][3] == "-"
    assert "ghosthands" in body["join_url"]
    assert body["max_pointers"] == 1
    assert body["ice_servers"]
    assert body["ice_ttl_s"] == 3600
    turn = next((s for s in body["ice_servers"] if "username" in s), None)
    assert turn is not None
    assert ":" in turn["username"]

    got = client.get(f"/api/v1/sessions/{body['code']}")
    assert got.status_code == 200
    assert got.json()["status"] == "waiting"
    assert got.json()["host_name"] == "Fortune"


def test_unknown_session_404(client) -> None:
    res = client.get("/api/v1/sessions/ZZZZZZ")
    assert res.status_code == 404
    assert res.json()["detail"]["error"] == "ROOM_NOT_FOUND"


def test_end_session_requires_host_token(client) -> None:
    created = client.post("/api/v1/sessions", json={}).json()
    bad = client.delete(
        f"/api/v1/sessions/{created['code']}",
        headers={"Authorization": "Bearer nope"},
    )
    assert bad.status_code == 401

    ok = client.delete(
        f"/api/v1/sessions/{created['code']}",
        headers={"Authorization": f"Bearer {created['host_token']}"},
    )
    assert ok.status_code == 204
    assert client.get(f"/api/v1/sessions/{created['code']}").status_code == 404


def test_ice_servers_requires_valid_token(client) -> None:
    created = client.post("/api/v1/sessions", json={}).json()
    denied = client.get("/api/v1/ice-servers")
    assert denied.status_code == 401

    ok = client.get(
        "/api/v1/ice-servers",
        headers={"Authorization": f"Bearer {created['host_token']}"},
    )
    assert ok.status_code == 200
    assert "ice_servers" in ok.json()


def test_create_rate_limit(client) -> None:
    for _ in range(10):
        assert client.post("/api/v1/sessions", json={}).status_code == 201
    limited = client.post("/api/v1/sessions", json={})
    assert limited.status_code == 429
    assert limited.json()["detail"]["error"] == "RATE_LIMITED"


def test_code_lock_after_failed_lookups(client) -> None:
    for _ in range(20):
        client.get("/api/v1/sessions/NOTRE1")
    locked = client.get("/api/v1/sessions/NOTRE1")
    assert locked.status_code == 429


@pytest.mark.asyncio
async def test_unused_ttl_expiry(client, app, clock: FakeClock) -> None:
    created = client.post("/api/v1/sessions", json={}).json()
    code = created["code"]
    assert client.get(f"/api/v1/sessions/{code}").status_code == 200
    clock.advance(601)
    ended = await app.state.lifecycle.expire_due()
    assert any(c == code and reason == "expired" for c, reason in ended)
    assert client.get(f"/api/v1/sessions/{code}").status_code == 404
