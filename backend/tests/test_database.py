from sqlalchemy import text

from app.core.database import build_engine_kwargs


def test_pooler_url_disables_prepared_statements():
    """Supabase's pooler (port 6543, PgBouncer transaction mode) breaks on
    server-side prepared statements."""
    kwargs = build_engine_kwargs(
        "postgresql+asyncpg://u:p@aws-0-x.pooler.supabase.com:6543/postgres"
    )
    assert kwargs["prepared_statement_cache_size"] == 0
    assert kwargs["connect_args"]["statement_cache_size"] == 0


def test_direct_url_keeps_default_caching():
    kwargs = build_engine_kwargs(
        "postgresql+asyncpg://u:p@db.x.supabase.co:5432/postgres"
    )
    assert "prepared_statement_cache_size" not in kwargs


async def test_session_fixture_executes_sql(db_engine):
    async with db_engine.connect() as conn:
        result = await conn.execute(text("SELECT 1"))
        assert result.scalar_one() == 1
