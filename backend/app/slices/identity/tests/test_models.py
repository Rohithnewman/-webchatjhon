from app.core.registry import metadata
from app.slices.identity.models import RefreshToken, User


def test_user_email_uniqueness_is_partial_on_active_rows():
    index = next(
        item for item in User.__table__.indexes if item.name == "uq_user_active_email"
    )
    assert index.unique is True
    assert index.dialect_options["postgresql"]["where"] is not None


def test_user_carries_lockout_and_default_workspace_columns():
    columns = User.__table__.columns
    assert "failed_login_count" in columns
    assert "locked_until" in columns
    assert "last_workspace_id" in columns


def test_refresh_token_has_family_for_reuse_detection():
    assert "family_id" in RefreshToken.__table__.columns
    assert RefreshToken.__table__.columns["token_hash"].unique is True


def test_audit_log_is_append_only():
    audit = metadata.tables["audit_logs"]
    assert "created_at" in audit.columns
    assert "updated_at" not in audit.columns
    assert "deleted_at" not in audit.columns
    assert audit.columns["workspace_id"].nullable is True
    assert audit.columns["actor_id"].nullable is True


def test_registry_sees_every_slice_table():
    assert {
        "organizations",
        "workspaces",
        "roles",
        "memberships",
        "users",
        "refresh_tokens",
        "audit_logs",
    } <= set(metadata.tables)
