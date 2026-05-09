from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.user import User
from app.core import security, audit as audit_log
from app.core.rate_limit import limiter
from app.core.redis import get_redis
from app.schemas.auth import (
    LoginRequest,
    TOTPVerifyRequest,
    TOTPPendingResponse,
    TokenResponse,
    TOTPSetupResponse,
    TOTPEnrollRequest,
    RefreshRequest,
    UserMe,
)
from app.api.deps import get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    return forwarded.split(",")[0].strip() if forwarded else request.client.host


@router.post("/login")
@limiter.limit("10/minute")
async def login(
    body: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user or not security.verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account disabled")

    await audit_log.log(
        db, action="login_attempt", resource_type="user",
        resource_id=str(user.id), user_id=user.id, ip_address=_client_ip(request),
    )

    if user.totp_enabled:
        temp_token = security.create_temp_token(str(user.id))
        return TOTPPendingResponse(temp_token=temp_token)

    if not user.totp_secret:
        secret = security.generate_totp_secret()
        user.totp_secret = secret
        await db.flush()
        temp_token = security.create_temp_token(str(user.id))
        return {"requires_totp_setup": True, "temp_token": temp_token}

    temp_token = security.create_temp_token(str(user.id))
    return TOTPPendingResponse(temp_token=temp_token)


@router.post("/totp/setup", response_model=TOTPSetupResponse)
async def totp_setup(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Returns the TOTP QR code for enrollment. Called with temp_token in Authorization header."""
    auth = request.headers.get("Authorization", "")
    token = auth.removeprefix("Bearer ").strip()
    payload = security.decode_token(token)

    if not payload or payload.get("type") != "totp_pending":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid setup token")

    result = await db.execute(select(User).where(User.id == payload["sub"]))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if not user.totp_secret:
        user.totp_secret = security.generate_totp_secret()
        await db.flush()

    qr = security.get_totp_qr_base64(user.email, user.totp_secret)
    return TOTPSetupResponse(secret=user.totp_secret, qr_code=qr)


@router.post("/totp/enroll")
async def totp_enroll(
    body: TOTPEnrollRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
):
    """Confirm TOTP enrollment by verifying the first code."""
    auth = request.headers.get("Authorization", "")
    token = auth.removeprefix("Bearer ").strip()
    payload = security.decode_token(token)

    if not payload or payload.get("type") != "totp_pending":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid setup token")

    result = await db.execute(select(User).where(User.id == payload["sub"]))
    user = result.scalar_one_or_none()
    if not user or not user.totp_secret:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="TOTP not initialized")

    if not security.verify_totp(user.totp_secret, body.totp_code):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid TOTP code")

    user.totp_enabled = True
    await audit_log.log(db, "totp_enrolled", "user", str(user.id), user_id=user.id, ip_address=_client_ip(request))

    access_token = security.create_access_token(str(user.id), user.role.value)
    refresh_token, jti = security.create_refresh_token(str(user.id))
    await security.store_refresh_jti(redis, jti)
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/totp/verify", response_model=TokenResponse)
@limiter.limit("10/minute")
async def totp_verify(
    body: TOTPVerifyRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
):
    payload = security.decode_token(body.temp_token)
    if not payload or payload.get("type") != "totp_pending":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    result = await db.execute(select(User).where(User.id == payload["sub"]))
    user = result.scalar_one_or_none()
    if not user or not user.totp_secret:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    if not security.verify_totp(user.totp_secret, body.totp_code):
        await audit_log.log(db, "totp_failed", "user", str(user.id), user_id=user.id, ip_address=_client_ip(request))
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid TOTP code")

    user.last_login = datetime.now(timezone.utc)
    await audit_log.log(db, "login_success", "user", str(user.id), user_id=user.id, ip_address=_client_ip(request))

    access_token = security.create_access_token(str(user.id), user.role.value)
    refresh_token, jti = security.create_refresh_token(str(user.id))
    await security.store_refresh_jti(redis, jti)
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    body: RefreshRequest,
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
):
    payload = security.decode_token(body.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    jti = payload.get("jti")
    if not jti:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Malformed refresh token")

    # Single-use: consume the JTI atomically; rejects reuse or unknown tokens
    if not await security.consume_refresh_jti(redis, jti):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token already used or expired")

    result = await db.execute(select(User).where(User.id == payload["sub"]))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    access_token = security.create_access_token(str(user.id), user.role.value)
    refresh_token, new_jti = security.create_refresh_token(str(user.id))
    await security.store_refresh_jti(redis, new_jti)
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.get("/me", response_model=UserMe)
async def me(current_user: User = Depends(get_current_user)):
    return current_user
