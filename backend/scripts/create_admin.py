"""
Create the initial admin user. Run inside the backend container:

    docker compose exec backend python scripts/create_admin.py

Prompts for email, full name, and password. TOTP enrollment happens on first login.
"""
import asyncio
import sys
import getpass
import uuid

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select

sys.path.insert(0, "/app")

from app.config import get_settings
from app.models.user import User, UserRole
from app.core.security import hash_password

settings = get_settings()


async def main() -> None:
    print("=== Nova — Create Admin User ===\n")

    email = input("Email: ").strip().lower()
    if not email:
        print("Email is required.")
        sys.exit(1)

    full_name = input("Full name: ").strip()
    if not full_name:
        print("Full name is required.")
        sys.exit(1)

    password = getpass.getpass("Password: ")
    if len(password) < 12:
        print("Password must be at least 12 characters.")
        sys.exit(1)

    confirm = getpass.getpass("Confirm password: ")
    if password != confirm:
        print("Passwords do not match.")
        sys.exit(1)

    engine = create_async_engine(settings.database_url)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        result = await db.execute(select(User).where(User.email == email))
        if result.scalar_one_or_none():
            print(f"User {email} already exists.")
            await engine.dispose()
            sys.exit(1)

        user = User(
            id=uuid.uuid4(),
            email=email,
            full_name=full_name,
            hashed_password=hash_password(password),
            role=UserRole.admin,
            is_active=True,
        )
        db.add(user)
        await db.commit()

    await engine.dispose()
    print(f"\nAdmin user created: {email}")
    print("TOTP enrollment will be required on first login.")


if __name__ == "__main__":
    asyncio.run(main())
