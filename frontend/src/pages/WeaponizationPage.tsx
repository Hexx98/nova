import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { weaponizationApi, type WordlistConfig, type AttackTask } from '@/api/weaponization'
import { CVEReport } from '@/components/weaponization/CVEReport'
import { AttackPlanBuilder } from '@/components/weaponization/AttackPlanBuilder'
import { WordlistConfigPanel } from '@/components/weaponization/WordlistConfig'

const DEFAULT_WORDLIST: WordlistConfig = {
  directory_wordlist: 'raft_medium_directories',
  password_wordlist:  'rockyou_top10k',
  username_wordlist:  'top_usernames',
  custom_paths:       [],
  custom_passwords:   [],
}

type Tab = 'overview' | 'cve' | 'plan' | 'wordlists'

export function WeaponizationPage() {
  const { id: engagementId = '' } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('overview')
  const [approveNotes, setApproveNotes] = useState('')
  const [showApproveDialog, setShowApproveDialog] = useState(false)
  const [wordlistDraft, setWordlistDraft] = useState<WordlistConfig | null>(null)

  // -----------------------------------------------------------------------
  // Data
  // -----------------------------------------------------------------------
  const planQuery = useQuery({
    queryKey: ['weaponization', engagementId],
    queryFn: () => weaponizationApi.getPlan(engagementId),
    enabled: !!engagementId,
  })

  const plan   = planQuery.data?.plan   ?? null
  const summary = planQuery.data?.summary ?? null
  const wordlistConfig: WordlistConfig = {
    ...DEFAULT_WORDLIST,
    ...(plan?.wordlist_config ?? {}),
  }

  // -----------------------------------------------------------------------
  // Mutations
  // -----------------------------------------------------------------------
  const invalidate = () => qc.invalidateQueries({ queryKey: ['weaponization', engagementId] })

  const generateMut = useMutation({
    mutationFn: () => weaponizationApi.generatePlan(engagementId),
    onSuccess: () => { invalidate(); setTab('plan') },
  })

  const taskToggleMut = useMutation({
    mutationFn: ({ taskId, enabled }: { taskId: string; enabled: boolean }) =>
      weaponizationApi.updateTask(engagementId, taskId, { enabled }),
    onSuccess: invalidate,
  })

  const taskPriorityMut = useMutation({
    mutationFn: ({ taskId, priority }: { taskId: string; priority: string }) =>
      weaponizationApi.updateTask(engagementId, taskId, { priority }),
    onSuccess: invalidate,
  })

  const wordlistMut = useMutation({
    mutationFn: (wl: WordlistConfig) =>
      weaponizationApi.updatePlan(engagementId, { wordlist_config: wl }),
    onSuccess: () => { invalidate(); setWordlistDraft(null) },
  })

  const approveMut = useMutation({
    mutationFn: (notes: string) => weaponizationApi.approvePlan(engagementId, notes),
    onSuccess: () => { invalidate(); setShowApproveDialog(false) },
  })

  const resetMut = useMutation({
    mutationFn: () => weaponizationApi.resetPlan(engagementId),
    onSuccess: invalidate,
  })

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  const isApproved = plan?.status === 'approved' || plan?.status === 'active' || plan?.status === 'complete'
  const isDraft    = plan?.status === 'draft'
  const editable   = isDraft

  const TABS: { id: Tab; label: string }[] = [
    { id: 'overview',  label: 'Overview'     },
    { id: 'cve',       label: 'CVE Intel'    },
    { id: 'plan',      label: 'Attack Plan'  },
    { id: 'wordlists', label: 'Wordlists'    },
  ]

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Phase 2 — Weaponization</h1>
          <p className="text-sm text-slate-400 mt-0.5">CVE intelligence, attack plan, and wordlist configuration</p>
        </div>

        <div className="flex items-center gap-2">
          {isApproved && (
            <button
              onClick={() => resetMut.mutate()}
              disabled={plan?.status === 'active' || resetMut.isPending}
              className="px-3 py-1.5 text-sm rounded border border-slate-600 text-slate-400 hover:text-slate-200 hover:border-slate-500 disabled:opacity-40 transition-colors"
            >
              Reset to Draft
            </button>
          )}

          {!plan ? (
            <button
              onClick={() => generateMut.mutate()}
              disabled={generateMut.isPending}
              className="px-4 py-2 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium disabled:opacity-60 transition-colors"
            >
              {generateMut.isPending ? 'Generating…' : 'Generate AI Plan'}
            </button>
          ) : isDraft ? (
            <>
              <button
                onClick={() => generateMut.mutate()}
                disabled={generateMut.isPending}
                className="px-3 py-1.5 text-sm rounded border border-slate-600 text-slate-300 hover:text-white disabled:opacity-40 transition-colors"
              >
                Regenerate
              </button>
              <button
                onClick={() => setShowApproveDialog(true)}
                className="px-4 py-2 rounded bg-green-700 hover:bg-green-600 text-white text-sm font-medium transition-colors"
              >
                Approve Plan
              </button>
            </>
          ) : (
            <span className="px-3 py-1.5 text-sm rounded border border-green-700 bg-green-900/20 text-green-400 font-medium">
              ✓ Approved
            </span>
          )}
        </div>
      </div>

      {/* Summary cards — only when plan exists */}
      {summary && (
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: 'Tasks',    value: summary.total_tasks,              color: 'text-white' },
            { label: 'Critical', value: summary.by_priority.critical ?? 0, color: 'text-red-400' },
            { label: 'High',     value: summary.by_priority.high ?? 0,     color: 'text-orange-400' },
            { label: 'CVE Hits', value: summary.cve_targeted_tasks,         color: 'text-cyan-400' },
            { label: 'CVEs',     value: plan?.cve_report?.total_cves ?? 0,  color: 'text-slate-300' },
          ].map(s => (
            <div key={s.label} className="bg-slate-800 rounded border border-slate-700 p-3 text-center">
              <div className={`text-2xl font-bold font-mono ${s.color}`}>{s.value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-slate-700">
        <nav className="flex gap-1">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                tab === t.id
                  ? 'border-cyan-500 text-cyan-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div>
        {tab === 'overview' && (
          <div className="space-y-4">
            {!plan ? (
              <div className="text-center py-16 space-y-4">
                <div className="text-4xl">🎯</div>
                <h2 className="text-lg font-medium text-slate-300">No attack plan yet</h2>
                <p className="text-sm text-slate-500 max-w-md mx-auto">
                  Generate an AI-proposed plan using the discovered tech stack and CVE intelligence.
                  You can customize or replace it before approval.
                </p>
                <button
                  onClick={() => generateMut.mutate()}
                  disabled={generateMut.isPending}
                  className="px-6 py-2.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium disabled:opacity-60 transition-colors"
                >
                  {generateMut.isPending ? 'Generating…' : 'Generate AI Plan'}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-slate-800 rounded border border-slate-700 p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-slate-300">Plan Status</h3>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                    <div className="text-slate-500">Mode</div>
                    <div className="text-slate-200 capitalize">{plan.mode.replace('_', ' ')}</div>
                    <div className="text-slate-500">Status</div>
                    <div className="text-slate-200 capitalize">{plan.status}</div>
                    {plan.ai_generated_at && (
                      <>
                        <div className="text-slate-500">Generated</div>
                        <div className="text-slate-200">{new Date(plan.ai_generated_at).toLocaleString()}</div>
                      </>
                    )}
                    {plan.approved_at && (
                      <>
                        <div className="text-slate-500">Approved</div>
                        <div className="text-slate-200">{new Date(plan.approved_at).toLocaleString()}</div>
                      </>
                    )}
                  </div>
                </div>

                {summary && (
                  <div className="bg-slate-800 rounded border border-slate-700 p-4">
                    <h3 className="text-sm font-semibold text-slate-300 mb-3">Tasks by Category</h3>
                    <div className="space-y-1.5">
                      {Object.entries(summary.by_category).map(([cat, count]) => (
                        <div key={cat} className="flex items-center justify-between text-sm">
                          <span className="text-slate-400 capitalize">{cat.replace(/_/g, ' ')}</span>
                          <span className="text-slate-300 font-mono">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {plan.operator_notes && (
                  <div className="bg-amber-900/10 border border-amber-800 rounded p-3">
                    <p className="text-sm text-amber-300 whitespace-pre-wrap">{plan.operator_notes}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {tab === 'cve' && (
          <div>
            {plan?.cve_report ? (
              <CVEReport report={plan.cve_report} />
            ) : (
              <p className="text-slate-500 text-sm text-center py-12">
                Generate an attack plan to populate CVE intelligence data.
              </p>
            )}
          </div>
        )}

        {tab === 'plan' && (
          <div>
            {plan ? (
              <AttackPlanBuilder
                plan={plan}
                onTaskToggle={(taskId, enabled) => taskToggleMut.mutate({ taskId, enabled })}
                onTaskPriority={(taskId, priority) => taskPriorityMut.mutate({ taskId, priority })}
              />
            ) : (
              <p className="text-slate-500 text-sm text-center py-12">
                Generate an attack plan first.
              </p>
            )}
          </div>
        )}

        {tab === 'wordlists' && (
          <div className="space-y-4">
            <WordlistConfigPanel
              config={wordlistDraft ?? wordlistConfig}
              editable={editable}
              onChange={setWordlistDraft}
            />
            {editable && wordlistDraft && (
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setWordlistDraft(null)}
                  className="px-4 py-2 text-sm rounded border border-slate-600 text-slate-400 hover:text-slate-200 transition-colors"
                >
                  Discard
                </button>
                <button
                  onClick={() => wordlistMut.mutate(wordlistDraft)}
                  disabled={wordlistMut.isPending}
                  className="px-4 py-2 text-sm rounded bg-cyan-600 hover:bg-cyan-500 text-white font-medium disabled:opacity-60 transition-colors"
                >
                  {wordlistMut.isPending ? 'Saving…' : 'Save Wordlist Config'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Approve dialog */}
      {showApproveDialog && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg w-full max-w-md space-y-4 p-6">
            <h2 className="text-lg font-semibold text-slate-100">Approve Attack Plan</h2>
            <p className="text-sm text-slate-400">
              Approving locks this plan and enables Phase 3 — Delivery. You can reset to draft if needed.
            </p>
            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">
                Approval Notes (optional)
              </label>
              <textarea
                value={approveNotes}
                onChange={e => setApproveNotes(e.target.value)}
                rows={3}
                placeholder="Reviewed all tasks, disabled noisy scan…"
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-600 resize-none"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowApproveDialog(false)}
                className="px-4 py-2 text-sm rounded border border-slate-600 text-slate-400 hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => approveMut.mutate(approveNotes)}
                disabled={approveMut.isPending}
                className="px-4 py-2 text-sm rounded bg-green-700 hover:bg-green-600 text-white font-medium disabled:opacity-60 transition-colors"
              >
                {approveMut.isPending ? 'Approving…' : 'Approve Plan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
