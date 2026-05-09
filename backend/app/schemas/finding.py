import uuid
from datetime import datetime
from pydantic import BaseModel
from app.models.finding import Severity, FindingStatus


class FindingCreate(BaseModel):
    title: str
    severity: Severity
    owasp_category: str | None = None
    attack_technique: str | None = None
    attack_chain: list | None = None
    description: str
    evidence: str | None = None
    proof_of_concept: str | None = None
    cvss_score: float | None = None
    cve_ids: list[str] | None = None
    tool: str | None = None
    phase: str | None = None
    remediation: str | None = None
    operator_notes: str | None = None


class FindingUpdate(BaseModel):
    title: str | None = None
    severity: Severity | None = None
    status: FindingStatus | None = None
    description: str | None = None
    evidence: str | None = None
    proof_of_concept: str | None = None
    remediation: str | None = None
    operator_notes: str | None = None


class FindingConfirm(BaseModel):
    confirmed: bool = True
    operator_notes: str | None = None


class FindingResponse(BaseModel):
    id: uuid.UUID
    engagement_id: uuid.UUID
    phase_id: uuid.UUID
    title: str
    severity: Severity
    status: FindingStatus
    owasp_category: str | None
    attack_technique: str | None
    description: str
    evidence: str | None
    proof_of_concept: str | None
    cvss_score: float | None
    cve_ids: list | None
    tool: str | None
    phase: str | None
    confirmed_by: uuid.UUID | None
    confirmed_at: datetime | None
    remediation: str | None
    operator_notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
