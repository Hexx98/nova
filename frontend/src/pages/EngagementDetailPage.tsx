import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getEngagement, getPhases, listFindings } from '@/api/engagements'
import { useEngagementStore } from '@/store/engagement'
import { PhaseStatusDot, SeverityBadge, EngagementStatusBadge } from '@/components/ui/Badge'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PHASE_NAMES, type Severity } from '@/types'

const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info']

export function EngagementDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { setActiveEngagement, setPhases } = useEngagementStore()

  const { data: engagement } = useQuery({
    queryKey: ['engagement', id],
    queryFn: () => getEngagement(id!),
    enabled: !!id,
  })

  const { data: phases = [] } = useQuery({
    queryKey: ['phases', id],
    queryFn: () => getPhases(id!),
    enabled: !!id,
  })

  const { data: findings = [] } = useQuery({
    queryKey: ['findings', id],
    queryFn: () => listFindings(id!),
    enabled: !!id,
  })

  useEffect(() => {
    if (engagement) setActiveEngagement(engagement)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engagement?.id])

  useEffect(() => {
    if (phases.length) setPhases(phases)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phases.length])

  if (!engagement) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-6 h-6 border-2 border-nova-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const findingsBySeverity = SEVERITY_ORDER.reduce<Record<Severity, number>>(
    (acc, sev) => ({ ...acc, [sev]: findings.filter((f) => f.severity === sev).length }),
    {} as Record<Severity, number>,
  )

  function goToPhase(phaseNumber: number) {
    navigate(`/engagements/${id}/phase/${phaseNumber}`)
  }

  return (
    <div className="space-y-6">
      {/* Engagement header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-xl font-semibold text-slate-100">{engagement.name}</h1>
            <EngagementStatusBadge status={engagement.status} />
          </div>
          <p className="text-sm font-mono text-nova-muted">{engagement.target_domain}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => goToPhase(engagement.current_phase)}>
          Continue → Phase {engagement.current_phase}
        </Button>
      </div>

      {/* Auth warning */}
      {!engagement.authorization_confirmed && (
        <div className="flex items-center gap-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
          <span className="text-yellow-400">⚠</span>
          <p className="text-sm text-yellow-300">
            Authorization not confirmed.{' '}
            <button onClick={() => goToPhase(0)} className="underline hover:text-yellow-100">
              Complete pre-engagement setup
            </button>{' '}
            before Phase 1 can begin.
          </p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        {/* Phase overview */}
        <div className="col-span-2">
          <Card>
            <CardHeader title="Kill Chain Progress" />
            <div className="space-y-1">
              {phases.map((phase) => (
                <button
                  key={phase.phase_number}
                  onClick={() => goToPhase(phase.phase_number)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-nova-elevated transition-colors text-left"
                >
                  <PhaseStatusDot status={phase.status} />
                  <span className="text-xs font-mono text-nova-muted w-4">{phase.phase_number}</span>
                  <span className="text-sm text-slate-300 flex-1">{PHASE_NAMES[phase.phase_number]}</span>
                  <span className={`text-xs ${
                    phase.status === 'complete' ? 'text-emerald-400' :
                    phase.status === 'in_progress' ? 'text-nova-accent' :
                    'text-nova-muted'
                  }`}>
                    {phase.status === 'complete' ? 'Complete' :
                     phase.status === 'in_progress' ? 'In progress' :
                     phase.status === 'skipped' ? 'Skipped' : 'Pending'}
                  </span>
                </button>
              ))}
            </div>
          </Card>
        </div>

        {/* Findings summary */}
        <div className="space-y-4">
          <Card>
            <CardHeader title="Findings" />
            {findings.length === 0 ? (
              <p className="text-sm text-nova-muted">No findings yet</p>
            ) : (
              <div className="space-y-2">
                {SEVERITY_ORDER.map((sev) => {
                  const count = findingsBySeverity[sev]
                  if (!count) return null
                  return (
                    <div key={sev} className="flex items-center justify-between">
                      <SeverityBadge severity={sev} />
                      <span className="text-sm font-semibold text-slate-200">{count}</span>
                    </div>
                  )
                })}
                <div className="border-t border-nova-border pt-2 flex justify-between text-xs text-nova-muted">
                  <span>Total</span>
                  <span className="font-semibold text-slate-300">{findings.length}</span>
                </div>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Details" />
            <div className="space-y-2 text-xs">
              <Row label="Operator" value={engagement.operator_id.slice(0, 8) + '...'} />
              <Row label="Auth" value={engagement.authorization_confirmed ? '✓ Confirmed' : 'Pending'} highlight={!engagement.authorization_confirmed} />
              <Row label="Created" value={new Date(engagement.created_at).toLocaleDateString()} />
              {engagement.start_date && <Row label="Started" value={new Date(engagement.start_date).toLocaleDateString()} />}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-nova-muted">{label}</span>
      <span className={highlight ? 'text-yellow-400' : 'text-slate-300'}>{value}</span>
    </div>
  )
}
