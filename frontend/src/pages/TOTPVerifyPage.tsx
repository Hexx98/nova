import { useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { verifyTotp, getMe } from '@/api/auth'
import { setAccessToken } from '@/api/client'

export function TOTPVerifyPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { setSession } = useAuthStore()

  const tempToken = (location.state as { tempToken?: string; email?: string })?.tempToken
  const email = (location.state as { email?: string })?.email

  const [digits, setDigits] = useState(['', '', '', '', '', ''])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const inputs = useRef<Array<HTMLInputElement | null>>([])

  if (!tempToken) {
    navigate('/login', { replace: true })
    return null
  }

  function handleDigit(index: number, value: string) {
    if (!/^\d?$/.test(value)) return
    const next = [...digits]
    next[index] = value
    setDigits(next)
    if (value && index < 5) inputs.current[index + 1]?.focus()
    if (next.every((d) => d !== '') && next.join('').length === 6) {
      submitCode(next.join(''))
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputs.current[index - 1]?.focus()
    }
  }

  async function submitCode(code: string) {
    setError('')
    setLoading(true)
    try {
      const tokens = await verifyTotp(tempToken!, code)
      setAccessToken(tokens.access_token)
      const user = await getMe()
      setSession(tokens.access_token, tokens.refresh_token, user)
      navigate('/dashboard', { replace: true })
    } catch {
      setError('Invalid code — try again')
      setDigits(['', '', '', '', '', ''])
      inputs.current[0]?.focus()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-nova-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-2xl font-bold text-nova-accent font-mono mb-1">◈ NOVA</div>
        </div>

        <div className="bg-nova-surface border border-nova-border rounded-xl p-7">
          <h1 className="text-base font-semibold text-slate-100 mb-1">Two-factor authentication</h1>
          {email && <p className="text-sm text-nova-muted mb-6">{email}</p>}

          <p className="text-sm text-slate-400 mb-6">
            Enter the 6-digit code from your authenticator app.
          </p>

          {/* 6-digit OTP input */}
          <div className="flex gap-2 justify-center mb-6">
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => { inputs.current[i] = el }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={d}
                onChange={(e) => handleDigit(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                autoFocus={i === 0}
                className="w-10 h-12 text-center text-lg font-mono font-semibold bg-nova-elevated border border-nova-border rounded-md text-slate-100 focus:outline-none focus:ring-2 focus:ring-nova-accent transition-colors"
              />
            ))}
          </div>

          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2 mb-4">
              {error}
            </div>
          )}

          {loading && (
            <div className="flex justify-center">
              <div className="w-5 h-5 border-2 border-nova-accent border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          <button
            onClick={() => navigate('/login')}
            className="mt-4 w-full text-xs text-nova-muted hover:text-slate-300 transition-colors"
          >
            ← Back to sign in
          </button>
        </div>
      </div>
    </div>
  )
}
