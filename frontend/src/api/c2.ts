import { apiClient } from './client'

export type C2ChannelType = 'interactsh' | 'ssrf_callback' | 'xxe_oob' | 'blind_xss' | 'custom'

export interface C2Session {
  id: string
  channel_type: C2ChannelType
  label: string
  callback_url: string
  status: 'active' | 'terminated'
  interactions: Array<{
    ts: string
    source_ip: string
    method: string
    data_preview: string
    size_bytes: number
  }>
  notes: string | null
  created_at: string
  terminated_at: string | null
}

export const c2Api = {
  list: (id: string) =>
    apiClient.get(`/engagements/${id}/phases/6/sessions`).then(r => r.data),

  create: (id: string, body: {
    channel_type: C2ChannelType; label: string; callback_url: string; notes?: string
  }) => apiClient.post(`/engagements/${id}/phases/6/sessions`, body).then(r => r.data),

  logInteraction: (id: string, sessionId: string, body: {
    source_ip?: string; method?: string; data_preview?: string; size_bytes?: number
  }) => apiClient.post(`/engagements/${id}/phases/6/sessions/${sessionId}/interaction`, body).then(r => r.data),

  terminate: (id: string, sessionId: string) =>
    apiClient.post(`/engagements/${id}/phases/6/sessions/${sessionId}/terminate`).then(r => r.data),

  signOff: (id: string, notes?: string) =>
    apiClient.post(`/engagements/${id}/phases/6/sign-off`, { notes }).then(r => r.data),
}
