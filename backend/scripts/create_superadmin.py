"""Create or promote a platform superadmin.

    .venv\\Scripts\\python.exe -m scripts.create_superadmin --email admin@admin.com --password "AdminPassword123!" --name "Platform Admin"

D1: a superadmin has no tenancy — no organisation, no workspace, no
membership. It logs in through the normal dashboard, which routes it
straight to /admin instead of a workspace. `ensure_superadmin` detaches any
memberships the account may already have (e.g. if it was previously a
tenant owner), so this script only needs to call it.
"""

import argparse
import asyncio

from app.core.database import async_session_factory
from app.slices.identity import api as identity_api


async def ensure(email: str, password: str, name: str) -> None:
    async with async_session_factory() as session:
        await identity_api.ensure_superadmin(
            session, email=email, password=password, full_name=name
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
