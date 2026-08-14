from app.shared import permissions

SYSTEM_ROLES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("owner", (permissions.ALL,)),
    (
        "admin",
        (
            permissions.WORKSPACE_MANAGE,
            permissions.MEMBERS_MANAGE,
            permissions.FEATURES_USE,
            permissions.FEATURES_READ,
        ),
    ),
    ("member", (permissions.FEATURES_USE, permissions.FEATURES_READ)),
    ("viewer", (permissions.FEATURES_READ,)),
)
