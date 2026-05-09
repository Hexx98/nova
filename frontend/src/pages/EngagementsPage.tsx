import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { listEngagements, createEngagement, getPhases } from '@/api/engagements'
import { useEngagementStore } from '@/store/engagement'
import { EngagementStatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'

export function EngagementsPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { setActiveEngagement, setPhases } = useEngagementStore()
  const [showNew, setShowNew] = useState(false)

  const { data: engagements = [], isLoading } = useQuery({
    queryKey: ['engagements'],
    queryFn: listEngagements,
  })

  const create = useMutation({
    mutationFn: createEngagement,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['engagements'] }); setShowNew(false) },
  })

  async function handleOpen(id: string) {
    const eng = engagements.find((e) => e.id === id)!
    setActiveEngagement(eng)
    const phases = await getPhases(id)
    setPhases(phases)
    navigate(`/engagements/${id}`)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-100">Engagements</h1>
        <Button onClick={() => setShowNew(true)}>+ New Engagement</Button>
      </div>

      {showNew && <NewEngagementForm onCreate={create.mutateAsync} onCancel={() => setShowNew(false)} loading={create.isPending} />}

      <Card padding={false}>
        {isLoading ? (
          <div className="p-5 text-sm text-nova-muted">Loading...</div>
        ) : engagements.length === 0 ? (
          <div className="p-5 text-sm text-nova-muted">No engagements yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-nova-border">
                {['Name', 'Target', 'Status', 'Phase', 'Auth', 'Created'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-nova-muted uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-nova-border">
              {engagements.map((eng) => (
                <tr
                  key={eng.id}
                  onClick={() => handleOpen(eng.id)}
                  className="hover:bg-nova-elevated/50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-slate-200">{eng.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-nova-muted">{eng.target_domain}</td>
                  <td className="px-4 py-3"><EngagementStatusBadge status={eng.status} /></td>
                  <td className="px-4 py-3 text-nova-muted">{eng.current_phase}</td>
                  <td className="px-4 py-3">
                    {eng.authorization_confirmed ? (
                      <span className="text-xs text-emerald-400">✓ Confirmed</span>
                    ) : (
                      <span className="text-xs text-yellow-500">Pending</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-nova-muted">
                    {new Date(eng.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}

function NewEngagementForm({
  onCreate,
  onCancel,
  loading,
}: {
  onCreate: (data: Parameters<typeof createEngagement>[0]) => Promise<unknown>
  onCancel: () => void
  loading: boolean
}) {
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [scopeRaw, setScopeRaw] = useState('')
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const scopeTargets = scopeRaw
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)

    if (scopeTargets.length === 0) {
      setError('At least one scope target is required')
      return
    }

    try {
      await onCreate({
        name,
        target_domain: target,
        scope: scopeTargets.map((t) => ({ target: t, type: 'domain' })),
      })
    } catch {
      setError('Failed to create engagement')
    }
  }

  return (
    <Card>
      <h2 className="text-sm font-semibold text-slate-200 mb-4">New Engagement</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input label="Engagement Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Client Q4 2026" required />
          <Input label="Primary Target Domain" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="example.com" required />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Scope (one per line)</label>
          <textarea
            value={scopeRaw}
            onChange={(e) => setScopeRaw(e.target.value)}
            placeholder={'example.com\nstaging.example.com\napi.example.com'}
            rows={4}
            className="w-full px-3 py-2 text-sm bg-nova-elevated border border-nova-border rounded-md text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-nova-accent font-mono"
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex gap-3 justify-end">
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button type="submit" loading={loading}>Create Engagement</Button>
        </div>
      </form>
    </Card>
  )
}
