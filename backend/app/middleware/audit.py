import time
from uuid import UUID

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.security import decode_access_token
from app.db.session import AsyncSessionLocal
from app.models.audit_log import AuditLog

_SKIP_PATHS = frozenset({
    "/api/docs", "/api/redoc", "/api/openapi.json",
    "/docs", "/redoc", "/openapi.json",
})


class AuditLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        if request.url.path in _SKIP_PATHS:
            return await call_next(request)

        start = time.perf_counter()
        user_id = _extract_user_id(request)

        response = await call_next(request)

        duration_ms = int((time.perf_counter() - start) * 1000)

        await _write_log(
            user_id=user_id,
            method=request.method,
            endpoint=request.url.path,
            status_code=response.status_code,
            duration_ms=duration_ms,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )

        return response


def _extract_user_id(request: Request) -> str | None:
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        return None
    payload = decode_access_token(auth[7:])
    return payload.get("sub") if payload else None


async def _write_log(
    *,
    user_id: str | None,
    method: str,
    endpoint: str,
    status_code: int,
    duration_ms: int,
    ip_address: str | None,
    user_agent: str | None,
) -> None:
    try:
        uid: UUID | None = None
        if user_id:
            try:
                uid = UUID(user_id)
            except ValueError:
                pass

        async with AsyncSessionLocal() as session:
            async with session.begin():
                session.add(
                    AuditLog(
                        user_id=uid,
                        method=method,
                        endpoint=endpoint,
                        status_code=status_code,
                        duration_ms=duration_ms,
                        ip_address=ip_address,
                        user_agent=user_agent,
                    )
                )
    except Exception:
        pass  # logging must never break the app
