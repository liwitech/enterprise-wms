from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIASGIMiddleware
from slowapi.util import get_remote_address
from prometheus_fastapi_instrumentator import Instrumentator

from app.core.config import settings
from app.api.health import router as health_router
from app.api.auth import router as auth_router
from app.api.projects import router as projects_router
from app.api.tasks import router as tasks_router
from app.api.timesheets import router as timesheets_router
from app.api.reports import router as reports_router
from app.api.dashboard import router as dashboard_router
from app.api.departments import router as departments_router
from app.api.admin import router as admin_router
from app.api.sso import router as sso_router
from app.api.users import router as users_router
from app.middleware.audit import AuditLogMiddleware
from app.middleware.sanitizer import SanitizerMiddleware
from app.scheduler import scheduler, setup_scheduler

# ── Rate limiter ──────────────────────────────────────────────────────────────

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["100/minute"],
    storage_uri=settings.REDIS_URL,
)

# ── App factory ───────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_scheduler()
    scheduler.start()
    yield
    scheduler.shutdown(wait=False)


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="""
## Enterprise Work Management System API

Hệ thống quản lý công việc nội bộ doanh nghiệp cho phép quản lý **dự án**, **công việc**,
**chấm công**, và **báo cáo điều hành** với phân quyền theo vai trò (RBAC).

### Vai trò người dùng (RBAC)

| Role | Quyền chính |
|------|------------|
| `SUPER_ADMIN` | Toàn quyền, quản lý tổ chức |
| `ADMIN` | Quản lý người dùng, phòng ban, dự án |
| `MANAGER` | Tạo dự án, duyệt chấm công trong phòng ban |
| `EMPLOYEE` | Xem dự án được phân công, tạo task, ghi chấm công |

### Xác thực

Tất cả endpoint (trừ `/health` và `/auth/login`) yêu cầu JWT Bearer token:

```
Authorization: Bearer <access_token>
```

### Luồng xác thực

1. `POST /api/auth/login` → nhận `access_token` + `refresh_token`
2. Gửi `access_token` trong header `Authorization`
3. Khi hết hạn: `POST /api/auth/refresh` → nhận `access_token` mới
4. `POST /api/auth/logout` → thu hồi `refresh_token`
""",
    contact={
        "name": "TSV Engineering Team",
        "email": "engineering@tsv.vn",
    },
    license_info={
        "name": "Proprietary",
        "url": "https://tsv.vn/terms",
    },
    openapi_url=f"{settings.API_PREFIX}/openapi.json",
    docs_url=f"{settings.API_PREFIX}/docs",
    redoc_url=f"{settings.API_PREFIX}/redoc",
    lifespan=lifespan,
    openapi_tags=[
        {"name": "health", "description": "Health check và trạng thái hệ thống"},
        {"name": "auth", "description": "Xác thực, cấp phát và thu hồi token"},
        {"name": "projects", "description": "Quản lý dự án, thành viên và sprint"},
        {"name": "tasks", "description": "Quản lý công việc và bình luận"},
        {"name": "timesheets", "description": "Ghi chấm công, phê duyệt và báo cáo"},
        {"name": "reports", "description": "Báo cáo chấm công (JSON / CSV)"},
        {"name": "dashboard", "description": "Dashboard điều hành (cached)"},
        {"name": "departments", "description": "Danh sách phòng ban"},
    ],
)

# ── Middleware ────────────────────────────────────────────────────────────────

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIASGIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(SanitizerMiddleware)
app.add_middleware(AuditLogMiddleware)

# ── Prometheus ────────────────────────────────────────────────────────────────

Instrumentator(
    should_group_status_codes=True,
    should_ignore_untemplated=True,
    should_respect_env_var=False,
    excluded_handlers=["/metrics", f"{settings.API_PREFIX}/health"],
).instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)

# ── Routers ───────────────────────────────────────────────────────────────────

app.include_router(health_router, prefix=settings.API_PREFIX, tags=["health"])
app.include_router(auth_router, prefix=settings.API_PREFIX)
app.include_router(projects_router, prefix=settings.API_PREFIX)
app.include_router(tasks_router, prefix=settings.API_PREFIX)
app.include_router(timesheets_router, prefix=settings.API_PREFIX)
app.include_router(reports_router, prefix=settings.API_PREFIX)
app.include_router(dashboard_router, prefix=settings.API_PREFIX)
app.include_router(departments_router, prefix=settings.API_PREFIX)
app.include_router(admin_router, prefix=settings.API_PREFIX)
app.include_router(sso_router, prefix=settings.API_PREFIX)
app.include_router(users_router, prefix=settings.API_PREFIX)
