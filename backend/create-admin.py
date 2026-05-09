"""
Bootstrap script — creates the first admin user.
Run inside the backend container: python /app/create-admin.py
"""
import asyncio
import sys

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.user import User, UserRole
from app.core.security import hash_password


async def main() -> None:
    async with AsyncSessionLocal() as db:
        existing = await db.scalar(select(User).where(User.role == UserRole.admin).limit(1))
        if existing:
            print(f"Admin already exists: {existing.email}")
            print("To add another admin, use the Nova admin panel.")
            sys.exit(0)

    print("Creating first Nova admin account")
    print("─" * 36)

    full_name = input("Full name:             ").strip()
    email     = input("Email:                 ").strip().lower()
    password  = input("Password (min 12 ch):  ").strip()

    if not full_name or not email or not password:
        print("ERROR: All fields are required.")
        sys.exit(1)

    if len(password) < 12:
        print("ERROR: Password must be at least 12 characters.")
        sys.exit(1)

    if "@" not in email:
        print("ERROR: Invalid email address.")
        sys.exit(1)

    async with AsyncSessionLocal() as db:
        user = User(
            full_name=full_name,
            email=email,
            hashed_password=hash_password(password),
            role=UserRole.admin,
            totp_enabled=False,
            is_active=True,
        )
        db.add(user)
        await db.commit()

    print()
    print(f"Admin account created: {email}")
    print("IMPORTANT: Log in and complete TOTP MFA setup before creating engagements.")


asyncio.run(main())
