from __future__ import annotations


def secrets_equal(a: str, b: str) -> bool:
    """Constant-time compare for tokens (PRD S-7)."""
    if len(a) != len(b):
        return False
    result = 0
    for x, y in zip(a.encode(), b.encode(), strict=True):
        result |= x ^ y
    return result == 0
