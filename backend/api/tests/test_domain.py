from app.domain.session import CODE_ALPHABET, format_display_code, generate_code, normalize_code


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
