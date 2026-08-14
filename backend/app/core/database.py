from collections.abc import AsyncIterator
from typing import Any

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings


class Base(DeclarativeBase):
    pass


def build_engine_kwargs(url: str) -> dict[str, Any]:
    """Supabase's connection pooler runs PgBouncer in transaction mode, which
    cannot hold server-side prepared statements. Disable SQLAlchemy's asyncpg
    prepared-statement cache and asyncpg's own statement cache when talking to
    it. Alembic must use the DIRECT connection (5432) regardless.
    """
    if ":6543" in url:
        return {
            "prepared_statement_cache_size": 0,
            "connect_args": {"statement_cache_size": 0},
        }
    return {}


def build_engine(url: str) -> AsyncEngine:
    return create_async_engine(
        url, echo=False, pool_pre_ping=True, **build_engine_kwargs(url)
    )


engine = build_engine(settings.DATABASE_URL)
async_session_factory = async_sessionmaker(
    engine, expire_on_commit=False, class_=AsyncSession
)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with async_session_factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
