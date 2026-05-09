import type { AuthMethod } from '@/api/delivery'

interface Props {
  method: AuthMethod
  config: Record<string, string>
  editable: boolean
  onMethodChange: (method: AuthMethod) => void
  onConfigChange: (config: Record<string, string>) => void
}

const METHODS: { value: AuthMethod; label: string; description: string }[] = [
  { value: 'none',    label: 'None',         description: 'Unauthenticated scanning only' },
  { value: 'form',    label: 'Login Form',   description: 'POST credentials to login URL' },
  { value: 'cookie',  label: 'Session Cookie', description: 'Paste an existing session cookie' },
  { value: 'bearer',  label: 'Bearer Token', description: 'Authorization: Bearer <token>' },
  { value: 'basic',   label: 'Basic Auth',   description: 'HTTP Basic authentication' },
]

function Field({ label, name, value, type = 'text', placeholder, disabled, onChange }: {
  label: string; name: string; value: string; type?: string
  placeholder?: string; disabled: boolean; onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">{label}</label>
      <input
        type={type}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-600 disabled:opacity-50"
      />
    </div>
  )
}

export function AuthConfigPanel({ method, config, editable, onMethodChange, onConfigChange }: Props) {
  const set = (key: string, val: string) => onConfigChange({ ...config, [key]: val })

  return (
    <div className="space-y-4">
      {/* Method selector */}
      <div>
        <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">
          Authentication Method
        </label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {METHODS.map(m => (
            <button
              key={m.value}
              disabled={!editable}
              onClick={() => onMethodChange(m.value)}
              className={`text-left p-3 rounded border transition-colors disabled:cursor-default ${
                method === m.value
                  ? 'border-cyan-600 bg-cyan-900/20 text-cyan-300'
                  : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600 hover:text-slate-200'
              }`}
            >
              <div className="text-sm font-medium">{m.label}</div>
              <div className="text-xs mt-0.5 opacity-70">{m.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Method-specific fields */}
      {method === 'form' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <Field label="Login URL" name="login_url" value={config.login_url ?? ''} placeholder="https://target.com/login" disabled={!editable} onChange={v => set('login_url', v)} />
          </div>
          <Field label="Username Field" name="username_field" value={config.username_field ?? 'username'} disabled={!editable} onChange={v => set('username_field', v)} />
          <Field label="Password Field" name="password_field" value={config.password_field ?? 'password'} disabled={!editable} onChange={v => set('password_field', v)} />
          <Field label="Username" name="username" value={config.username ?? ''} placeholder="testuser@target.com" disabled={!editable} onChange={v => set('username', v)} />
          <Field label="Password" name="password" type="password" value={config.password ?? ''} placeholder="••••••••" disabled={!editable} onChange={v => set('password', v)} />
          <div className="md:col-span-2">
            <Field label="Success Pattern (regex)" name="success_pattern" value={config.success_pattern ?? ''} placeholder="dashboard|welcome|logout" disabled={!editable} onChange={v => set('success_pattern', v)} />
          </div>
        </div>
      )}

      {method === 'cookie' && (
        <div>
          <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Session Cookie</label>
          <textarea
            value={config.cookie_header ?? ''}
            disabled={!editable}
            onChange={e => set('cookie_header', e.target.value)}
            rows={3}
            placeholder="sessionid=abc123; csrftoken=xyz..."
            className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 font-mono placeholder-slate-600 disabled:opacity-50 resize-none"
          />
          <p className="text-xs text-slate-500 mt-1">Paste the full Cookie header value from browser DevTools.</p>
        </div>
      )}

      {method === 'bearer' && (
        <Field label="Bearer Token" name="token" type="password" value={config.token ?? ''} placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." disabled={!editable} onChange={v => set('token', v)} />
      )}

      {method === 'basic' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Username" name="username" value={config.username ?? ''} disabled={!editable} onChange={v => set('username', v)} />
          <Field label="Password" name="password" type="password" value={config.password ?? ''} disabled={!editable} onChange={v => set('password', v)} />
        </div>
      )}
    </div>
  )
}
