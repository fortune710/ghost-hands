from fastapi.testclient import TestClient

from app.main import create_app


def test_healthz() -> None:
    client = TestClient(create_app())
    res = client.get("/healthz")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_readyz() -> None:
    client = TestClient(create_app())
    res = client.get("/readyz")
    assert res.status_code == 200
