import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'

const client = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

// Attach access token to every request
client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// On 401 — attempt token refresh then retry once
let isRefreshing = false
let refreshQueue: Array<(token: string) => void> = []

client.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error)
    }

    if (isRefreshing) {
      return new Promise((resolve) => {
        refreshQueue.push((token) => {
          original.headers.Authorization = `Bearer ${token}`
          resolve(client(original))
        })
      })
    }

    original._retry = true
    isRefreshing = true

    try {
      const refreshToken = localStorage.getItem('nova_refresh_token')
      if (!refreshToken) throw new Error('No refresh token')

      const { data } = await axios.post('/api/auth/refresh', { refresh_token: refreshToken })
      const newToken: string = data.access_token

      setAccessToken(newToken)
      localStorage.setItem('nova_refresh_token', data.refresh_token)

      refreshQueue.forEach((cb) => cb(newToken))
      refreshQueue = []

      original.headers.Authorization = `Bearer ${newToken}`
      return client(original)
    } catch {
      clearTokens()
      window.location.href = '/login'
      return Promise.reject(error)
    } finally {
      isRefreshing = false
    }
  },
)

// In-memory access token — not stored in localStorage
let _accessToken: string | null = null

export const getAccessToken = () => _accessToken
export const setAccessToken = (t: string) => { _accessToken = t }
export const clearTokens = () => {
  _accessToken = null
  localStorage.removeItem('nova_refresh_token')
}

export default client
