from datetime import UTC, datetime, timedelta

from app.domain.session import (
    CODE_ALPHABET,
    create_session,
    format_display_code,
    generate_code,
    normalize_code,
)


def test_code_alphabet_excludes_confusables() -> None:
    for ch in "01IOL":
        assert ch not in CODE_ALPHABET


def test_generate_code_length_and_alphabet() -> None:
    code = generate_code()
    assert len(code) == 6
    assert all(c in CODE_ALPHABET for c in code)


def test_display_and_normalize() -> None:
    assert format_display_code("KX492P") == "KX4-92P"
    assert normalize_code("kx4-92p") == "KX492P"
    assert normalize_code("kx4 92p") == "KX492P"


def test_unused_and_max_ttl() -> None:
    now = datetime(2026, 1, 1, tzinfo=UTC)
    session = create_session(
        host_name="Ada",
        max_pointers=1,
        unused_ttl_s=600,
        max_ttl_s=7200,
        auto_admit=True,
        now=now,
    )
    assert session.expires_at == now + timedelta(seconds=600)
    assert session.max_expires_at == now + timedelta(seconds=7200)
    session.mark_live()
    assert session.expires_at == session.max_expires_at
    assert not session.is_expired(now + timedelta(seconds=601))
    assert session.is_expired(now + timedelta(seconds=7200))
