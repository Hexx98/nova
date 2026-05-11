import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { objectivesApi, type BusinessImpact, type ObjectiveEntry } from '@/api/objectives'

const IMPACT_OPTIONS: { value: BusinessImpact; label: string; description: string; color: string }[] = [
  { value: 'critical', label: 'Critical', description: 'Full compromise — data exfil, RCE, or complete auth bypass', color: 'border-red-600 bg-red-900/20 text-red-300' },
  { value: 'high',     label: 'High',     description: 'Significant access — sensitive data, privilege escalation',   color: 'border-orange-600 bg-orange-900/20 text-orange-300' },
  { value: 'medium',   label: 'Medium',   description: 'Limited access — information disclosure, partial bypass',    color: 'border-yellow-600 bg-yellow-900/20 text-yellow-300' },
  { value: 'low',      label: 'Low',      description: 'Minimal impact — low-severity misconfigurations only',       color: 'border-blue-600 bg-blue-900/20 text-blue-300' },
]

const OBJECTIVE_TYPES = [
  { value: 'data_exfil',          label: 'Data Exfiltration'   },
  { value: 'privilege_escalation', label: 'Privilege Escalation' },
  { value: 'rce',                 label: 'Remote Code Execution' },
  { value: 'lateral_movement',    label: 'Lateral Movement'    },
  { value: 'persistence',         label: 'Persistence'         },
  { value: 'credential_access',   label: 'Credential Access'   },
  { value: 'other',               label: 'Other'               },
]

const SEV_COLORS: Record<string, string> = {
  critical: 'text-red-400', high: 'text-orange-400', medium: 'text-yellow-400', low: 'text-blue-400', info: 'text-slate-400',
}

type Tab = 'objectives' | 'impact' | 'summary'

export function ObjectivesPage() {
  const { id: engagementId = '' } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('objectives')
  const [showSignOff, setShowSignOff] = useState(false)
  const [signOffNotes, setSignOffNotes] = useState('')
  const [isDirty, setIsDirty] = useState(false)

  const [draft, setDraft] = useState({
    achieved_objectives: [] as ObjectiveEntry[],
    business_impact: null as BusinessImpact | null,
    impact_narrative: '',
    executive_summary: '',
    operator_notes: '',
  })

  const [newObj, setNewObj] = useState<Partial<ObjectiveEntry>>({ type: 'data_exfil', title: '', description: '', evidence_preview: '', impact: '' })
  const [showAddObj, setShowAddObj] = useState(false)

  const invalidate = () => qc.invalidateQueries({ queryKey: ['objectives', engagementId] })

  const { data } = useQuery({
    queryKey: ['objectives', engagementId],
    queryFn: () => objectivesApi.get(engagementId),
    enabled: !!engagementId,
  })

  useEffect(() => {
    if (data?.objectives && !isDirty) {
      const obj = data.objectives
      setDraft({
        achieved_objectives: obj.achieved_objectives ?? [],
        business_impact: obj.business_impact ?? null,
        impact_narrative: obj.impact_narrative ?? '',
        executive_summary: obj.executive_summary ?? '',
        operator_notes: obj.operator_notes ?? '',
      })
    }
  }, [data])

  const saveMut = useMutation({
    mutationFn: () => objectivesApi.save(engagementId, {
      ...draft,
      business_impact: draft.business_impact ?? undefined,
    }),
    onSuccess: () => { invalidate(); setIsDirty(false) },
  })

  const autoMut = useMutation({
    mutationFn: () => objectivesApi.autoPopulate(engagementId),
    onSuccess: (res) => { invalidate(); if (res.objectives) { setDraft(d => ({ ...d, achieved_objectives: res.objectives.achieved_objectives ?? [] })) } },
  })

  const signOffMut = useMutation({
    mutationFn: () => objectivesApi.signOff(engagementId, signOffNotes),
    onSuccess: () => { invalidate(); setShowSignOff(false) },
  })

  const update = (field: string, value: unknown) => { setDraft(d => ({ ...d, [field]: value })); setIsDirty(true) }

  const isSignedOff = data?.phase_status === 'complete'
  const editable    = !isSignedOff
  const findingSummary = data?.finding_summary ?? {}

  function generateImpactNarrative() {
    const counts = findingSummary as Record<string, number>
    const total = Object.values(counts).reduce((a, b) => a + b, 0)
    const parts: string[] = []
    for (const sev of ['critical', 'high', 'medium', 'low', 'info']) {
      if (counts[sev]) parts.push(`${counts[sev]} ${sev}`)
    }
    const sevLine = parts.length ? `Severity breakdown: ${parts.join(', ')}.` : ''
    const impactDesc = IMPACT_OPTIONS.find(o => o.value === draft.business_impact)?.description ?? ''
    const objLines = draft.achieved_objectives.length
      ? '\n\nKey attack objectives achieved:\n' + draft.achieved_objectives.map(o => `- ${o.title}: ${o.description}`).join('\n')
      : ''
    const narrative = `Automated security testing identified ${total} confirmed vulnerabilit${total === 1 ? 'y' : 'ies'} across the target application. ${sevLine}${objLines}\n\nBusiness impact: ${draft.business_impact ?? 'not assessed'}${impactDesc ? ` — ${impactDesc}` : ''}.`
    update('impact_narrative', narrative)
  }

  function generateExecutiveSummary() {
    const counts = findingSummary as Record<string, number>
    const total = Object.values(counts).reduce((a, b) => a + b, 0)
    const critical = counts['critical'] ?? 0
    const high = counts['high'] ?? 0
    const cats = [...new Set(draft.achieved_objectives.map(o => o.type.replace(/_/g, ' ')))].slice(0, 4)
    const catLine = cats.length ? ` The assessment covered attack categories including ${cats.join(', ')}.` : ''
    const riskLine = critical > 0
      ? `Critical vulnerabilities were identified that could allow full system compromise or unauthorised data access.`
      : high > 0
        ? `High severity vulnerabilities were identified posing significant risk to the organisation.`
        : `No critical or high severity vulnerabilities were identified during this assessment.`
    const summary = `A web application security assessment was conducted against the target, identifying ${total} confirmed vulnerabilit${total === 1 ? 'y' : 'ies'}${critical + high > 0 ? `, including ${[critical ? `${critical} critical` : '', high ? `${high} high` : ''].filter(Boolean).join(' and ')} severity issues` : ''}. ${riskLine}${catLine} Immediate remediation is recommended for all critical and high severity findings to reduce organisational risk exposure.`
    update('executive_summary', summary)
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: 'objectives', label: 'Objectives' },
    { id: 'impact',     label: 'Impact Assessment' },
    { id: 'summary',    label: 'Executive Summary' },
  ]

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Phase 7 — Actions on Objectives</h1>
          <p className="text-sm text-slate-400 mt-0.5">Impact documentation and executive summary</p>
        </div>
        <div className="flex items-center gap-2">
          {editable && isDirty && (
            <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}
              className="px-3 py-1.5 text-sm rounded bg-cyan-600 hover:bg-cyan-500 text-white font-medium disabled:opacity-60 transition-colors">
              {saveMut.isPending ? 'Saving…' : 'Save'}
            </button>
          )}
          {editable && (
            <button onClick={() => setShowSignOff(true)}
              className="px-4 py-2 text-sm rounded bg-green-700 hover:bg-green-600 text-white font-medium transition-colors">
              Final Sign-Off
            </button>
          )}
          {isSignedOff && <span className="px-3 py-1.5 text-sm rounded border border-green-700 bg-green-900/20 text-green-400 font-medium">✓ Complete</span>}
        </div>
      </div>

      {/* Finding summary from Phase 4 */}
      {Object.keys(findingSummary).length > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">Phase 4 Finding Summary</div>
          <div className="flex gap-4">
            {Object.entries(findingSummary).map(([sev, cnt]) => (
              <div key={sev} className="text-center">
                <div className={`text-xl font-bold font-mono ${SEV_COLORS[sev]}`}>{cnt as number}</div>
                <div className="text-xs text-slate-500 capitalize">{sev}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {isDirty && editable && (
        <div className="flex items-center gap-3 bg-amber-900/10 border border-amber-800 rounded px-4 py-2">
          <span className="text-sm text-amber-300 flex-1">Unsaved changes</span>
          <button onClick={() => { setIsDirty(false); invalidate() }} className="text-sm text-slate-400 hover:text-slate-200">Discard</button>
          <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}
            className="px-3 py-1 text-sm rounded bg-amber-700 hover:bg-amber-600 text-white font-medium disabled:opacity-60">
            {saveMut.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-slate-700">
        <nav className="flex gap-1">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${tab === t.id ? 'border-cyan-500 text-cyan-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Objectives tab */}
      {tab === 'objectives' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            {editable && (
              <>
                <button onClick={() => setShowAddObj(true)} className="px-3 py-1.5 text-sm rounded border border-slate-600 text-slate-300 hover:text-white transition-colors">+ Add Objective</button>
                {draft.achieved_objectives.length === 0 && (
                  <button onClick={() => autoMut.mutate()} disabled={autoMut.isPending}
                    className="px-3 py-1.5 text-sm rounded border border-cyan-700 text-cyan-400 hover:bg-cyan-900/20 disabled:opacity-60 transition-colors">
                    {autoMut.isPending ? 'Populating…' : '⚡ Auto-populate from Phase 4'}
                  </button>
                )}
              </>
            )}
          </div>

          {draft.achieved_objectives.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-500 text-sm">No objectives documented yet.</p>
              <p className="text-slate-600 text-xs mt-1">Add what was achieved or auto-populate from Phase 4 findings.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {draft.achieved_objectives.map((obj, i) => (
                <div key={i} className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5">
                          {OBJECTIVE_TYPES.find(t => t.value === obj.type)?.label ?? obj.type}
                        </span>
                        <span className="text-sm font-medium text-slate-100">{obj.title}</span>
                      </div>
                      <p className="text-sm text-slate-400 mt-1">{obj.description}</p>
                      {obj.evidence_preview && (
                        <pre className="text-xs text-slate-500 bg-slate-900 rounded px-3 py-2 mt-2 overflow-x-auto">{obj.evidence_preview}</pre>
                      )}
                      {obj.impact && <p className="text-xs text-amber-400 mt-1">{obj.impact}</p>}
                    </div>
                    {editable && (
                      <button onClick={() => update('achieved_objectives', draft.achieved_objectives.filter((_, j) => j !== i))}
                        className="text-xs text-red-500 hover:text-red-400 flex-shrink-0">Remove</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Impact tab */}
      {tab === 'impact' && (
        <div className="space-y-5">
          <div>
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Business Impact Level</label>
            <div className="grid grid-cols-2 gap-2">
              {IMPACT_OPTIONS.map(opt => (
                <button key={opt.value} disabled={!editable}
                  onClick={() => update('business_impact', opt.value)}
                  className={`text-left p-3 rounded border transition-colors disabled:cursor-default ${draft.business_impact === opt.value ? opt.color : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600'}`}>
                  <div className="font-medium text-sm">{opt.label}</div>
                  <div className="text-xs mt-0.5 opacity-80">{opt.description}</div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide">Technical Impact Narrative</label>
              {editable && (
                <button onClick={generateImpactNarrative}
                  className="text-xs text-cyan-400 hover:text-cyan-300 border border-cyan-800 rounded px-2 py-0.5 transition-colors">
                  ⚡ Auto-generate from findings
                </button>
              )}
            </div>
            <textarea value={draft.impact_narrative} disabled={!editable}
              onChange={e => update('impact_narrative', e.target.value)} rows={8}
              placeholder="Detailed technical description of what was accessed, how, and what data or systems were compromised…"
              className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-600 disabled:opacity-50 resize-none" />
          </div>
        </div>
      )}

      {/* Executive summary tab */}
      {tab === 'summary' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-400">
              Clear, non-technical summary for executive/management audience. Focus on business risk and recommended actions.
            </p>
            {editable && (
              <button onClick={generateExecutiveSummary}
                className="flex-shrink-0 ml-4 text-xs text-cyan-400 hover:text-cyan-300 border border-cyan-800 rounded px-2 py-0.5 transition-colors">
                ⚡ Auto-generate
              </button>
            )}
          </div>
          <textarea value={draft.executive_summary} disabled={!editable}
            onChange={e => update('executive_summary', e.target.value)} rows={14}
            placeholder="During the security assessment of [target], our team identified several critical vulnerabilities that pose significant risk to [organisation]…"
            className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-600 disabled:opacity-50 resize-none font-sans leading-relaxed" />
          <div className="text-xs text-slate-600">{draft.executive_summary.length} characters {draft.executive_summary.length < 50 ? '(minimum 50 required for sign-off)' : '✓'}</div>
        </div>
      )}

      {/* Add objective dialog */}
      {showAddObj && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg w-full max-w-md space-y-4 p-6">
            <h2 className="text-lg font-semibold text-slate-100">Add Objective</h2>
            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Type</label>
              <select value={newObj.type} onChange={e => setNewObj(o => ({ ...o, type: e.target.value }))}
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200">
                {OBJECTIVE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            {(['title', 'description', 'evidence_preview', 'impact'] as const).map(f => (
              <div key={f}>
                <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">{f.replace(/_/g, ' ')}</label>
                {f === 'description' || f === 'evidence_preview' ? (
                  <textarea value={newObj[f] ?? ''} onChange={e => setNewObj(o => ({ ...o, [f]: e.target.value }))} rows={2}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 resize-none" />
                ) : (
                  <input type="text" value={newObj[f] ?? ''} onChange={e => setNewObj(o => ({ ...o, [f]: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200" />
                )}
              </div>
            ))}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowAddObj(false)} className="px-4 py-2 text-sm rounded border border-slate-600 text-slate-400 hover:text-slate-200 transition-colors">Cancel</button>
              <button onClick={() => {
                if (!newObj.title) return
                update('achieved_objectives', [...draft.achieved_objectives, { ...newObj, finding_ids: [] } as ObjectiveEntry])
                setShowAddObj(false)
                setNewObj({ type: 'data_exfil', title: '', description: '', evidence_preview: '', impact: '' })
              }} disabled={!newObj.title}
                className="px-4 py-2 text-sm rounded bg-cyan-600 hover:bg-cyan-500 text-white font-medium disabled:opacity-60 transition-colors">Add</button>
            </div>
          </div>
        </div>
      )}

      {/* Sign-off dialog */}
      {showSignOff && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg w-full max-w-md space-y-4 p-6">
            <h2 className="text-lg font-semibold text-slate-100">Final Sign-Off</h2>
            <p className="text-sm text-slate-400">
              This is the final gate. Signing off marks the engagement complete and enables report generation.
            </p>
            {(!draft.executive_summary || draft.executive_summary.length < 50) && (
              <div className="bg-red-900/20 border border-red-800 rounded p-3 text-sm text-red-300">
                Executive summary must be at least 50 characters.
              </div>
            )}
            {draft.achieved_objectives.length === 0 && (
              <div className="bg-red-900/20 border border-red-800 rounded p-3 text-sm text-red-300">
                At least one objective must be documented.
              </div>
            )}
            <textarea value={signOffNotes} onChange={e => setSignOffNotes(e.target.value)} rows={2}
              placeholder="Final review complete…"
              className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-600 resize-none" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowSignOff(false)} className="px-4 py-2 text-sm rounded border border-slate-600 text-slate-400 hover:text-slate-200 transition-colors">Cancel</button>
              <button
                onClick={() => { if (isDirty) { saveMut.mutate(undefined, { onSuccess: () => signOffMut.mutate() }) } else { signOffMut.mutate() } }}
                disabled={signOffMut.isPending || !draft.executive_summary || draft.executive_summary.length < 50 || draft.achieved_objectives.length === 0}
                className="px-4 py-2 text-sm rounded bg-green-700 hover:bg-green-600 text-white font-medium disabled:opacity-60 transition-colors">
                {signOffMut.isPending ? 'Signing Off…' : 'Complete Engagement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
