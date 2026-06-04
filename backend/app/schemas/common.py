from typing import Generic, TypeVar, Any
from pydantic import BaseModel

T = TypeVar("T")


class PaginationMeta(BaseModel):
    page: int
    per_page: int
    total: int
    total_pages: int


class ApiResponse(BaseModel, Generic[T]):
    success: bool = True
    data: T | None = None
    meta: PaginationMeta | None = None
    message: str | None = None
    error_code: str | None = None


def ok(data: Any, message: str | None = None) -> ApiResponse:
    return ApiResponse(success=True, data=data, message=message)


def paginated(data: Any, page: int, per_page: int, total: int) -> ApiResponse:
    total_pages = max(1, (total + per_page - 1) // per_page)
    return ApiResponse(
        success=True,
        data=data,
        meta=PaginationMeta(page=page, per_page=per_page, total=total, total_pages=total_pages),
    )
