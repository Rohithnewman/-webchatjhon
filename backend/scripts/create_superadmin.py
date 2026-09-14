"""Create or promote a platform superadmin.

    .venv\\Scripts\\python.exe -m scripts.create_superadmin --email admin@admin.com --password "AdminPassword123!" --name "Platform Admin"

A superadmin still logs in through the normal dashboard, which needs a
workspace, so a personal "Platform" organisation is created on first run.
"""

import argparse
import asyncio

from app.core.database import async_session_factory
from app.slices.identity import api as identity_api
from app.slices.tenancy import api as tenancy_api


async def ensure(email: str, password: str, name: str) -> None:
    async with async_session_factory() as session:
        user = await identity_api.ensure_superadmin(session, email=email, password=password, full_name=name)
        if await tenancy_api.get_earliest_workspace_id(session, user_id=user.id) is None:
            tenant = await tenancy_api.create_tenant(session, org_name="Platform", workspace_name="Admin")
            owner = await tenancy_api.get_role_by_name(session, "owner")
            assert owner is not None, "system roles are not seeded — run alembic upgrade head"
            await tenancy_api.create_membership(
                session, user_id=user.id, workspace_id=tenant.workspace_id, role_id=owner.id
            )
        await session.commit()
        print(f"superadmin ready: {email}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--name", default="Platform Admin")
    args = parser.parse_args()
    asyncio.run(ensure(args.email, args.password, args.name))


if __name__ == "__main__":
    main()
