import { apiClient } from './client'

export interface AttackTask {
  id: string
  category: string
  technique: string
  description: string
  tool: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  cve_ref: string | null
  enabled: boolean
  params: Record<string, unknown>
  operator_notes?: string
}

export interface WordlistConfig {
  directory_wordlist: string
  password_wordlist: string
  username_wordlist: string
  custom_paths: string[]
  custom_passwords: string[]
}

export interface AttackPlan {
  id: string
  mode: 'ai_proposed' | 'customized' | 'manual'
  status: 'draft' | 'approved' | 'active' | 'complete'
  items: AttackTask[]
  cve_report: CveReport | null
  wordlist_config: Partial<WordlistConfig>
  operator_notes: string | null
  ai_generated_at: string | null
  approved_by: string | null
  approved_at: string | null
}

export interface PlanSummary {
  total_tasks: number
  by_priority: Record<string, number>
  by_category: Record<string, number>
  cve_targeted_tasks: number
}

export interface CveEntry {
  cve_id: string
  description: string
  cvss_score: number | null
  severity: string
  published: string
  references: string[]
}

export interface CveReport {
  by_technology: Record<string, CveEntry[]>
  total_cves: number
  critical_count: number
  high_count: number
}

export interface PlanResponse {
  plan: AttackPlan | null
  summary: PlanSummary | null
}

export const weaponizationApi = {
  getPlan: (engagementId: string): Promise<PlanResponse> =>
    apiClient.get(`/engagements/${engagementId}/phases/2/plan`).then(r => r.data),

  generatePlan: (engagementId: string): Promise<PlanResponse> =>
    apiClient.post(`/engagements/${engagementId}/phases/2/plan/generate`).then(r => r.data),

  updatePlan: (
    engagementId: string,
    body: { items?: AttackTask[]; operator_notes?: string; wordlist_config?: WordlistConfig; mode?: string }
  ) =>
    apiClient.patch(`/engagements/${engagementId}/phases/2/plan`, body).then(r => r.data),

  updateTask: (
    engagementId: string,
    taskId: string,
    body: { enabled?: boolean; priority?: string; params?: Record<string, unknown>; notes?: string }
  ) =>
    apiClient
      .patch(`/engagements/${engagementId}/phases/2/plan/tasks/${taskId}`, body)
      .then(r => r.data),

  approvePlan: (engagementId: string, notes?: string) =>
    apiClient
      .post(`/engagements/${engagementId}/phases/2/plan/approve`, { notes })
      .then(r => r.data),

  resetPlan: (engagementId: string) =>
    apiClient.post(`/engagements/${engagementId}/phases/2/plan/reset`).then(r => r.data),

  getCveReport: (engagementId: string): Promise<CveReport> =>
    apiClient.get(`/engagements/${engagementId}/phases/2/cve-report`).then(r => r.data),
}
