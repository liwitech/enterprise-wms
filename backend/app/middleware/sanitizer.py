import json
import re
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


_DANGEROUS_PATTERNS = re.compile(
    r"<script[\s\S]*?>[\s\S]*?</script>|"
    r"javascript\s*:|"
    r"on\w+\s*=",
    re.IGNORECASE,
)


def _sanitize(value: Any) -> Any:
    if isinstance(value, str):
        return _DANGEROUS_PATTERNS.sub("", value)
    if isinstance(value, dict):
        return {k: _sanitize(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_sanitize(item) for item in value]
    return value


class SanitizerMiddleware(BaseHTTPMiddleware):
    """Strip dangerous XSS patterns from JSON request bodies on mutating methods."""

    async def dispatch(self, request: Request, call_next) -> Response:
        if request.method in {"POST", "PUT", "PATCH"}:
            content_type = request.headers.get("content-type", "")
            if "application/json" in content_type:
                try:
                    raw = await request.body()
                    if raw:
                        payload = json.loads(raw)
                        cleaned = _sanitize(payload)
                        cleaned_bytes = json.dumps(cleaned, ensure_ascii=False).encode()

                        # Rebuild request with cleaned body
                        async def receive():
                            return {"type": "http.request", "body": cleaned_bytes, "more_body": False}

                        request = Request(request.scope, receive)
                except (json.JSONDecodeError, UnicodeDecodeError):
                    pass  # pass through malformed bodies unchanged

        return await call_next(request)
