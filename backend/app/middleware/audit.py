import json
import re
import time
from typing import Any
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
    "/metrics",
})

# Match paths like /api/projects/abc123 → resource_type=projects, resource_id=abc123
_RESOURCE_RE = re.compile(r"^/api/(?P<resource>[a-z_]+)/(?P<id>[^/]+)")


class AuditLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        if request.url.path in _SKIP_PATHS:
            return await call_next(request)

        start = time.perf_counter()
        user_id = _extract_user_id(request)

        # Capture request body for mutation methods
        new_value: Any = None
        if request.method in {"POST", "PUT", "PATCH"}:
            try:
                body_bytes = await request.body()
                if body_bytes:
                    new_value = json.loads(body_bytes)
            except Exception:
                pass

        response = await call_next(request)

        duration_ms = int((time.perf_counter() - start) * 1000)

        # Parse resource info from URL path
        resource_type: str | None = None
        resource_id: str | None = None
        m = _RESOURCE_RE.match(request.url.path)
        if m:
            resource_type = m.group("resource")
            resource_id = m.group("id")

        action = _method_to_action(request.method)

        await _write_log(
            user_id=user_id,
            method=request.method,
            endpoint=request.url.path,
            status_code=response.status_code,
            duration_ms=duration_ms,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            new_value=new_value,
        )

        return response


def _method_to_action(method: str) -> str:
    return {
        "POST": "CREATE",
        "PUT": "UPDATE",
        "PATCH": "UPDATE",
        "DELETE": "DELETE",
        "GET": "READ",
    }.get(method.upper(), method.upper())


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
    action: str | None = None,
    resource_type: str | None = None,
    resource_id: str | None = None,
    old_value: Any = None,
    new_value: Any = None,
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
                        action=action,
                        resource_type=resource_type,
                        resource_id=resource_id,
                        new_value=new_value,
                    )
                )
    except Exception:
        pass
