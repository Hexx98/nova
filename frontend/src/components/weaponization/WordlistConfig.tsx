import type { WordlistConfig } from '@/api/weaponization'
import { WORDLIST_OPTIONS } from '@/config/weaponization'

interface Props {
  config: WordlistConfig
  editable: boolean
  onChange: (updated: WordlistConfig) => void
}

export function WordlistConfigPanel({ config, editable, onChange }: Props) {
  const update = (key: keyof WordlistConfig, value: unknown) =>
    onChange({ ...config, [key]: value })

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Directory wordlist */}
        <div>
          <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">
            Directory / Path Wordlist
          </label>
          <select
            value={config.directory_wordlist}
            disabled={!editable}
            onChange={e => update('directory_wordlist', e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 disabled:opacity-50"
          >
            {WORDLIST_OPTIONS.directory.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Password wordlist */}
        <div>
          <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">
            Password Wordlist
          </label>
          <select
            value={config.password_wordlist}
            disabled={!editable}
            onChange={e => update('password_wordlist', e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 disabled:opacity-50"
          >
            {WORDLIST_OPTIONS.password.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Username wordlist */}
        <div>
          <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">
            Username Wordlist
          </label>
          <select
            value={config.username_wordlist}
            disabled={!editable}
            onChange={e => update('username_wordlist', e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 disabled:opacity-50"
          >
            {WORDLIST_OPTIONS.username.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Custom paths */}
      <div>
        <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">
          Custom Paths (one per line)
        </label>
        <textarea
          value={(config.custom_paths ?? []).join('\n')}
          disabled={!editable}
          onChange={e =>
            update('custom_paths', e.target.value.split('\n').map(s => s.trim()).filter(Boolean))
          }
          rows={4}
          placeholder="/admin&#10;/api/v1&#10;/.env"
          className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 font-mono placeholder-slate-600 disabled:opacity-50 resize-none"
        />
      </div>

      {/* Custom passwords */}
      <div>
        <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">
          Custom Passwords (one per line)
        </label>
        <textarea
          value={(config.custom_passwords ?? []).join('\n')}
          disabled={!editable}
          onChange={e =>
            update('custom_passwords', e.target.value.split('\n').map(s => s.trim()).filter(Boolean))
          }
          rows={4}
          placeholder="Company2024!&#10;Summer2024"
          className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 font-mono placeholder-slate-600 disabled:opacity-50 resize-none"
        />
        <p className="text-xs text-slate-500 mt-1">
          Target-specific passwords (from OSINT, breach data, company naming patterns).
        </p>
      </div>
    </div>
  )
}
