"""Reset a user's password directly in the database.

For local demo setups only: this is a convenience tool to align an account
that already exists (e.g. created by hand before a seed script assumed a
particular password) with the password a demo/seed script expects. It is not
an admin feature of the product and has no auth of its own — do not point it
at anything but a local development database.

    .venv\\Scripts\\python.exe -m scripts.set_password --email rohithnewman@gmail.com --password "Rogith@12345"
"""

import argparse
import asyncio
import sys

from app.core import security
# load every slice's models so SQLAlchemy can resolve cross-slice foreign keys (same reason as app/worker.py)
from app.core import registry as _registry  # noqa: F401
from app.core.database import async_session_factory
from app.slices.identity import repository


async def set_password(email: str, password: str) -> bool:
    async with async_session_factory() as session:
        user = await repository.select_user_by_email(session, email, for_update=True)
        if user is None:
            return False
        user.password_hash = security.hash_password(password)
        user.failed_login_count = 0
        user.locked_until = None
        await session.commit()
        return True


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    args = parser.parse_args()
    ok = asyncio.run(set_password(args.email, args.password))
    if not ok:
        print("no such user")
        sys.exit(1)
    print(f"password updated for {args.email}")


if __name__ == "__main__":
    main()
