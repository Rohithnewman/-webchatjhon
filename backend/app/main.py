from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.errors import register_exception_handlers
from app.slices.chatbots.router import router as chatbot_router
from app.slices.health.router import router as health_router
from app.slices.identity.router import router as auth_router
from app.slices.providers.router import router as providers_router
from app.slices.knowledge.router import router as knowledge_router


def create_app() -> FastAPI:
    app = FastAPI(title="WebChatBots Builder API", version="1.0.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
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

    return app


app = create_app()
