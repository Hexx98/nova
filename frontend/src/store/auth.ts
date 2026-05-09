import { create } from 'zustand'
import type { User } from '@/types'
import { getMe, refresh } from '@/api/auth'
import { setAccessToken, clearTokens } from '@/api/client'

interface AuthStore {
  user: User | null
  isAuthenticated: boolean
  isInitializing: boolean

  setSession: (accessToken: string, refreshToken: string, user: User) => void
  logout: () => void
  initialize: () => Promise<void>
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isAuthenticated: false,
  isInitializing: true,

  setSession(accessToken, refreshToken, user) {
    setAccessToken(accessToken)
    localStorage.setItem('nova_refresh_token', refreshToken)
    set({ user, isAuthenticated: true })
  },

  logout() {
    clearTokens()
    set({ user: null, isAuthenticated: false })
  },

  async initialize() {
    const refreshToken = localStorage.getItem('nova_refresh_token')

    if (!refreshToken) {
      set({ isInitializing: false })
      return
    }

    try {
      const tokens = await refresh(refreshToken)
      setAccessToken(tokens.access_token)
      localStorage.setItem('nova_refresh_token', tokens.refresh_token)

      const user = await getMe()
      set({ user, isAuthenticated: true })
    } catch {
      clearTokens()
    } finally {
      set({ isInitializing: false })
    }
  },
}))
