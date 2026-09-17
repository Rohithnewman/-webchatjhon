from app.shared import permissions

SYSTEM_ROLES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("owner", (permissions.ALL,)),
    (
        "admin",
        (
            permissions.BOTS_MANAGE,
            permissions.INBOX_REPLY,
            permissions.KNOWLEDGE_MANAGE,
            permissions.ANALYTICS_READ,
            permissions.MEMBERS_MANAGE,
            permissions.WORKSPACE_MANAGE,
            permissions.FEATURES_READ,
        ),
    ),
    (
        "member",
        (
            permissions.BOTS_MANAGE,
            permissions.INBOX_REPLY,
            permissions.KNOWLEDGE_MANAGE,
            permissions.ANALYTICS_READ,
            permissions.FEATURES_READ,
        ),
    ),
    ("viewer", (permissions.ANALYTICS_READ, permissions.FEATURES_READ)),
)
