import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { login, getMe } from '@/api/auth'
import { setAccessToken } from '@/api/client'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { setSession } = useAuthStore()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await login(email, password)

      if (result.type === 'totp_pending') {
        navigate('/auth/totp/verify', { state: { tempToken: result.temp_token, email } })
        return
      }

      if (result.type === 'totp_setup_required') {
        navigate('/auth/totp/setup', { state: { tempToken: result.temp_token, email } })
        return
      }

      // Direct success (should not happen in practice — TOTP always required)
      setAccessToken(result.access_token!)
      localStorage.setItem('nova_refresh_token', result.refresh_token!)
      const user = await getMe()
      setSession(result.access_token!, result.refresh_token!, user)
      navigate('/dashboard', { replace: true })
    } catch {
      setError('Invalid email or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-nova-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-3xl font-bold text-nova-accent font-mono mb-1">◈ NOVA</div>
          <p className="text-sm text-nova-muted">Web App Penetration Testing Platform</p>
        </div>

        <div className="bg-nova-surface border border-nova-border rounded-xl p-7">
          <h1 className="text-base font-semibold text-slate-100 mb-6">Sign in to Nova</h1>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email"
              type="email"
              placeholder="operator@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            {error && (
              <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" loading={loading}>
              Continue
            </Button>
          </form>

          <p className="mt-4 text-center text-xs text-nova-muted">
            MFA required on all accounts
          </p>
        </div>
      </div>
    </div>
  )
}
