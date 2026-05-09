import { apiClient } from './client'

export type ArtifactType = 'web_shell' | 'backdoor_account' | 'stored_xss' | 'file_read' | 'db_access'

export interface Artifact {
  id: string
  artifact_type: ArtifactType
  target_host: string
  target_location: string
  payload_type: string
  status: 'active' | 'closed'
  deployed_at: string
  removed_at: string | null
  removal_verified: boolean
  verification_method: string | null
  evidence_ref: string | null
}

export const installationApi = {
  list: (id: string) =>
    apiClient.get(`/api/engagements/${id}/phases/5/artifacts`).then(r => r.data),

  log: (id: string, body: {
    artifact_type: ArtifactType
    target_host: string
    target_location: string
    payload_type: string
  }) => apiClient.post(`/api/engagements/${id}/phases/5/artifacts`, body).then(r => r.data),

  remove: (id: string, artifactId: string, body: { verification_method: string; evidence_ref?: string }) =>
    apiClient.post(`/api/engagements/${id}/phases/5/artifacts/${artifactId}/remove`, body).then(r => r.data),

  signOff: (id: string, notes?: string) =>
    apiClient.post(`/api/engagements/${id}/phases/5/sign-off`, { notes }).then(r => r.data),
}
