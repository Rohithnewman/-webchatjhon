from typing import Any


def success(
    data: Any,
    message: str | None = None,
    pagination: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {"success": True, "data": data, "message": message, "pagination": pagination}


def error(
    code: str,
    message: str,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {"success": False, "error": code, "message": message, "details": details}
