import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getEngagement, getPhases, uploadLoA, uploadRoE,
  confirmAuthorization, updateEngagement, updateChecklist, signOffPhase, startPhase,
} from '@/api/engagements'
import { useEngagementStore } from '@/store/engagement'
import { DocUpload } from '@/components/pre-engagement/DocUpload'
import { ScopeManager, type ScopeEntry } from '@/components/pre-engagement/ScopeManager'
import { RoEForm, type RulesOfEngagement } from '@/components/pre-engagement/RoEForm'
import { PreEngagementChecklist, CHECKLIST_ITEMS } from '@/components/pre-engagement/PreEngagementChecklist'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import clsx from 'clsx'

const TABS = ['Authorization Docs', 'Scope', 'Rules of Engagement', 'Checklist & Sign-Off'] as const
type Tab = typeof TABS[number]

export function PreEngagementPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { setActiveEngagement, setPhases } = useEngagementStore()
  const [activeTab, setActiveTab] = useState<Tab>('Authorization Docs')
  const [authorizing, setAuthorizing] = useState(false)
  const [proceedingToPhase1, setProceedingToPhase1] = useState(false)

  const { data: engagement, isLoading } = useQuery({
    queryKey: ['engagement', id],
    queryFn: () => getEngagement(id!),
    enabled: !!id,
  })

  const { data: phases = [] } = useQuery({
    queryKey: ['phases', id],
    queryFn: () => getPhases(id!),
    enabled: !!id,
  })

  // Sync active engagement and phases to store — depend on ID/count, not object references
  useEffect(() => {
    if (engagement) setActiveEngagement(engagement)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engagement?.id])

  useEffect(() => {
    if (phases.length) setPhases(phases)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phases.length])

  const checklistMut = useMutation({
    mutationFn: (items: Record<string, boolean>) => updateChecklist(id!, items),
    onSuccess: (data) => qc.setQueryData(['engagement', id], data),
  })

  const updateEngMut = useMutation({
    mutationFn: (payload: Parameters<typeof updateEngagement>[1]) => updateEngagement(id!, payload),
    onSuccess: (data) => qc.setQueryData(['engagement', id], data),
  })

  if (isLoading || !engagement) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-6 h-6 border-2 border-nova-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const checklist = engagement.checklist as Record<string, boolean> ?? {}
  const allChecked = CHECKLIST_ITEMS.every((item) => checklist[item.key])
  const phase0 = phases.find((p) => p.phase_number === 0)

  async function handleToggleChecklist(key: string, value: boolean) {
    await checklistMut.mutateAsync({ ...checklist, [key]: value })
  }

  async function handleConfirmAuthorization() {
    setAuthorizing(true)
    try {
      await confirmAuthorization(id!)
      qc.invalidateQueries({ queryKey: ['engagement', id] })
    } finally {
      setAuthorizing(false)
    }
  }

  async function handleProceedToPhase1() {
    setProceedingToPhase1(true)
    try {
      // Sign off Phase 0
      await signOffPhase(id!, 0, 'Pre-engagement setup complete')
      // Start Phase 1
      await startPhase(id!, 1)
      const updatedPhases = await getPhases(id!)
      setPhases(updatedPhases)
      qc.invalidateQueries({ queryKey: ['engagement', id] })
      navigate(`/engagements/${id}/phase/1`)
    } finally {
      setProceedingToPhase1(false)
    }
  }

  function getScopeEntries(): ScopeEntry[] {
    const raw = engagement!.scope as { entries?: ScopeEntry[] }
    return raw?.entries ?? []
  }

  async function handleScopeChange(entries: ScopeEntry[]) {
    await updateEngMut.mutateAsync({
      scope: { entries },
    })
  }

  async function handleRoESave(roe: RulesOfEngagement) {
    await updateEngMut.mutateAsync({ rules_of_engagement: roe as unknown as Record<string, unknown> })
  }

  const canProceed = allChecked && engagement.authorization_confirmed

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Pre-Engagement Setup</h1>
          <p className="text-sm text-nova-muted mt-0.5">
            {engagement.name} — <span className="font-mono">{engagement.target_domain}</span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          {engagement.authorization_confirmed ? (
            <div className="flex items-center gap-1.5 text-sm text-emerald-400">
              <span>✓</span> Authorization confirmed
            </div>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleConfirmAuthorization}
              loading={authorizing}
              disabled={!engagement.loa_path || !engagement.roe_path}
              title={!engagement.loa_path || !engagement.roe_path ? 'Upload LoA and RoE first' : undefined}
            >
              Confirm Authorization
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-nova-border">
        <div className="flex gap-0">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={clsx(
                'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
                activeTab === tab
                  ? 'border-nova-accent text-nova-accent'
                  : 'border-transparent text-nova-muted hover:text-slate-300',
              )}
            >
              {tab}
              {tab === 'Checklist & Sign-Off' && (
                <span className={clsx(
                  'ml-2 text-xs px-1.5 py-0.5 rounded-full',
                  allChecked ? 'bg-emerald-500/20 text-emerald-400' : 'bg-nova-elevated text-nova-muted',
                )}>
                  {CHECKLIST_ITEMS.filter((i) => checklist[i.key]).length}/{CHECKLIST_ITEMS.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <Card>
        {activeTab === 'Authorization Docs' && (
          <div className="space-y-6">
            <p className="text-sm text-slate-400">
              Both documents are required before authorization can be confirmed and Phase 1 can begin.
            </p>
            <DocUpload
              label="Letter of Authorization (LoA)"
              description="Signed authorization from the client permitting this engagement"
              currentPath={engagement.loa_path}
              onUpload={(file) => uploadLoA(id!, file).then(() => qc.invalidateQueries({ queryKey: ['engagement', id] }))}
            />
            <div className="border-t border-nova-border" />
            <DocUpload
              label="Rules of Engagement (RoE)"
              description="Signed document defining scope, constraints, and testing boundaries"
              currentPath={engagement.roe_path}
              onUpload={(file) => uploadRoE(id!, file).then(() => qc.invalidateQueries({ queryKey: ['engagement', id] }))}
            />
          </div>
        )}

        {activeTab === 'Scope' && (
          <div className="space-y-4">
            <p className="text-sm text-slate-400">
              Define all in-scope targets. These are cryptographically hashed and stored in the audit log.
              Nova will reject tool execution against any target not listed here.
            </p>
            <ScopeManager
              entries={getScopeEntries()}
              onChange={handleScopeChange}
              saving={updateEngMut.isPending}
            />
          </div>
        )}

        {activeTab === 'Rules of Engagement' && (
          <div className="space-y-4">
            <p className="text-sm text-slate-400">
              Define testing constraints. These settings gate what Nova is permitted to execute.
            </p>
            <RoEForm
              value={(engagement.rules_of_engagement as Partial<RulesOfEngagement>) ?? {}}
              onSave={handleRoESave}
            />
          </div>
        )}

        {activeTab === 'Checklist & Sign-Off' && (
          <div className="space-y-6">
            <PreEngagementChecklist
              items={checklist}
              onToggle={handleToggleChecklist}
              disabled={phase0?.status === 'complete'}
            />

            <div className="border-t border-nova-border pt-5">
              {phase0?.status === 'complete' ? (
                <div className="flex items-center gap-2 text-sm text-emerald-400">
                  <span>✓</span> Phase 0 signed off — Phase 1 available
                </div>
              ) : (
                <div className="flex items-start gap-4">
                  <div className="flex-1">
                    {!engagement.authorization_confirmed && (
                      <p className="text-sm text-yellow-400 mb-2">
                        ⚠ Authorization must be confirmed before proceeding (upload LoA &amp; RoE, then click "Confirm Authorization")
                      </p>
                    )}
                    {!allChecked && (
                      <p className="text-sm text-nova-muted">
                        All checklist items must be confirmed before Phase 1 can begin.
                      </p>
                    )}
                  </div>
                  <Button
                    onClick={handleProceedToPhase1}
                    loading={proceedingToPhase1}
                    disabled={!canProceed}
                    title={!canProceed ? 'Complete all checklist items and confirm authorization first' : undefined}
                  >
                    Proceed to Phase 1 →
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
