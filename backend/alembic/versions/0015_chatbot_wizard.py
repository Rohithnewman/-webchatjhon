"""Create-bot wizard: platform, purpose and installation fields on chatbots.

Revision ID: 0015_chatbot_wizard
Revises: 0014_roles_catalogue
"""
import sqlalchemy as sa
from alembic import op

revision = "0015_chatbot_wizard"
down_revision = "0014_roles_catalogue"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("chatbots", sa.Column("platform", sa.String(20), nullable=False, server_default="website"))
    op.add_column("chatbots", sa.Column("use_case", sa.String(20), nullable=True))
    op.add_column("chatbots", sa.Column("use_case_note", sa.String(200), nullable=True))
    op.add_column("chatbots", sa.Column("install_format", sa.String(20), nullable=True))
    op.add_column("chatbots", sa.Column("installed_url", sa.String(2048), nullable=True))
    op.add_column("chatbots", sa.Column("installed_at", sa.DateTime(timezone=True), nullable=True))
    op.create_check_constraint(
        "ck_chatbots_platform", "chatbots",
        "platform IN ('website', 'whatsapp', 'instagram', 'facebook', 'telegram')",
    )
    op.create_check_constraint(
        "ck_chatbots_use_case", "chatbots",
        "use_case IS NULL OR use_case IN ('leads', 'support', 'sales', 'appointment', 'other')",
    )
    op.create_check_constraint(
        "ck_chatbots_install_format", "chatbots",
        "install_format IS NULL OR install_format IN ('chat_button', 'landing_page', 'mobile_app', 'embedded')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_chatbots_install_format", "chatbots", type_="check")
    op.drop_constraint("ck_chatbots_use_case", "chatbots", type_="check")
    op.drop_constraint("ck_chatbots_platform", "chatbots", type_="check")
    for column in ("installed_at", "installed_url", "install_format", "use_case_note", "use_case", "platform"):
        op.drop_column("chatbots", column)
