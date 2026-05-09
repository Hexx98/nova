import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getAttackCoverage, type TechniqueStatus } from '@/api/audit'
import { Card, CardHeader } from '@/components/ui/Card'
import { PHASE_NAMES } from '@/types'

// Render order for tactics (kill-chain sequence)
const TACTIC_ORDER = ['TA0043', 'TA0042', 'TA0001', 'TA0002', 'TA0003', 'TA0006', 'TA0007', 'TA0009', 'TA0010', 'TA0011']

function statusStyle(status: TechniqueStatus['status']): string {
  switch (status) {
    case 'confirmed':  return 'bg-red-500/20 border-red-500/50 text-red-300'
    case 'tested':     return 'bg-amber-500/15 border-amber-500/40 text-amber-300'
    case 'not_tested': return 'bg-nova-elevated border-nova-border text-nova-muted'
  }
}

function statusLabel(status: TechniqueStatus['status']): string {
  switch (status) {
    case 'confirmed':  return 'Confirmed'
    case 'tested':     return 'Tested'
    case 'not_tested': return 'Not tested'
  }
}

function statusDot(status: TechniqueStatus['status']): string {
  switch (status) {
    case 'confirmed':  return 'bg-red-400'
    case 'tested':     return 'bg-amber-400'
    case 'not_tested': return 'bg-slate-600'
  }
}

function TechniqueCard({ t }: { t: TechniqueStatus }) {
  return (
    <div
      className={`relative border rounded-md px-3 py-2.5 text-xs transition-colors ${statusStyle(t.status)}`}
      title={`${t.id} — ${statusLabel(t.status)}${t.finding_count > 0 ? ` (${t.finding_count} finding${t.finding_count > 1 ? 's' : ''})` : ''}`}
    >
      <div className="flex items-start justify-between gap-1 mb-1">
        <span className="font-mono text-[10px] opacity-70">{t.id}</span>
        {t.finding_count > 0 && (
          <span className="text-[10px] font-bold text-red-300 shrink-0">{t.finding_count}</span>
        )}
      </div>
      <p className="leading-tight font-medium">{t.name}</p>
      <p className="text-[10px] opacity-60 mt-0.5">{PHASE_NAMES[t.phase]}</p>
    </div>
  )
}

function Legend() {
  return (
    <div className="flex items-center gap-5 text-xs text-nova-muted">
      {(['confirmed', 'tested', 'not_tested'] as const).map((s) => (
        <div key={s} className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${statusDot(s)}`} />
          {statusLabel(s)}
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-bold text-red-300">N</span>
        = finding count
      </div>
    </div>
  )
}

export function AttackHeatmapPage() {
  const { id: engagementId } = useParams<{ id: string }>()

  const { data: coverage = [], isLoading } = useQuery({
    queryKey: ['attack-coverage', engagementId],
    queryFn: () => getAttackCoverage(engagementId!),
    enabled: !!engagementId,
  })

  // Group techniques by tactic, preserving TACTIC_ORDER
  const byTactic = new Map<string, { name: string; techniques: TechniqueStatus[] }>()
  for (const t of coverage) {
    if (!byTactic.has(t.tactic_id)) {
      byTactic.set(t.tactic_id, { name: t.tactic, techniques: [] })
    }
    byTactic.get(t.tactic_id)!.techniques.push(t)
  }

  const orderedTactics = TACTIC_ORDER
    .filter((id) => byTactic.has(id))
    .map((id) => ({ tactic_id: id, ...byTactic.get(id)! }))

  // Summary counts
  const confirmed  = coverage.filter((t) => t.status === 'confirmed').length
  const tested     = coverage.filter((t) => t.status === 'tested').length
  const notTested  = coverage.filter((t) => t.status === 'not_tested').length
  const totalFindings = coverage.reduce((s, t) => s + t.finding_count, 0)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-6 h-6 border-2 border-nova-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">MITRE ATT&CK Coverage</h1>
          <p className="text-xs text-nova-muted mt-0.5">
            Techniques tested across the kill chain, mapped to confirmed findings
          </p>
        </div>
        <Legend />
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Confirmed', value: confirmed,    color: 'text-red-400' },
          { label: 'Tested',    value: tested,       color: 'text-amber-400' },
          { label: 'Not Tested',value: notTested,    color: 'text-slate-500' },
          { label: 'Findings',  value: totalFindings,color: 'text-nova-accent' },
        ].map(({ label, value, color }) => (
          <Card key={label} className="text-center py-3">
            <p className={`text-2xl font-bold font-mono ${color}`}>{value}</p>
            <p className="text-[11px] text-nova-muted mt-0.5 uppercase tracking-wider">{label}</p>
          </Card>
        ))}
      </div>

      {/* Heatmap grid — one section per tactic */}
      {orderedTactics.map(({ tactic_id, name, techniques }) => (
        <Card key={tactic_id}>
          <CardHeader
            title={name}
            action={<span className="text-[10px] font-mono text-nova-muted">{tactic_id}</span>}
          />
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
            {techniques.map((t) => (
              <TechniqueCard key={t.id} t={t} />
            ))}
          </div>
        </Card>
      ))}

      {coverage.length === 0 && (
        <Card>
          <p className="text-sm text-nova-muted text-center py-8">
            No engagement data yet — run phases to populate the heatmap.
          </p>
        </Card>
      )}
    </div>
  )
}
