"""Symmetric encryption for secrets held on behalf of a workspace.

Domain-free by design: `core` knows how to encrypt bytes, not what a provider
credential is. The providers slice decides what gets encrypted and when.
"""

from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings


class DecryptionError(Exception):
    """Ciphertext could not be decrypted with the configured key.

    In practice this means ENCRYPTION_KEY changed after the value was written.
    """


@lru_cache(maxsize=1)
def _cipher() -> Fernet:
    # Built once. An invalid key should fail loudly at first use rather than
    # silently per call.
    return Fernet(settings.ENCRYPTION_KEY.encode("utf-8"))


def encrypt(plaintext: str) -> str:
    """Encrypt a secret for storage. Output is safe to put in a text column."""
    return _cipher().encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt(ciphertext: str) -> str:
    try:
        return _cipher().decrypt(ciphertext.encode("utf-8")).decode("utf-8")
    except InvalidToken as exc:
        raise DecryptionError(
            "Stored secret could not be decrypted; ENCRYPTION_KEY may have changed"
        ) from exc


def last_four(secret: str) -> str:
    """The tail of a key, so the UI can identify it without holding it."""
    return secret[-4:] if len(secret) >= 4 else ""
