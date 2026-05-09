import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { getTotpSetup, enrollTotp, getMe } from '@/api/auth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

export function TOTPSetupPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { setSession } = useAuthStore()

  const tempToken = (location.state as { tempToken?: string })?.tempToken
  const [qrCode, setQrCode] = useState('')
  const [secret, setSecret] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    if (!tempToken) { navigate('/login', { replace: true }); return }
    getTotpSetup(tempToken)
      .then(({ qr_code, secret: s }) => { setQrCode(qr_code); setSecret(s) })
      .catch(() => navigate('/login', { replace: true }))
      .finally(() => setFetching(false))
  }, [tempToken, navigate])

  async function handleEnroll(e: React.FormEvent) {
    e.preventDefault()
    if (code.length !== 6) { setError('Enter the 6-digit code from your authenticator app'); return }
    setError('')
    setLoading(true)
    try {
      const tokens = await enrollTotp(tempToken!, code)
      const user = await getMe()
      setSession(tokens.access_token, tokens.refresh_token, user)
      navigate('/dashboard', { replace: true })
    } catch {
      setError('Invalid code — try again')
    } finally {
      setLoading(false)
    }
  }

  if (fetching) {
    return (
      <div className="min-h-screen bg-nova-bg flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-nova-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-nova-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-2xl font-bold text-nova-accent font-mono mb-1">◈ NOVA</div>
        </div>

        <div className="bg-nova-surface border border-nova-border rounded-xl p-7">
          <h1 className="text-base font-semibold text-slate-100 mb-1">Set up two-factor authentication</h1>
          <p className="text-sm text-nova-muted mb-6">MFA is required for all Nova accounts. Scan the QR code with your authenticator app.</p>

          {/* QR code */}
          <div className="flex justify-center mb-4">
            <div className="bg-white p-3 rounded-lg">
              <img
                src={`data:image/png;base64,${qrCode}`}
                alt="TOTP QR code"
                className="w-40 h-40"
              />
            </div>
          </div>

          {/* Manual entry secret */}
          <div className="mb-5">
            <p className="text-xs text-nova-muted mb-1.5">Can't scan? Enter this key manually:</p>
            <div
              className="font-mono text-xs text-nova-accent bg-nova-elevated border border-nova-border rounded px-3 py-2 cursor-pointer select-all break-all"
              title="Click to select"
            >
              {secret}
            </div>
          </div>

          <form onSubmit={handleEnroll} className="space-y-4">
            <Input
              label="Verification code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              autoFocus
              className="text-center text-lg tracking-widest font-mono"
            />

            {error && (
              <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" loading={loading}>
              Activate MFA &amp; Sign in
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
