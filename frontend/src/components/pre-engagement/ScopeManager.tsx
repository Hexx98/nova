import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

export interface ScopeEntry {
  target: string
  type: 'domain' | 'ip' | 'cidr' | 'url'
  notes: string
}

interface ScopeManagerProps {
  entries: ScopeEntry[]
  onChange: (entries: ScopeEntry[]) => void
  saving?: boolean
}

const TYPE_COLORS: Record<ScopeEntry['type'], string> = {
  domain: 'bg-nova-accent/10 text-nova-accent border-nova-accent/20',
  ip:     'bg-purple-500/10 text-purple-400 border-purple-500/20',
  cidr:   'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  url:    'bg-blue-500/10 text-blue-400 border-blue-500/20',
}

export function ScopeManager({ entries, onChange, saving }: ScopeManagerProps) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<ScopeEntry>({ target: '', type: 'domain', notes: '' })

  function addEntry() {
    if (!draft.target.trim()) return
    onChange([...entries, { ...draft, target: draft.target.trim() }])
    setDraft({ target: '', type: 'domain', notes: '' })
    setAdding(false)
  }

  function removeEntry(i: number) {
    onChange(entries.filter((_, idx) => idx !== i))
  }

  return (
    <div className="space-y-3">
      {/* Scope table */}
      {entries.length > 0 && (
        <div className="border border-nova-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-nova-border bg-nova-elevated/50">
                <th className="text-left px-3 py-2 text-xs font-semibold text-nova-muted uppercase tracking-wider">Target</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-nova-muted uppercase tracking-wider">Type</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-nova-muted uppercase tracking-wider">Notes</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-nova-border">
              {entries.map((entry, i) => (
                <tr key={i} className="hover:bg-nova-elevated/30">
                  <td className="px-3 py-2.5 font-mono text-sm text-slate-200">{entry.target}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium border ${TYPE_COLORS[entry.type]}`}>
                      {entry.type}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-nova-muted text-xs">{entry.notes || '—'}</td>
                  <td className="px-2 py-2.5">
                    <button
                      onClick={() => removeEntry(i)}
                      className="text-nova-muted hover:text-red-400 transition-colors text-lg leading-none"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {entries.length === 0 && !adding && (
        <div className="border border-dashed border-nova-border rounded-lg p-4 text-center text-sm text-nova-muted">
          No scope entries defined yet.
        </div>
      )}

      {/* Add form */}
      {adding && (
        <div className="border border-nova-border rounded-lg p-4 space-y-3 bg-nova-elevated/30">
          <div className="grid grid-cols-5 gap-3">
            <div className="col-span-2">
              <Input
                label="Target"
                value={draft.target}
                onChange={(e) => setDraft({ ...draft, target: e.target.value })}
                placeholder="example.com"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider block mb-1.5">Type</label>
              <select
                value={draft.type}
                onChange={(e) => setDraft({ ...draft, type: e.target.value as ScopeEntry['type'] })}
                className="w-full px-3 py-2 text-sm bg-nova-elevated border border-nova-border rounded-md text-slate-100 focus:outline-none focus:ring-2 focus:ring-nova-accent"
              >
                <option value="domain">domain</option>
                <option value="ip">ip</option>
                <option value="cidr">cidr</option>
                <option value="url">url</option>
              </select>
            </div>
            <div className="col-span-2">
              <Input
                label="Notes (optional)"
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                placeholder="e.g. staging environment"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>Cancel</Button>
            <Button size="sm" onClick={addEntry} disabled={!draft.target.trim()}>Add</Button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <Button variant="secondary" size="sm" onClick={() => setAdding(true)} disabled={adding}>
          + Add scope entry
        </Button>
        {entries.length > 0 && (
          <span className="text-xs text-nova-muted">{entries.length} target{entries.length !== 1 ? 's' : ''} in scope</span>
        )}
      </div>
    </div>
  )
}
