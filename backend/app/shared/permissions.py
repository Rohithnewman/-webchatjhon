ALL = "*"
BOTS_MANAGE = "bots:manage"
INBOX_REPLY = "inbox:reply"
KNOWLEDGE_MANAGE = "knowledge:manage"
ANALYTICS_READ = "analytics:read"
MEMBERS_MANAGE = "members:manage"
WORKSPACE_MANAGE = "workspace:manage"
FEATURES_READ = "features:read"
CATALOGUE: tuple[str, ...] = (
    BOTS_MANAGE,
    INBOX_REPLY,
    KNOWLEDGE_MANAGE,
    ANALYTICS_READ,
    MEMBERS_MANAGE,
    WORKSPACE_MANAGE,
)
