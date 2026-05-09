import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { listEngagements } from '@/api/engagements'
import { useEngagementStore } from '@/store/engagement'
import { Card, CardHeader } from '@/components/ui/Card'
import { EngagementStatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'

export function DashboardPage() {
  const navigate = useNavigate()
  const { setActiveEngagement } = useEngagementStore()

  const { data: engagements = [], isLoading } = useQuery({
    queryKey: ['engagements'],
    queryFn: listEngagements,
  })

  const active = engagements.filter((e) => e.status === 'active')
  const inSetup = engagements.filter((e) => e.status === 'setup')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-100">Dashboard</h1>
        <Button onClick={() => navigate('/engagements/new')}>+ New Engagement</Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Active Engagements" value={active.length} />
        <StatCard label="In Setup" value={inSetup.length} />
        <StatCard label="Total" value={engagements.length} />
      </div>

      {/* Active engagements */}
      <Card>
        <CardHeader
          title="Active Engagements"
          action={
            <Button variant="ghost" size="sm" onClick={() => navigate('/engagements')}>
              View all
            </Button>
          }
        />
        {isLoading ? (
          <div className="text-sm text-nova-muted py-4">Loading...</div>
        ) : active.length === 0 ? (
          <div className="text-sm text-nova-muted py-4">
            No active engagements.{' '}
            <button
              onClick={() => navigate('/engagements/new')}
              className="text-nova-accent hover:underline"
            >
              Start one
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {active.map((eng) => (
              <button
                key={eng.id}
                onClick={() => {
                  setActiveEngagement(eng)
                  navigate(`/engagements/${eng.id}`)
                }}
                className="w-full flex items-center justify-between p-3 bg-nova-elevated hover:bg-nova-border/50 rounded-md transition-colors text-left"
              >
                <div>
                  <p className="text-sm font-medium text-slate-200">{eng.name}</p>
                  <p className="text-xs font-mono text-nova-muted mt-0.5">{eng.target_domain}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-nova-muted">Phase {eng.current_phase}</span>
                  <EngagementStatusBadge status={eng.status} />
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <p className="text-2xl font-bold text-slate-100">{value}</p>
      <p className="text-xs text-nova-muted mt-1">{label}</p>
    </Card>
  )
}
