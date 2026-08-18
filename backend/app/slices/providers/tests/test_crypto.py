from app.core import crypto


def test_encrypt_round_trip_and_last_four():
    secret = "sk-test-provider-secret"
    ciphertext = crypto.encrypt(secret)

    assert ciphertext != secret
    assert crypto.decrypt(ciphertext) == secret
    assert crypto.last_four(secret) == "cret"


def test_last_four_does_not_pad_short_secrets():
    assert crypto.last_four("abc") == ""
