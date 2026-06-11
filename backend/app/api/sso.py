import secrets
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.redis_client import store_sso_state, verify_and_consume_sso_state, store_refresh_token
from app.core.security import create_access_token
from app.db.session import get_db
from app.models.user import User

router = APIRouter(prefix="/auth/sso", tags=["sso"])


class SsoAuthorizeResponse(BaseModel):
    url: str


class SsoCallbackRequest(BaseModel):
    code: str
    state: str


class TokenPairResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


@router.get(
    "/authorize",
    response_model=SsoAuthorizeResponse,
    summary="Lấy URL đăng nhập SSO",
    description="Tạo state token và trả về URL để redirect người dùng đến WSO2.",
)
async def sso_authorize():
    state = secrets.token_urlsafe(32)
    await store_sso_state(state)

    params = urlencode({
        "response_type": "code",
        "client_id": settings.WSO2_CLIENT_ID,
        "redirect_uri": settings.SSO_REDIRECT_URI,
        "scope": "openid email profile",
        "state": state,
    })
    return SsoAuthorizeResponse(url=f"{settings.WSO2_BASE_URL}/oauth2/authorize?{params}")


@router.post(
    "/callback",
    response_model=TokenPairResponse,
    summary="Xử lý callback từ WSO2",
    description=(
        "Nhận authorization code và state từ frontend sau khi WSO2 redirect. "
        "Xác thực state, đổi code lấy token WSO2, lấy thông tin user, "
        "trả về JWT của hệ thống."
    ),
)
async def sso_callback(
    body: SsoCallbackRequest,
    db: AsyncSession = Depends(get_db),
):
    # 1. Verify & consume state — chống CSRF
    if not await verify_and_consume_sso_state(body.state):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng thử lại.",
        )

    verify_ssl = settings.SSO_VERIFY_SSL

    # 2. Đổi authorization code lấy access token từ WSO2
    try:
        async with httpx.AsyncClient(verify=verify_ssl, timeout=15.0) as client:
            token_resp = await client.post(
                f"{settings.WSO2_BASE_URL}/oauth2/token",
                data={
                    "grant_type": "authorization_code",
                    "code": body.code,
                    "redirect_uri": settings.SSO_REDIRECT_URI,
                },
                auth=(settings.WSO2_CLIENT_ID, settings.WSO2_CLIENT_SECRET),
            )
    except httpx.RequestError:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Không thể kết nối đến máy chủ SSO")

    if token_resp.status_code != 200:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            f"Máy chủ SSO từ chối xác thực (HTTP {token_resp.status_code})",
        )

    wso2_tokens = token_resp.json()
    wso2_access_token = wso2_tokens.get("access_token")
    if not wso2_access_token:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "SSO không trả về access token")

    # 3. Lấy thông tin người dùng từ WSO2 UserInfo
    try:
        async with httpx.AsyncClient(verify=verify_ssl, timeout=15.0) as client:
            userinfo_resp = await client.get(
                f"{settings.WSO2_BASE_URL}/oauth2/userinfo",
                headers={"Authorization": f"Bearer {wso2_access_token}"},
            )
    except httpx.RequestError:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Không thể lấy thông tin từ SSO")

    if userinfo_resp.status_code != 200:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "SSO không trả về thông tin người dùng")

    claims = userinfo_resp.json()
    email = claims.get("email")
    if not email:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "SSO không trả về email. Kiểm tra cấu hình scope trong WSO2 Service Provider.",
        )

    # 4. Tìm user trong DB — SSO không tự tạo user mới
    user = (await db.execute(
        select(User).where(User.email == email, User.deleted_at.is_(None))
    )).scalar_one_or_none()

    if not user:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Tài khoản chưa được đăng ký trong hệ thống. Vui lòng liên hệ quản trị viên.",
        )

    if not user.is_active:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Tài khoản đã bị vô hiệu hóa.",
        )

    # 5. Cấp JWT nội bộ — giống login thường
    access_token = create_access_token(str(user.id))
    refresh_token = await store_refresh_token(str(user.id))

    return TokenPairResponse(access_token=access_token, refresh_token=refresh_token)
