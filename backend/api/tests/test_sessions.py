from fastapi.testclient import TestClient

from app.main import create_app


def test_create_and_get_session() -> None:
    client = TestClient(create_app())
    res = client.post(
        "/api/v1/sessions",
        json={"host_name": "Fortune", "client": {"app_version": "0.1.0", "os": "macos"}},
    )
    assert res.status_code == 201
    body = res.json()
    assert len(body["code"]) == 6
    assert body["display_code"][3] == "-"
    assert "ghosthands" in body["join_url"] or "localhost" in body["join_url"]
    assert body["max_pointers"] == 1
    assert body["ice_servers"]

    got = client.get(f"/api/v1/sessions/{body['code']}")
    assert got.status_code == 200
    assert got.json()["status"] == "waiting"


def test_unknown_session_404() -> None:
    client = TestClient(create_app())
    res = client.get("/api/v1/sessions/ZZZZZZ")
    assert res.status_code == 404
