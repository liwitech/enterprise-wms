from typing import List
from pydantic_settings import BaseSettings
from pydantic import field_validator


class Settings(BaseSettings):
    PROJECT_NAME: str = "Enterprise Work Management System"
    VERSION: str = "0.1.0"
    API_PREFIX: str = "/api"

    DATABASE_URL: str = "postgresql+asyncpg://ewms:ewms_password@localhost:5432/ewms_db"
    REDIS_URL: str = "redis://localhost:6379/0"

    SECRET_KEY: str = "change-me-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480   # 8 hours
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:5173"]

    # WSO2 SSO
    WSO2_BASE_URL: str = "https://login-test.hyundai.thanhcong.vn"
    WSO2_CLIENT_ID: str = ""
    WSO2_CLIENT_SECRET: str = ""
    SSO_REDIRECT_URI: str = "http://localhost:3000/auth/callback"
    SSO_VERIFY_SSL: bool = False  # False for test env with self-signed cert

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        if isinstance(v, str):
            import json
            return json.loads(v)
        return v

    model_config = {"env_file": ".env", "case_sensitive": True}


settings = Settings()
