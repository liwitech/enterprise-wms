# Enterprise Work Management System (EWMS)

A monorepo for an enterprise-grade work management system.

## Tech Stack

| Layer     | Technology                                          |
|-----------|-----------------------------------------------------|
| Frontend  | React 18 + TypeScript + Vite + TailwindCSS + shadcn/ui |
| Backend   | FastAPI (Python 3.11) + SQLAlchemy + Alembic        |
| Database  | PostgreSQL 15                                       |
| Cache     | Redis 7                                             |
| Container | Docker + Docker Compose                             |
| Auth      | JWT (access token + refresh token)                  |

## Project Structure

```
/
├── frontend/               # React app (port 3000)
│   └── src/
│       ├── components/     # Shared UI components
│       ├── pages/          # Page components
│       ├── hooks/          # Custom hooks
│       ├── stores/         # Zustand state management
│       ├── services/       # API calls (axios)
│       ├── types/          # TypeScript interfaces
│       └── utils/
├── backend/                # FastAPI app (port 8000)
│   └── app/
│       ├── api/            # Route handlers
│       ├── core/           # Config, security
│       ├── models/         # SQLAlchemy models
│       ├── schemas/        # Pydantic schemas
│       ├── services/       # Business logic
│       └── db/             # Database session
├── docker-compose.yml
└── README.md
```

## Prerequisites

- Docker & Docker Compose v2+
- Node.js 20+ (local dev only)
- Python 3.11+ (local dev only)

## Quick Start (Docker)

### 1. Copy environment files

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

### 2. Start all services

```bash
docker compose up --build
```

### 3. Access services

| Service      | URL                          |
|--------------|------------------------------|
| Frontend     | http://localhost:3000        |
| Backend API  | http://localhost:8000        |
| API Docs     | http://localhost:8000/docs   |
| Health Check | http://localhost:8000/api/health |

## Local Development (without Docker)

### Backend

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy and configure env
cp .env.example .env

# Run database migrations
alembic upgrade head

# Start dev server
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Copy and configure env
cp .env.example .env

# Start dev server
npm run dev
```

## Database Migrations

```bash
# Create new migration
docker compose exec backend alembic revision --autogenerate -m "description"

# Apply migrations
docker compose exec backend alembic upgrade head

# Rollback one step
docker compose exec backend alembic downgrade -1
```

## Environment Variables

See `backend/.env.example` and `frontend/.env.example` for all available options.

## API Documentation

Interactive API docs available at:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc
