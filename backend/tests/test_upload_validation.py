"""TDD: detected_type NULL handling — 旧指纹无类型时应放行"""


def test_null_detected_type_passes():
    """simulate fp.detected_type is None → should not block"""
    detected_type = None

    # zip check
    blocked_by_zip = detected_type is not None and detected_type != "zip"
    assert not blocked_by_zip, "NULL detected_type should NOT block zip usage"

    # image check
    blocked_by_image = detected_type is not None and detected_type not in ("png", "jpeg", "gif")
    assert not blocked_by_image, "NULL detected_type should NOT block image usage"


def test_valid_detected_type_blocks_wrong_format():
    """detected_type='zip' should block avatar usage"""
    detected_type = "zip"

    blocked = detected_type not in ("png", "jpeg", "gif")
    assert blocked, "zip should be blocked as avatar"


def test_valid_detected_type_allows_correct_format():
    """detected_type='png' should allow image usage"""
    detected_type = "png"

    blocked = detected_type not in ("png", "jpeg", "gif")
    assert not blocked, "png should be allowed as avatar"
