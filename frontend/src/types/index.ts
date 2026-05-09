export type UserRole = 'admin' | 'lead_operator' | 'operator' | 'observer'
export type EngagementStatus = 'setup' | 'active' | 'paused' | 'complete' | 'archived'
export type PhaseStatus = 'pending' | 'in_progress' | 'complete' | 'skipped'
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info'
export type FindingStatus = 'open' | 'accepted' | 'resolved'

export interface User {
  id: string
  email: string
  full_name: string
  role: UserRole
  totp_enabled: boolean
}

export interface Engagement {
  id: string
  name: string
  target_domain: string
  scope: Record<string, unknown>
  status: EngagementStatus
  current_phase: number
  operator_id: string
  authorization_confirmed: boolean
  loa_path: string | null
  roe_path: string | null
  folder_path: string | null
  checklist?: Record<string, boolean>
  rules_of_engagement?: Record<string, unknown>
  start_date: string | null
  end_date: string | null
  created_at: string
  updated_at: string
  notes: string | null
}

export interface Phase {
  id: string
  engagement_id: string
  phase_number: number
  name: string
  status: PhaseStatus
  started_at: string | null
  completed_at: string | null
  operator_sign_off: boolean
  sign_off_at: string | null
  signed_off_by: string | null
  summary: string | null
  executive_summary: string | null
}

export interface Finding {
  id: string
  engagement_id: string
  phase_id: string
  title: string
  severity: Severity
  status: FindingStatus
  owasp_category: string | null
  attack_technique: string | null
  description: string
  evidence: string | null
  proof_of_concept: string | null
  cvss_score: number | null
  cve_ids: string[] | null
  tool: string | null
  phase: string | null
  confirmed_by: string | null
  confirmed_at: string | null
  remediation: string | null
  operator_notes: string | null
  created_at: string
  updated_at: string
}

export interface AuditEntry {
  id: string
  engagement_id: string | null
  user_id: string | null
  action: string
  resource_type: string
  resource_id: string | null
  details: Record<string, unknown> | null
  ip_address: string | null
  created_at: string
}

export const PHASE_NAMES: Record<number, string> = {
  0: 'Pre-Engagement',
  1: 'Reconnaissance',
  2: 'Weaponization',
  3: 'Delivery',
  4: 'Exploitation',
  5: 'Installation',
  6: 'C2',
  7: 'Actions on Objectives',
}
