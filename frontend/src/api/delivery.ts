import { apiClient } from './client'

export type AuthMethod = 'none' | 'form' | 'cookie' | 'bearer' | 'basic'
export type DeliveryStatus = 'pending' | 'crawling' | 'complete' | 'approved'

export interface DiscoveredUrl {
  url: string
  method: string
  status_code: number
  content_type: string
  params: string[]
  forms: number
  in_scope: boolean
  excluded?: boolean
}

export interface CrawlStats {
  total_urls: number
  in_scope: number
  with_params: number
  with_forms: number
  post_endpoints: number
}

export interface DeliveryConfig {
  id: string
  auth_method: AuthMethod
  auth_config: Record<string, string>
  seed_urls: string[]
  include_patterns: string[]
  exclude_patterns: string[]
  max_depth: number
  max_pages: number
  render_js: boolean
  custom_headers: Record<string, string>
  status: DeliveryStatus
  crawl_stats: CrawlStats | null
  discovered_urls: DiscoveredUrl[]
  approved_by: string | null
  approved_at: string | null
  started_at: string | null
  completed_at: string | null
  operator_notes: string | null
}

export interface SaveConfigRequest {
  auth_method: AuthMethod
  auth_config: Record<string, string>
  seed_urls: string[]
  include_patterns: string[]
  exclude_patterns: string[]
  max_depth: number
  max_pages: number
  render_js: boolean
  custom_headers: Record<string, string>
}

export const deliveryApi = {
  getConfig: (engagementId: string) =>
    apiClient.get(`/api/engagements/${engagementId}/phases/3/config`).then(r => r.data),

  saveConfig: (engagementId: string, body: SaveConfigRequest) =>
    apiClient.put(`/api/engagements/${engagementId}/phases/3/config`, body).then(r => r.data),

  startCrawl: (engagementId: string) =>
    apiClient.post(`/api/engagements/${engagementId}/phases/3/crawl/start`).then(r => r.data),

  stopCrawl: (engagementId: string) =>
    apiClient.post(`/api/engagements/${engagementId}/phases/3/crawl/stop`).then(r => r.data),

  approve: (engagementId: string, excludedUrls: string[], notes?: string) =>
    apiClient
      .post(`/api/engagements/${engagementId}/phases/3/approve`, { excluded_urls: excludedUrls, notes })
      .then(r => r.data),

  reset: (engagementId: string) =>
    apiClient.post(`/api/engagements/${engagementId}/phases/3/reset`).then(r => r.data),
}
