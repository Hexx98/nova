import uuid
from datetime import datetime
from typing import Any
from pydantic import BaseModel, field_validator
from app.models.engagement import EngagementStatus

CHECKLIST_KEYS = [
    "loa_uploaded",
    "roe_uploaded",
    "scope_confirmed",
    "emergency_contact_confirmed",
    "data_handling_acknowledged",
    "operator_assigned",
    "target_environment_noted",
    "notification_requirements_confirmed",
    "testing_window_confirmed",
    "legal_review_completed",
]

DEFAULT_CHECKLIST: dict[str, bool] = {k: False for k in CHECKLIST_KEYS}


class ScopeEntry(BaseModel):
    target: str
    type: str = "domain"  # domain | ip | cidr | url
    notes: str | None = None


class EngagementCreate(BaseModel):
    name: str
    target_domain: str
    scope: list[ScopeEntry]
    emergency_contact: str | None = None
    notes: str | None = None

    @field_validator("target_domain")
    @classmethod
    def no_protocol(cls, v: str) -> str:
        if v.startswith(("http://", "https://")):
            raise ValueError("target_domain should be a domain, not a URL")
        return v.lower().strip()


class EngagementUpdate(BaseModel):
    name: str | None = None
    status: EngagementStatus | None = None
    notes: str | None = None
    emergency_contact: str | None = None
    rules_of_engagement: dict[str, Any] | None = None
    scope: dict[str, Any] | None = None


class ChecklistUpdate(BaseModel):
    items: dict[str, bool]


class EngagementResponse(BaseModel):
    id: uuid.UUID
    name: str
    target_domain: str
    scope: dict | list
    status: EngagementStatus
    current_phase: int
    operator_id: uuid.UUID
    authorization_confirmed: bool
    loa_path: str | None
    roe_path: str | None
    folder_path: str | None
    start_date: datetime | None
    end_date: datetime | None
    created_at: datetime
    updated_at: datetime
    notes: str | None
    checklist: dict
    emergency_contact: str | None
    rules_of_engagement: dict | None

    model_config = {"from_attributes": True}


class PhaseSignOff(BaseModel):
    notes: str | None = None
