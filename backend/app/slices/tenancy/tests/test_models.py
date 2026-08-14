from app.slices.tenancy.models import Membership, Organization, Role, Workspace


def test_tables_are_named_as_expected():
    assert Organization.__tablename__ == "organizations"
    assert Workspace.__tablename__ == "workspaces"
    assert Role.__tablename__ == "roles"
    assert Membership.__tablename__ == "memberships"


def test_membership_uniqueness_is_partial_on_active_rows():
    index = next(
        item
        for item in Membership.__table__.indexes
        if item.name == "uq_membership_active"
    )
    assert index.unique is True
    assert index.dialect_options["postgresql"]["where"] is not None


def test_soft_delete_columns_present_on_tenancy_tables():
    for model in (Organization, Workspace, Membership):
        assert "deleted_at" in model.__table__.columns
        assert "created_at" in model.__table__.columns
        assert "updated_at" in model.__table__.columns
