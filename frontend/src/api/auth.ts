import client from './client'
import type { User } from '@/types'

export interface LoginResult {
  type: 'totp_pending' | 'totp_setup_required' | 'success'
  temp_token?: string
  access_token?: string
  refresh_token?: string
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const { data } = await client.post('/auth/login', { email, password })

  if (data.requires_totp) {
    return { type: 'totp_pending', temp_token: data.temp_token }
  }
  if (data.requires_totp_setup) {
    return { type: 'totp_setup_required', temp_token: data.temp_token }
  }
  return { type: 'success', access_token: data.access_token, refresh_token: data.refresh_token }
}

export async function verifyTotp(tempToken: string, totpCode: string) {
  const { data } = await client.post('/auth/totp/verify', {
    temp_token: tempToken,
    totp_code: totpCode,
  })
  return data as { access_token: string; refresh_token: string }
}

export async function getTotpSetup(tempToken: string) {
  const { data } = await client.post(
    '/auth/totp/setup',
    {},
    { headers: { Authorization: `Bearer ${tempToken}` } },
  )
  return data as { secret: string; qr_code: string }
}

export async function enrollTotp(tempToken: string, totpCode: string) {
  const { data } = await client.post(
    '/auth/totp/enroll',
    { totp_code: totpCode },
    { headers: { Authorization: `Bearer ${tempToken}` } },
  )
  return data as { access_token: string; refresh_token: string }
}

export async function getMe(): Promise<User> {
  const { data } = await client.get('/auth/me')
  return data
}

export async function refresh(refreshToken: string) {
  const { data } = await client.post('/auth/refresh', { refresh_token: refreshToken })
  return data as { access_token: string; refresh_token: string }
}
