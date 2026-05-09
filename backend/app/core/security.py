import io
import base64
import uuid as _uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import pyotp
import qrcode
import jwt
from jwt.exceptions import PyJWTError
from passlib.context import CryptContext

from app.config import get_settings

settings = get_settings()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def _make_token(data: dict, expires_delta: timedelta, token_type: str) -> str:
    payload = data.copy()
    payload.update({
        "exp": datetime.now(timezone.utc) + expires_delta,
        "iat": datetime.now(timezone.utc),
        "type": token_type,
    })
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_access_token(user_id: str, role: str) -> str:
    return _make_token(
        {"sub": user_id, "role": role},
        timedelta(minutes=settings.access_token_expire_minutes),
        "access",
    )


def create_refresh_token(user_id: str) -> tuple[str, str]:
    """Returns (token, jti). Store jti in Redis to support single-use rotation."""
    jti = str(_uuid.uuid4())
    token = _make_token(
        {"sub": user_id, "jti": jti},
        timedelta(days=settings.refresh_token_expire_days),
        "refresh",
    )
    return token, jti


def create_temp_token(user_id: str) -> str:
    """Short-lived token issued after password check, before TOTP verification."""
    return _make_token(
        {"sub": user_id},
        timedelta(minutes=5),
        "totp_pending",
    )


def decode_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except PyJWTError:
        return {}


def generate_totp_secret() -> str:
    return pyotp.random_base32()


def get_totp_uri(email: str, secret: str) -> str:
    return pyotp.totp.TOTP(secret).provisioning_uri(
        name=email,
        issuer_name=settings.totp_issuer,
    )


def get_totp_qr_base64(email: str, secret: str) -> str:
    uri = get_totp_uri(email, secret)
    img = qrcode.make(uri)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


def verify_totp(secret: str, code: str) -> bool:
    totp = pyotp.TOTP(secret)
    return totp.verify(code, valid_window=1)


# ---------------------------------------------------------------------------
# Refresh token JTI rotation helpers (Redis-backed)
# ---------------------------------------------------------------------------

_REFRESH_JTI_PREFIX = "nova:refresh_jti:"


async def store_refresh_jti(redis, jti: str) -> None:
    ttl = settings.refresh_token_expire_days * 86400
    await redis.setex(f"{_REFRESH_JTI_PREFIX}{jti}", ttl, "1")


async def consume_refresh_jti(redis, jti: str) -> bool:
    """Returns True and deletes the key if valid; False if already consumed or unknown."""
    key = f"{_REFRESH_JTI_PREFIX}{jti}"
    deleted = await redis.delete(key)
    return bool(deleted)
