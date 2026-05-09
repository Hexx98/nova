import client from './client'

export interface ReconStatus {
  phase_status: string
  tool_status: Record<string, {
    status: 'pending' | 'running' | 'complete' | 'error' | 'cancelled'
    tier: number
    started_at: string | null
    completed_at: string | null
    error_message: string | null
    findings_count: number
  }>
  tier_5_gate: boolean
}

export async function getReconStatus(engagementId: string): Promise<ReconStatus> {
  const { data } = await client.get(`/engagements/${engagementId}/phases/1/recon/status`)
  return data
}

export async function startRecon(
  engagementId: string,
  enabledTools?: Record<string, boolean>,
): Promise<{ status: string; tools_scheduled: number }> {
  const { data } = await client.post(
    `/engagements/${engagementId}/phases/1/recon/start`,
    { enabled_tools: enabledTools ?? null },
  )
  return data
}

export async function approveTier5(engagementId: string, notes?: string) {
  const { data } = await client.post(
    `/engagements/${engagementId}/phases/1/recon/approve-tier5`,
    { notes },
  )
  return data
}

export async function pauseRecon(engagementId: string) {
  const { data } = await client.post(`/engagements/${engagementId}/phases/1/recon/pause`)
  return data
}

export async function signOffRecon(engagementId: string, techStack: string[], notes?: string) {
  const { data } = await client.post(
    `/engagements/${engagementId}/phases/1/recon/sign-off`,
    { tech_stack: techStack, notes },
  )
  return data
}
