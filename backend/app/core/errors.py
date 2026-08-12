import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.core.envelope import error as error_envelope

logger = logging.getLogger(__name__)


class AppError(Exception):
    """Domain error carrying the envelope code and HTTP status to render."""

    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = 400,
        details: dict[str, Any] | None = None,
    ) -> None:
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details
        super().__init__(message)


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=error_envelope(exc.code, exc.message, exc.details),
        )

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=400,
            content=error_envelope(
                "VALIDATION_ERROR",
                "Invalid request",
                {"errors": json_safe_errors(exc)},
            ),
        )

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("unhandled error", exc_info=exc)
        return JSONResponse(
            status_code=500,
            content=error_envelope("INTERNAL_ERROR", "Internal server error"),
        )


def json_safe_errors(exc: RequestValidationError) -> list[dict[str, Any]]:
    """Pydantic error dicts can carry non-serializable `ctx` values; drop them."""
    return [
        {k: v for k, v in item.items() if k in {"type", "loc", "msg"}}
        for item in exc.errors()
    ]
