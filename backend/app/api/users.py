import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.user import User, UserRole
from app.core import security, audit as audit_log
from app.schemas.audit import UserCreate, UserResponse, UserUpdate
from app.api.deps import get_current_user, require_admin

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("", response_model=list[UserResponse])
async def list_users(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User))
    return result.scalars().all()


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    body: UserCreate,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = User(
        email=body.email,
        full_name=body.full_name,
        hashed_password=security.hash_password(body.password),
        role=UserRole(body.role),
    )
    db.add(user)
    await db.flush()

    await audit_log.log(
        db, "user_created", "user", str(user.id),
        user_id=current_user.id,
        details={"email": body.email, "role": body.role},
    )
    return user


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: uuid.UUID,
    body: UserUpdate,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    for field, value in body.model_dump(exclude_none=True).items():
        if field == "role":
            value = UserRole(value)
        setattr(user, field, value)

    await audit_log.log(
        db, "user_updated", "user", str(user_id),
        user_id=current_user.id,
        details=body.model_dump(exclude_none=True),
    )
    return user


@router.delete("/{user_id}/totp")
async def reset_totp(
    user_id: uuid.UUID,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Reset a user's TOTP enrollment (admin only — use for lost authenticator recovery)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.totp_secret = None
    user.totp_enabled = False

    await audit_log.log(
        db, "totp_reset", "user", str(user_id),
        user_id=current_user.id,
    )
    return {"totp_reset": True}
