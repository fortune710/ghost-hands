import base64
import hashlib
import hmac
import time

from app.settings import Settings
from app.turn import ice_servers_for, mint_turn_credential


def test_mint_turn_hmac() -> None:
    now = 1_700_000_000
    username, credential, ttl = mint_turn_credential("s3cret", user_id="p_abc", ttl_s=3600, now=now)
    assert username == f"{now + 3600}:p_abc"
    expected = base64.b64encode(
        hmac.new(b"s3cret", username.encode(), hashlib.sha1).digest()
    ).decode()
    assert credential == expected
    assert ttl == 3600


def test_ice_servers_stun_fallback_without_secret() -> None:
    settings = Settings(stun_urls="stun:stun.example:3478", turn_urls="", turn_secret="")
    ice, ttl = ice_servers_for(settings)
    assert ttl == 3600
    assert ice == [{"urls": ["stun:stun.example:3478"]}]


def test_ice_servers_include_turn_when_configured() -> None:
    settings = Settings(
        stun_urls="stun:stun.example:3478",
        turn_urls="turn:t:3478?transport=udp,turn:t:3478?transport=tcp,turns:t:443",
        turn_secret="abc",
    )
    ice, ttl = ice_servers_for(settings, user_id="host", now=int(time.time()))
    assert ttl == 3600
    assert len(ice) == 2
    assert "username" in ice[1]
    assert "credential" in ice[1]
    assert len(ice[1]["urls"]) == 3
