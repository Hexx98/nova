import uuid
from datetime import datetime
from pydantic import BaseModel


class AuditLogResponse(BaseModel):
    id: uuid.UUID
    engagement_id: uuid.UUID | None
    user_id: uuid.UUID | None
    action: str
    resource_type: str
    resource_id: str | None
    details: dict | None
    ip_address: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    email: str
    full_name: str
    password: str
    role: str = "operator"


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: str
    totp_enabled: bool
    is_active: bool
    created_at: datetime
    last_login: datetime | None

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    full_name: str | None = None
    role: str | None = None
    is_active: bool | None = None
