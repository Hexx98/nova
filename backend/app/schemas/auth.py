import uuid
from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TOTPVerifyRequest(BaseModel):
    temp_token: str
    totp_code: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TOTPPendingResponse(BaseModel):
    requires_totp: bool = True
    temp_token: str


class TOTPSetupResponse(BaseModel):
    secret: str
    qr_code: str  # base64 PNG


class TOTPEnrollRequest(BaseModel):
    totp_code: str  # confirm enrollment with first code


class RefreshRequest(BaseModel):
    refresh_token: str


class UserMe(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: str
    totp_enabled: bool

    model_config = {"from_attributes": True}
