import client from './client'
import type { Engagement, Phase, Finding } from '@/types'

export async function listEngagements(): Promise<Engagement[]> {
  const { data } = await client.get('/engagements')
  return data
}

export async function getEngagement(id: string): Promise<Engagement> {
  const { data } = await client.get(`/engagements/${id}`)
  return data
}

export async function createEngagement(payload: {
  name: string
  target_domain: string
  scope: Array<{ target: string; type: string; notes?: string }>
  emergency_contact?: string
  notes?: string
}): Promise<Engagement> {
  const { data } = await client.post('/engagements', payload)
  return data
}

export async function getPhases(engagementId: string): Promise<Phase[]> {
  const { data } = await client.get(`/engagements/${engagementId}/phases`)
  return data
}

export async function startPhase(engagementId: string, phaseNumber: number) {
  const { data } = await client.post(`/engagements/${engagementId}/phases/${phaseNumber}/start`)
  return data
}

export async function signOffPhase(engagementId: string, phaseNumber: number, notes?: string) {
  const { data } = await client.post(
    `/engagements/${engagementId}/phases/${phaseNumber}/sign-off`,
    { notes },
  )
  return data
}

export async function listFindings(engagementId: string): Promise<Finding[]> {
  const { data } = await client.get(`/engagements/${engagementId}/findings`)
  return data
}

export async function updateChecklist(engagementId: string, items: Record<string, boolean>) {
  const { data } = await client.patch(`/engagements/${engagementId}/checklist`, { items })
  return data as Engagement
}

export async function updateEngagement(
  engagementId: string,
  payload: Partial<{
    name: string
    notes: string
    emergency_contact: string
    rules_of_engagement: Record<string, unknown>
    scope: Record<string, unknown>
  }>,
): Promise<Engagement> {
  const { data } = await client.patch(`/engagements/${engagementId}`, payload)
  return data
}

export async function uploadLoA(engagementId: string, file: File) {
  const form = new FormData()
  form.append('file', file)
  const { data } = await client.post(`/engagements/${engagementId}/loa`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function uploadRoE(engagementId: string, file: File) {
  const form = new FormData()
  form.append('file', file)
  const { data } = await client.post(`/engagements/${engagementId}/roe`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function confirmAuthorization(engagementId: string) {
  const { data } = await client.post(`/engagements/${engagementId}/authorize`)
  return data
}

export async function emergencyStop(engagementId: string) {
  const { data } = await client.post(`/engagements/${engagementId}/emergency-stop`)
  return data
}
