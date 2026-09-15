import html
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse

from app.core.config import settings
from app.core.errors import register_exception_handlers
from app.slices.admin.router import router as admin_router
from app.slices.analytics.router import router as analytics_router
from app.slices.audit.router import router as audit_router
from app.slices.chatbots.router import router as chatbot_router
from app.slices.conversations.router import router as conversations_router
from app.slices.conversations.router import widget_router
from app.slices.health.router import router as health_router
from app.slices.identity.router import router as auth_router
from app.slices.members.router import router as members_router
from app.slices.organizations.router import router as organizations_router
from app.slices.providers.router import router as providers_router
from app.slices.knowledge.router import router as knowledge_router

_WIDGET_JS = Path(__file__).resolve().parent / "static" / "widget.js"
_DEMO_HTML = Path(__file__).resolve().parent / "static" / "demo.html"


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
    app.include_router(organizations_router)
    app.include_router(widget_router)
    app.include_router(conversations_router)
    app.include_router(analytics_router)
    app.include_router(audit_router)
    app.include_router(admin_router)

    @app.get("/widget.js", include_in_schema=False)
    async def widget_js() -> FileResponse:
        return FileResponse(
            _WIDGET_JS,
            media_type="application/javascript",
            headers={"Cache-Control": "public, max-age=3600"},
        )

    @app.get("/demo", include_in_schema=False)
    async def demo_page(request: Request, chatbot_id: str = "") -> HTMLResponse:
        """A fake customer site with the widget installed, for live demos."""
        root = str(request.base_url).rstrip("/")
        page = (
            _DEMO_HTML.read_text(encoding="utf-8")
            .replace("__CHATBOT_ID__", html.escape(chatbot_id) or "(missing — add ?chatbot_id=…)")
            .replace("__ROOT__", root)
            .replace("__API__", f"{root}/api/v1")
        )
        return HTMLResponse(page)

    return app


app = create_app()
