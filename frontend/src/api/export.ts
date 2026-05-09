import { apiClient } from './client'

export interface ExportReadiness {
  phases_complete: string[]
  phases_incomplete: string[]
  engagement_complete: boolean
}

export interface ExportCounts {
  findings: number
  finding_counts: Record<string, number>
  artifacts: number
  c2_sessions: number
  attack_tasks: number
  target_urls: number
}

export interface ExportPreview {
  engagement: {
    id: string
    name: string
    target_domain: string
    status: string
    operator: string | null
    start_date: string | null
    end_date: string | null
  }
  exported_at: string
  titanux_configured: boolean
  titanux_url: string | null
  readiness: ExportReadiness
  counts: ExportCounts
  summary: {
    business_impact: string | null
    has_executive_summary: boolean
    objectives_count: number
  }
}

export const exportApi = {
  preview: (engagementId: string): Promise<ExportPreview> =>
    apiClient.get(`/api/engagements/${engagementId}/export/preview`).then(r => r.data),

  download: (engagementId: string) =>
    apiClient
      .get(`/api/engagements/${engagementId}/export/download`, { responseType: 'blob' })
      .then(r => {
        const disposition = r.headers['content-disposition'] ?? ''
        const match = disposition.match(/filename="([^"]+)"/)
        const filename = match ? match[1] : 'nova-export.json'
        const url = URL.createObjectURL(new Blob([r.data], { type: 'application/json' }))
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
        URL.revokeObjectURL(url)
      }),

  push: (
    engagementId: string,
    body?: { titanux_url?: string; api_key?: string }
  ): Promise<{ pushed: boolean; titanux_url: string; finding_count: number; exported_at: string; titanux_response: unknown }> =>
    apiClient
      .post(`/api/engagements/${engagementId}/export/push`, body ?? {})
      .then(r => r.data),
}
