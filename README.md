# Enterprise Work Management System (EWMS)

Hệ thống quản lý công việc doanh nghiệp toàn diện, xây dựng trên nền tảng React/TypeScript + FastAPI + PostgreSQL, hỗ trợ quản lý dự án, nhiệm vụ, chấm công và phê duyệt theo cấu trúc tổ chức.

---

## Screenshots

| Đăng nhập | Executive Dashboard |
|-----------|-------------------|
| ![Login](docs/screenshots/01-login.png) | ![Dashboard](docs/screenshots/02-dashboard.png) |

| Danh sách dự án | Chi tiết dự án |
|-----------------|----------------|
| ![Projects](docs/screenshots/03-projects.png) | ![Project Detail](docs/screenshots/08-project-detail.png) |

| Quản lý công việc | Chấm công |
|-------------------|-----------|
| ![Tasks](docs/screenshots/04-tasks.png) | ![Timesheet](docs/screenshots/05-timesheet.png) |

| Phê duyệt | Báo cáo |
|-----------|---------|
| ![Approvals](docs/screenshots/07-approvals.png) | ![Reports](docs/screenshots/06-reports.png) |

---

## Tính năng chính

- **Quản lý dự án** — Tạo và theo dõi dự án theo phương pháp Waterfall, Agile hoặc Mixed; quản lý Sprint và Milestone
- **Kanban & Gantt** — Bảng Kanban kéo thả và biểu đồ Gantt trực quan cho từng dự án
- **Quản lý nhiệm vụ** — Phân công, ưu tiên, comment và đính kèm file; import hàng loạt từ Excel
- **Chấm công & Phê duyệt** — Lưới nhập giờ theo tuần, luồng phê duyệt Timesheet và nhiệm vụ
- **Executive Dashboard** — Tổng quan KPI toàn tổ chức, dữ liệu được cache Redis
- **Báo cáo** — Xuất báo cáo JSON/CSV theo dự án, phòng ban, nhân viên
- **Phân quyền RBAC** — 4 cấp vai trò: Super Admin, Admin, Manager, Employee
- **SSO (WSO2)** — Đăng nhập một lần qua hệ thống Identity Provider doanh nghiệp
- **Audit Log** — Ghi nhận toàn bộ hành động thay đổi dữ liệu
- **Giám sát** — Prometheus metrics + Grafana dashboard tích hợp sẵn

---

## Tech Stack

| Lớp | Công nghệ |
|-----|-----------|
| **Frontend** | React 18, TypeScript 5, Vite, Tailwind CSS, TanStack Query, Zustand, Recharts |
| **Backend** | Python 3.11, FastAPI 0.111, SQLAlchemy 2 (async), Alembic, APScheduler |
| **Database** | PostgreSQL 15 (asyncpg), Redis 7 |
| **Auth** | JWT (access + refresh token), bcrypt, SSO WSO2 |
| **DevOps** | Docker, Docker Compose, GitHub Actions, GHCR, Nginx, PgBouncer |
| **Testing** | pytest, Vitest |

---

## Kiến trúc hệ thống

```
┌─────────────────────────────────────────────────┐
│                    Internet                      │
└──────────────────────┬──────────────────────────┘
                       │
              ┌────────▼────────┐
              │   Nginx Proxy   │
              └────────┬────────┘
               ┌───────┴────────┐
      ┌────────▼───────┐  ┌─────▼──────────┐
      │ React Frontend │  │ FastAPI Backend │
      │   (Port 3000)  │  │   (Port 8000)   │
      └────────────────┘  └──────┬──────────┘
                          ┌──────┴──────┐
                   ┌──────▼──┐    ┌─────▼──┐
                   │Postgres │    │ Redis  │
                   │  :5432  │    │  :6379 │
                   └─────────┘    └────────┘
```

---

## Cài đặt & Chạy thử (Development)

### Yêu cầu

- Docker Desktop >= 24
- Docker Compose >= 2.24

### 1. Clone repo

```bash
git clone https://github.com/liwitech/enterprise-wms.git
cd enterprise-wms
```

### 2. Cấu hình biến môi trường

```bash
cp .env.production.example .env
```

Mở `.env` và điền các giá trị cần thiết (xem phần [Biến môi trường](#biến-môi-trường) bên dưới).

### 3. Khởi động toàn bộ hệ thống

```bash
docker compose up -d
```

### 4. Chạy database migration

```bash
docker compose exec backend alembic upgrade head
```

### 5. Seed dữ liệu mẫu (tuỳ chọn)

```bash
docker compose exec backend python -m app.db.seed
```

### 6. Truy cập

| Dịch vụ | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API Docs (Swagger) | http://localhost:8000/docs |
| API Docs (Redoc) | http://localhost:8000/redoc |

---

## Cài đặt Production

### 1. Chuẩn bị server

```bash
cp .env.production.example .env
# Chỉnh sửa .env với các giá trị production thực tế
```

### 2. Tạo SECRET_KEY an toàn

```bash
openssl rand -hex 32
```

### 3. Khởi động production stack

```bash
docker compose -f docker-compose.prod.yml up -d
```

---

## Biến môi trường

Xem file [`.env.production.example`](.env.production.example) để biết đầy đủ các biến. Các biến bắt buộc:

| Biến | Mô tả | Ví dụ |
|------|-------|-------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql+asyncpg://user:pass@postgres/db` |
| `REDIS_URL` | Redis connection string | `redis://:password@redis:6379/0` |
| `SECRET_KEY` | JWT signing key | Tạo bằng `openssl rand -hex 32` |
| `CORS_ORIGINS` | Danh sách origin được phép | `["http://localhost:3000"]` |
| `VITE_API_URL` | URL backend cho frontend | `http://localhost:8000` |

**SSO (tuỳ chọn):**

| Biến | Mô tả |
|------|-------|
| `WSO2_BASE_URL` | URL Identity Provider WSO2 |
| `WSO2_CLIENT_ID` | OAuth2 Client ID |
| `WSO2_CLIENT_SECRET` | OAuth2 Client Secret |
| `SSO_REDIRECT_URI` | Callback URL sau khi đăng nhập SSO |

---

## Cấu trúc thư mục

```
enterprise-wms/
├── backend/
│   ├── app/
│   │   ├── api/          # Route handlers (auth, projects, tasks, timesheets…)
│   │   ├── models/       # SQLAlchemy ORM models
│   │   ├── schemas/      # Pydantic request/response schemas
│   │   ├── services/     # Business logic
│   │   ├── middleware/   # Audit log, rate limit, sanitizer
│   │   └── core/         # Config, security, dependencies
│   ├── alembic/          # Database migrations
│   └── tests/            # pytest test suites
├── frontend/
│   ├── src/
│   │   ├── pages/        # Các trang chính
│   │   ├── components/   # UI components tái sử dụng
│   │   ├── hooks/        # Custom React hooks
│   │   ├── services/     # API service calls
│   │   ├── stores/       # Zustand state stores
│   │   └── types/        # TypeScript type definitions
│   └── public/
├── nginx/                # Nginx config
├── pgbouncer/            # Connection pooling config
├── scripts/              # Backup và utility scripts
├── docs/                 # API reference, data model, Postman collection
├── .github/workflows/    # CI/CD pipelines
├── docker-compose.yml
└── docker-compose.prod.yml
```

---

## Database Migrations

```bash
# Tạo migration mới
docker compose exec backend alembic revision --autogenerate -m "description"

# Áp dụng migration
docker compose exec backend alembic upgrade head

# Rollback 1 bước
docker compose exec backend alembic downgrade -1
```

---

## API

Toàn bộ API đều có prefix `/api`. Xem tài liệu đầy đủ tại `/docs` (Swagger UI) sau khi khởi động server.

| Endpoint | Mô tả |
|----------|-------|
| `POST /api/auth/login` | Đăng nhập, nhận JWT |
| `POST /api/auth/refresh` | Làm mới access token |
| `GET /api/projects` | Danh sách dự án |
| `GET /api/tasks` | Danh sách nhiệm vụ |
| `GET /api/timesheets` | Timesheet theo tuần |
| `GET /api/dashboard` | Executive dashboard (cached) |
| `GET /api/reports` | Báo cáo xuất file |
| `GET /api/health` | Health check |
| `GET /metrics` | Prometheus metrics |

---

## Chạy Tests

**Backend:**

```bash
docker compose exec backend pytest -v
```

**Frontend (TypeScript check):**

```bash
cd frontend && npm run type-check
```

**Frontend (Unit tests):**

```bash
cd frontend && npm run test
```

---

## CI/CD

Dự án sử dụng GitHub Actions với 2 pipeline:

- **`test.yml`** — Chạy tự động khi push/PR vào `main` hoặc `develop`: backend pytest + frontend TypeScript check
- **`build.yml`** — Chạy khi push vào `main`: build và push Docker images lên GitHub Container Registry (GHCR)

Docker images:
- `ghcr.io/liwitech/enterprise-wms/backend:latest`
- `ghcr.io/liwitech/enterprise-wms/frontend:latest`

---

## Phân quyền

| Vai trò | Quyền |
|---------|-------|
| **Super Admin** | Toàn quyền hệ thống |
| **Admin** | Quản lý người dùng, phòng ban, cấu hình tổ chức |
| **Manager** | Tạo dự án, phân công nhiệm vụ, phê duyệt timesheet |
| **Employee** | Xem dự án được giao, nhập timesheet, cập nhật nhiệm vụ |

---

## License

MIT License — xem file [LICENSE](LICENSE) để biết thêm chi tiết.
