import client from './client'
import type { AuditEntry } from '@/types'

export async function getAuditLog(params: {
  engagement_id?: string
  limit?: number
  offset?: number
}): Promise<AuditEntry[]> {
  const { data } = await client.get('/audit', { params })
  return data
}

export interface TechniqueStatus {
  id: string
  name: string
  tactic: string
  tactic_id: string
  phase: number
  status: 'confirmed' | 'tested' | 'not_tested'
  finding_count: number
}

export async function getAttackCoverage(engagementId: string): Promise<TechniqueStatus[]> {
  const { data } = await client.get(`/engagements/${engagementId}/attack-coverage`)
  return data
}
