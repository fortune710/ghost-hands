from __future__ import annotations

from fastapi.testclient import TestClient


def _create(client: TestClient, *, auto_admit: bool | None = None) -> dict:
    body: dict = {}
    if auto_admit is not None:
        body["auto_admit"] = auto_admit
    res = client.post("/api/v1/sessions", json=body)
    assert res.status_code == 201
    return res.json()


def test_host_auth_ready(client: TestClient) -> None:
    session = _create(client)
    with client.websocket_connect(f"/ws/v1/sessions/{session['code']}") as ws:
        ws.send_json({"t": "auth", "host_token": session["host_token"], "proto": 1})
        msg = ws.receive_json()
        assert msg["t"] == "ready"
        assert msg["session_id"] == session["session_id"]


def test_auto_admit_approves_first_pointer(client: TestClient) -> None:
    session = _create(client, auto_admit=True)
    with client.websocket_connect(f"/ws/v1/sessions/{session['code']}") as host:
        host.send_json({"t": "auth", "host_token": session["host_token"], "proto": 1})
        assert host.receive_json()["t"] == "ready"

        with client.websocket_connect(f"/ws/v1/sessions/{session['code']}") as pointer:
            pointer.send_json(
                {"t": "join", "name": "Ada", "color": "#4FC3F7", "proto": 1},
            )
            join_req = host.receive_json()
            assert join_req["t"] == "join_request"
            assert join_req["name"] == "Ada"

            approved = pointer.receive_json()
            assert approved["t"] == "approved"
            assert approved["peer"].startswith("p_")
            assert "pointer_token" in approved
            assert approved["ice_servers"]


def test_manual_approve_deny(client: TestClient) -> None:
    session = _create(client, auto_admit=False)
    with client.websocket_connect(f"/ws/v1/sessions/{session['code']}") as host:
        host.send_json({"t": "auth", "host_token": session["host_token"], "proto": 1})
        assert host.receive_json()["t"] == "ready"

        with client.websocket_connect(f"/ws/v1/sessions/{session['code']}") as pointer:
            pointer.send_json(
                {"t": "join", "name": "Ada", "color": "#4FC3F7", "proto": 1},
            )
            join_req = host.receive_json()
            assert join_req["t"] == "join_request"
            assert pointer.receive_json()["t"] == "pending"

            host.send_json({"t": "approve", "peer": join_req["peer"]})
            approved = pointer.receive_json()
            assert approved["t"] == "approved"
            assert approved["peer"] == join_req["peer"]


def test_deny_flow(client: TestClient) -> None:
    session = _create(client, auto_admit=False)
    with client.websocket_connect(f"/ws/v1/sessions/{session['code']}") as host:
        host.send_json({"t": "auth", "host_token": session["host_token"], "proto": 1})
        assert host.receive_json()["t"] == "ready"

        with client.websocket_connect(f"/ws/v1/sessions/{session['code']}") as pointer:
            pointer.send_json(
                {"t": "join", "name": "Ada", "color": "#FF0000", "proto": 1},
            )
            join_req = host.receive_json()
            assert pointer.receive_json()["t"] == "pending"
            host.send_json({"t": "deny", "peer": join_req["peer"]})
            assert pointer.receive_json()["t"] == "denied"


def test_sdp_ice_relay_after_approval(client: TestClient) -> None:
    session = _create(client, auto_admit=True)
    with client.websocket_connect(f"/ws/v1/sessions/{session['code']}") as host:
        host.send_json({"t": "auth", "host_token": session["host_token"], "proto": 1})
        assert host.receive_json()["t"] == "ready"

        with client.websocket_connect(f"/ws/v1/sessions/{session['code']}") as pointer:
            pointer.send_json(
                {"t": "join", "name": "Ada", "color": "#4FC3F7", "proto": 1},
            )
            host.receive_json()  # join_request
            approved = pointer.receive_json()
            assert approved["t"] == "approved"
            peer = approved["peer"]

            pointer.send_json(
                {
                    "t": "sdp",
                    "to": "host",
                    "sdp": {"type": "offer", "sdp": "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n"},
                }
            )
            offer = host.receive_json()
            assert offer["t"] == "sdp"
            assert offer["from"] == peer
            assert offer["sdp"]["type"] == "offer"

            host.send_json(
                {
                    "t": "sdp",
                    "to": peer,
                    "sdp": {"type": "answer", "sdp": "v=0\r\no=- 2 1 IN IP4 127.0.0.1\r\n"},
                }
            )
            answer = pointer.receive_json()
            assert answer["t"] == "sdp"
            assert answer["from"] == "host"
            assert answer["sdp"]["type"] == "answer"

            pointer.send_json(
                {
                    "t": "ice",
                    "to": "host",
                    "candidate": {"candidate": "candidate:1 1 UDP 1 127.0.0.1 9 typ host"},
                }
            )
            ice = host.receive_json()
            assert ice["t"] == "ice"
            assert ice["from"] == peer


def test_room_full_second_pointer(client: TestClient) -> None:
    session = _create(client, auto_admit=True)
    with client.websocket_connect(f"/ws/v1/sessions/{session['code']}") as host:
        host.send_json({"t": "auth", "host_token": session["host_token"], "proto": 1})
        assert host.receive_json()["t"] == "ready"

        with client.websocket_connect(f"/ws/v1/sessions/{session['code']}") as p1:
            p1.send_json({"t": "join", "name": "Ada", "color": "#4FC3F7", "proto": 1})
            host.receive_json()  # join_request
            assert p1.receive_json()["t"] == "approved"

            with client.websocket_connect(f"/ws/v1/sessions/{session['code']}") as p2:
                p2.send_json({"t": "join", "name": "Bob", "color": "#FF0000", "proto": 1})
                err = p2.receive_json()
                assert err["t"] == "error"
                assert err["code"] == "ROOM_FULL"


def test_host_end_notifies_pointer(client: TestClient) -> None:
    session = _create(client, auto_admit=True)
    with client.websocket_connect(f"/ws/v1/sessions/{session['code']}") as host:
        host.send_json({"t": "auth", "host_token": session["host_token"], "proto": 1})
        assert host.receive_json()["t"] == "ready"

        with client.websocket_connect(f"/ws/v1/sessions/{session['code']}") as pointer:
            pointer.send_json({"t": "join", "name": "Ada", "color": "#4FC3F7", "proto": 1})
            host.receive_json()
            assert pointer.receive_json()["t"] == "approved"

            host.send_json({"t": "end"})
            ended = pointer.receive_json()
            assert ended["t"] == "session_ended"
            assert ended["reason"] == "host_ended"


def test_bad_message_unknown_type(client: TestClient) -> None:
    session = _create(client)
    with client.websocket_connect(f"/ws/v1/sessions/{session['code']}") as host:
        host.send_json({"t": "auth", "host_token": session["host_token"], "proto": 1})
        assert host.receive_json()["t"] == "ready"
        host.send_json({"t": "nope"})
        err = host.receive_json()
        assert err["t"] == "error"
        assert err["code"] == "BAD_MESSAGE"


def test_unauthorized_auth(client: TestClient) -> None:
    session = _create(client)
    with client.websocket_connect(f"/ws/v1/sessions/{session['code']}") as host:
        host.send_json({"t": "auth", "host_token": "wrong", "proto": 1})
        err = host.receive_json()
        assert err["t"] == "error"
        assert err["code"] == "UNAUTHORIZED"


def test_metrics_endpoint(client: TestClient) -> None:
    _create(client)
    res = client.get("/metrics")
    assert res.status_code == 200
    text = res.text
    assert "ghosthands_up 1" in text
    assert "ghosthands_sessions_created_total" in text
