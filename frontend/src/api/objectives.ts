import { apiClient } from './client'

export type BusinessImpact = 'critical' | 'high' | 'medium' | 'low'

export interface ObjectiveEntry {
  type: string
  title: string
  description: string
  evidence_preview: string
  impact: string
  finding_ids: string[]
}

export interface EngagementObjectives {
  id: string
  achieved_objectives: ObjectiveEntry[]
  business_impact: BusinessImpact | null
  impact_narrative: string | null
  executive_summary: string | null
  remediation_plan: Array<{ finding_id: string; title: string; priority: string; effort: string }>
  operator_notes: string | null
  approved_by: string | null
  approved_at: string | null
  updated_at: string | null
}

export const objectivesApi = {
  get: (id: string) =>
    apiClient.get(`/api/engagements/${id}/phases/7/objectives`).then(r => r.data),

  save: (id: string, body: Partial<{
    achieved_objectives: ObjectiveEntry[]
    business_impact: BusinessImpact
    impact_narrative: string
    executive_summary: string
    remediation_plan: EngagementObjectives['remediation_plan']
    operator_notes: string
  }>) => apiClient.put(`/api/engagements/${id}/phases/7/objectives`, body).then(r => r.data),

  autoPopulate: (id: string) =>
    apiClient.post(`/api/engagements/${id}/phases/7/objectives/auto-populate`).then(r => r.data),

  signOff: (id: string, notes?: string) =>
    apiClient.post(`/api/engagements/${id}/phases/7/sign-off`, { notes }).then(r => r.data),
}
