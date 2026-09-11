from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.core.config import settings
from app.core.errors import register_exception_handlers
from app.slices.analytics.router import router as analytics_router
from app.slices.audit.router import router as audit_router
from app.slices.chatbots.router import router as chatbot_router
from app.slices.conversations.router import router as conversations_router
from app.slices.conversations.router import widget_router
from app.slices.health.router import router as health_router
from app.slices.identity.router import router as auth_router
from app.slices.members.router import router as members_router
from app.slices.providers.router import router as providers_router
from app.slices.knowledge.router import router as knowledge_router

_WIDGET_JS = Path(__file__).resolve().parent / "static" / "widget.js"


def create_app() -> FastAPI:
    app = FastAPI(title="WebChatBots Builder API", version="1.0.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        # The widget runs on arbitrary customer origins; its routes carry no
        # cookies and are authorized by the conversation-scoped token alone.
        allow_origin_regex=".*" if settings.WIDGET_CORS_ALL_ORIGINS else None,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_exception_handlers(app)

    app.include_router(health_router)
    app.include_router(auth_router)
    app.include_router(chatbot_router)
    app.include_router(providers_router)
    app.include_router(knowledge_router)
    app.include_router(members_router)
    app.include_router(widget_router)
    app.include_router(conversations_router)
    app.include_router(analytics_router)
    app.include_router(audit_router)

    @app.get("/widget.js", include_in_schema=False)
    async def widget_js() -> FileResponse:
        return FileResponse(
            _WIDGET_JS,
            media_type="application/javascript",
            headers={"Cache-Control": "public, max-age=3600"},
        )

    return app


app = create_app()
