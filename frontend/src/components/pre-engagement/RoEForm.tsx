import { useState } from 'react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

export interface RulesOfEngagement {
  testing_window_start: string
  testing_window_end: string
  timezone: string
  environment: 'production' | 'staging' | 'development'
  max_requests_per_second: number
  destructive_testing: boolean
  dos_testing_allowed: boolean
  social_engineering_allowed: boolean
  excluded_paths: string[]
  excluded_ips: string[]
  client_notification_required: boolean
  notify_on_critical: boolean
  escalation_contact: string
  additional_notes: string
}

const DEFAULTS: RulesOfEngagement = {
  testing_window_start: '',
  testing_window_end: '',
  timezone: 'UTC',
  environment: 'staging',
  max_requests_per_second: 10,
  destructive_testing: false,
  dos_testing_allowed: false,
  social_engineering_allowed: false,
  excluded_paths: [],
  excluded_ips: [],
  client_notification_required: true,
  notify_on_critical: true,
  escalation_contact: '',
  additional_notes: '',
}

interface RoEFormProps {
  value: Partial<RulesOfEngagement>
  onSave: (roe: RulesOfEngagement) => Promise<void>
}

export function RoEForm({ value, onSave }: RoEFormProps) {
  const [roe, setRoe] = useState<RulesOfEngagement>({ ...DEFAULTS, ...value })
  const [excludedPathsRaw, setExcludedPathsRaw] = useState((value.excluded_paths ?? []).join('\n'))
  const [excludedIpsRaw, setExcludedIpsRaw] = useState((value.excluded_ips ?? []).join('\n'))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  function set<K extends keyof RulesOfEngagement>(key: K, val: RulesOfEngagement[K]) {
    setRoe((r) => ({ ...r, [key]: val }))
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    const full: RulesOfEngagement = {
      ...roe,
      excluded_paths: excludedPathsRaw.split('\n').map((s) => s.trim()).filter(Boolean),
      excluded_ips: excludedIpsRaw.split('\n').map((s) => s.trim()).filter(Boolean),
    }
    try {
      await onSave(full)
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Testing window */}
      <Section title="Testing Window">
        <div className="grid grid-cols-3 gap-4">
          <Input
            label="Start"
            type="datetime-local"
            value={roe.testing_window_start}
            onChange={(e) => set('testing_window_start', e.target.value)}
          />
          <Input
            label="End"
            type="datetime-local"
            value={roe.testing_window_end}
            onChange={(e) => set('testing_window_end', e.target.value)}
          />
          <Input
            label="Timezone"
            value={roe.timezone}
            onChange={(e) => set('timezone', e.target.value)}
            placeholder="UTC"
          />
        </div>
      </Section>

      {/* Environment & rate limiting */}
      <Section title="Environment & Rate Limiting">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider block mb-1.5">Target Environment</label>
            <select
              value={roe.environment}
              onChange={(e) => set('environment', e.target.value as RulesOfEngagement['environment'])}
              className="w-full px-3 py-2 text-sm bg-nova-elevated border border-nova-border rounded-md text-slate-100 focus:outline-none focus:ring-2 focus:ring-nova-accent"
            >
              <option value="production">Production</option>
              <option value="staging">Staging</option>
              <option value="development">Development</option>
            </select>
            {roe.environment === 'production' && (
              <p className="text-xs text-yellow-400 mt-1">⚠ Production environment — Nova will apply conservative defaults</p>
            )}
          </div>
          <Input
            label="Max requests per second"
            type="number"
            min={1}
            max={100}
            value={roe.max_requests_per_second}
            onChange={(e) => set('max_requests_per_second', Number(e.target.value))}
          />
        </div>
      </Section>

      {/* Permitted techniques */}
      <Section title="Permitted Techniques">
        <div className="grid grid-cols-3 gap-3">
          {([
            ['destructive_testing', 'Destructive testing', 'Allows write / delete operations on the target'],
            ['dos_testing_allowed', 'DoS testing', 'Allows availability testing (rate limits, timeouts)'],
            ['social_engineering_allowed', 'Social engineering', 'Allows phishing / pretexting within scope'],
          ] as [keyof RulesOfEngagement, string, string][]).map(([key, label, hint]) => (
            <label key={key} className="flex items-start gap-3 p-3 border border-nova-border rounded-lg cursor-pointer hover:bg-nova-elevated/40">
              <input
                type="checkbox"
                checked={roe[key] as boolean}
                onChange={(e) => set(key, e.target.checked)}
                className="mt-0.5 accent-nova-accent"
              />
              <div>
                <p className="text-sm text-slate-200">{label}</p>
                <p className="text-xs text-nova-muted">{hint}</p>
              </div>
            </label>
          ))}
        </div>
      </Section>

      {/* Exclusions */}
      <Section title="Exclusions">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Excluded paths (one per line)</label>
            <textarea
              value={excludedPathsRaw}
              onChange={(e) => { setExcludedPathsRaw(e.target.value); setSaved(false) }}
              placeholder={'/admin\n/backup\n/health'}
              rows={4}
              className="w-full px-3 py-2 text-sm bg-nova-elevated border border-nova-border rounded-md text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-nova-accent font-mono"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Excluded IPs (one per line)</label>
            <textarea
              value={excludedIpsRaw}
              onChange={(e) => { setExcludedIpsRaw(e.target.value); setSaved(false) }}
              placeholder={'10.0.0.1\n192.168.1.0/24'}
              rows={4}
              className="w-full px-3 py-2 text-sm bg-nova-elevated border border-nova-border rounded-md text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-nova-accent font-mono"
            />
          </div>
        </div>
      </Section>

      {/* Notifications */}
      <Section title="Notifications & Escalation">
        <div className="space-y-4">
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input type="checkbox" checked={roe.client_notification_required} onChange={(e) => set('client_notification_required', e.target.checked)} className="accent-nova-accent" />
              Client notification required
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input type="checkbox" checked={roe.notify_on_critical} onChange={(e) => set('notify_on_critical', e.target.checked)} className="accent-nova-accent" />
              Notify on critical findings
            </label>
          </div>
          <Input
            label="Escalation contact"
            value={roe.escalation_contact}
            onChange={(e) => set('escalation_contact', e.target.value)}
            placeholder="Name, phone, email"
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Additional notes</label>
            <textarea
              value={roe.additional_notes}
              onChange={(e) => { set('additional_notes', e.target.value) }}
              placeholder="Any other constraints, special requirements, or context..."
              rows={3}
              className="w-full px-3 py-2 text-sm bg-nova-elevated border border-nova-border rounded-md text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-nova-accent"
            />
          </div>
        </div>
      </Section>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} loading={saving}>Save Rules of Engagement</Button>
        {saved && <span className="text-sm text-emerald-400">✓ Saved</span>}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-nova-muted uppercase tracking-wider mb-3">{title}</h4>
      {children}
    </div>
  )
}
