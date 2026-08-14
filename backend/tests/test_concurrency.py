import asyncio
import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.core.errors import AppError
from app.core.security import sha256
from app.slices.identity.use_cases.refresh import refresh
from app.slices.identity.use_cases.register import register


async def _register_in_new_session(db_engine: AsyncEngine, email: str):
    async with AsyncSession(db_engine, expire_on_commit=False) as session:
        return await register(
            session,
            email=email,
            password="Secret123",
            full_name="Concurrent",
            org_name="Concurrent",
        )


async def test_concurrent_registration_creates_exactly_one_user(db_engine):
    email = f"race-{uuid.uuid4().hex}@x.com"
    results = await asyncio.gather(
        _register_in_new_session(db_engine, email),
        _register_in_new_session(db_engine, email),
        return_exceptions=True,
    )
    assert sum(not isinstance(result, Exception) for result in results) == 1
    errors = [result for result in results if isinstance(result, AppError)]
    assert len(errors) == 1
    assert errors[0].code == "EMAIL_TAKEN"
    async with AsyncSession(db_engine) as session:
        count = await session.execute(
            text("SELECT count(*) FROM users WHERE email=:email"), {"email": email}
        )
        assert count.scalar_one() == 1


async def test_concurrent_refresh_detects_reuse_and_revokes_winner(db_engine):
    email = f"refresh-race-{uuid.uuid4().hex}@x.com"
    registered = await _register_in_new_session(db_engine, email)

    async def _rotate():
        async with AsyncSession(db_engine, expire_on_commit=False) as session:
            return await refresh(session, refresh_token=registered.refresh_token)

    results = await asyncio.gather(_rotate(), _rotate(), return_exceptions=True)
    bundles = [result for result in results if not isinstance(result, Exception)]
    errors = [result for result in results if isinstance(result, AppError)]
    assert len(bundles) == 1
    assert len(errors) == 1
    assert errors[0].code == "INVALID_REFRESH"
    async with AsyncSession(db_engine) as session:
        revoked = await session.execute(
            text("SELECT revoked_at FROM refresh_tokens WHERE token_hash=:token_hash"),
            {"token_hash": sha256(bundles[0].refresh_token)},
        )
        assert revoked.scalar_one() is not None
