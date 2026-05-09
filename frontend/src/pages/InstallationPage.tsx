import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { installationApi, type ArtifactType } from '@/api/installation'

const ARTIFACT_TYPES: { value: ArtifactType; label: string; description: string }[] = [
  { value: 'web_shell',        label: 'Web Shell',         description: 'Remote code execution shell' },
  { value: 'backdoor_account', label: 'Backdoor Account',  description: 'Created admin/user account' },
  { value: 'stored_xss',       label: 'Stored XSS',        description: 'Persistent XSS payload in DB' },
  { value: 'file_read',        label: 'File Read',         description: 'Sensitive file accessed' },
  { value: 'db_access',        label: 'DB Access',         description: 'Direct database connection or dump' },
]

const STATUS_STYLES = {
  active: 'text-amber-400 bg-amber-900/20 border-amber-800',
  closed: 'text-green-400 bg-green-900/20 border-green-800',
}

export function InstallationPage() {
  const { id: engagementId = '' } = useParams<{ id: string }>()
  const qc = useQueryClient()

  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showRemoveDialog, setShowRemoveDialog] = useState<string | null>(null)
  const [showSignOffDialog, setShowSignOffDialog] = useState(false)
  const [signOffNotes, setSignOffNotes] = useState('')

  const [addForm, setAddForm] = useState({
    artifact_type: 'web_shell' as ArtifactType,
    target_host: '',
    target_location: '',
    payload_type: '',
  })
  const [removeForm, setRemoveForm] = useState({ verification_method: '', evidence_ref: '' })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['installation', engagementId] })

  const { data } = useQuery({
    queryKey: ['installation', engagementId],
    queryFn: () => installationApi.list(engagementId),
    enabled: !!engagementId,
  })

  const logMut = useMutation({
    mutationFn: () => installationApi.log(engagementId, addForm),
    onSuccess: () => { invalidate(); setShowAddDialog(false); setAddForm({ artifact_type: 'web_shell', target_host: '', target_location: '', payload_type: '' }) },
  })

  const removeMut = useMutation({
    mutationFn: (artifactId: string) => installationApi.remove(engagementId, artifactId, removeForm),
    onSuccess: () => { invalidate(); setShowRemoveDialog(null) },
  })

  const signOffMut = useMutation({
    mutationFn: () => installationApi.signOff(engagementId, signOffNotes),
    onSuccess: () => { invalidate(); setShowSignOffDialog(false) },
  })

  const artifacts    = data?.artifacts ?? []
  const activeCount  = data?.active_count ?? 0
  const isSignedOff  = data?.phase_status === 'complete'

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Phase 5 — Installation</h1>
          <p className="text-sm text-slate-400 mt-0.5">Track artifacts deployed during exploitation</p>
        </div>
        <div className="flex items-center gap-2">
          {!isSignedOff && (
            <button
              onClick={() => setShowAddDialog(true)}
              className="px-3 py-1.5 text-sm rounded border border-slate-600 text-slate-300 hover:text-white hover:border-slate-500 transition-colors"
            >
              + Log Artifact
            </button>
          )}
          {!isSignedOff && artifacts.length > 0 && (
            <button
              onClick={() => setShowSignOffDialog(true)}
              className="px-4 py-2 text-sm rounded bg-green-700 hover:bg-green-600 text-white font-medium transition-colors"
            >
              Sign Off Phase 5
            </button>
          )}
          {isSignedOff && (
            <span className="px-3 py-1.5 text-sm rounded border border-green-700 bg-green-900/20 text-green-400 font-medium">✓ Signed Off</span>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Artifacts', value: artifacts.length, color: 'text-white' },
          { label: 'Active',          value: activeCount,       color: 'text-amber-400' },
          { label: 'Removed',         value: data?.verified_count ?? 0, color: 'text-green-400' },
        ].map(s => (
          <div key={s.label} className="bg-slate-800 rounded border border-slate-700 p-4 text-center">
            <div className={`text-2xl font-bold font-mono ${s.color}`}>{s.value}</div>
            <div className="text-xs text-slate-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Artifact list */}
      {artifacts.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-slate-500 text-sm">No artifacts logged yet.</p>
          <p className="text-slate-600 text-xs mt-1">Log any web shells, backdoor accounts, or other persistence mechanisms deployed during Phase 4.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {artifacts.map((a: any) => (
            <div key={a.id} className="bg-slate-800 border border-slate-700 rounded-lg p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-100">
                      {ARTIFACT_TYPES.find(t => t.value === a.artifact_type)?.label ?? a.artifact_type}
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${STATUS_STYLES[a.status as keyof typeof STATUS_STYLES]}`}>
                      {a.status}
                    </span>
                  </div>
                  <div className="text-xs font-mono text-slate-400">{a.target_host}{a.target_location}</div>
                  <div className="text-xs text-slate-500">Payload: {a.payload_type}</div>
                  {a.removal_verified && (
                    <div className="text-xs text-green-400">✓ Removed — {a.verification_method}</div>
                  )}
                </div>
                {!isSignedOff && a.status === 'active' && (
                  <button
                    onClick={() => setShowRemoveDialog(a.id)}
                    className="flex-shrink-0 px-3 py-1.5 text-xs rounded border border-green-700 text-green-400 hover:bg-green-900/20 transition-colors"
                  >
                    Mark Removed
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add artifact dialog */}
      {showAddDialog && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg w-full max-w-md space-y-4 p-6">
            <h2 className="text-lg font-semibold text-slate-100">Log Artifact</h2>
            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Artifact Type</label>
              <div className="grid grid-cols-1 gap-1">
                {ARTIFACT_TYPES.map(t => (
                  <button key={t.value} onClick={() => setAddForm(f => ({ ...f, artifact_type: t.value }))}
                    className={`text-left p-2 rounded border text-sm transition-colors ${addForm.artifact_type === t.value ? 'border-cyan-600 bg-cyan-900/20 text-cyan-300' : 'border-slate-700 text-slate-400 hover:border-slate-600'}`}>
                    <span className="font-medium">{t.label}</span>
                    <span className="text-slate-500 ml-2 text-xs">{t.description}</span>
                  </button>
                ))}
              </div>
            </div>
            {(['target_host', 'target_location', 'payload_type'] as const).map(field => (
              <div key={field}>
                <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">
                  {field.replace(/_/g, ' ')}
                </label>
                <input type="text" value={addForm[field]}
                  onChange={e => setAddForm(f => ({ ...f, [field]: e.target.value }))}
                  placeholder={field === 'target_host' ? 'target.com' : field === 'target_location' ? '/uploads/shell.php' : 'PHP one-liner'}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-600"
                />
              </div>
            ))}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowAddDialog(false)} className="px-4 py-2 text-sm rounded border border-slate-600 text-slate-400 hover:text-slate-200 transition-colors">Cancel</button>
              <button onClick={() => logMut.mutate()} disabled={logMut.isPending || !addForm.target_host}
                className="px-4 py-2 text-sm rounded bg-cyan-600 hover:bg-cyan-500 text-white font-medium disabled:opacity-60 transition-colors">
                {logMut.isPending ? 'Logging…' : 'Log Artifact'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove dialog */}
      {showRemoveDialog && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg w-full max-w-md space-y-4 p-6">
            <h2 className="text-lg font-semibold text-slate-100">Mark Artifact Removed</h2>
            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Verification Method</label>
              <input type="text" value={removeForm.verification_method}
                onChange={e => setRemoveForm(f => ({ ...f, verification_method: e.target.value }))}
                placeholder="Manual deletion, file system check, access test…"
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Evidence Reference (optional)</label>
              <input type="text" value={removeForm.evidence_ref}
                onChange={e => setRemoveForm(f => ({ ...f, evidence_ref: e.target.value }))}
                placeholder="Screenshot path, log entry…"
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-600"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowRemoveDialog(null)} className="px-4 py-2 text-sm rounded border border-slate-600 text-slate-400 hover:text-slate-200 transition-colors">Cancel</button>
              <button onClick={() => removeMut.mutate(showRemoveDialog)} disabled={removeMut.isPending || !removeForm.verification_method}
                className="px-4 py-2 text-sm rounded bg-green-700 hover:bg-green-600 text-white font-medium disabled:opacity-60 transition-colors">
                {removeMut.isPending ? 'Saving…' : 'Confirm Removal'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sign-off dialog */}
      {showSignOffDialog && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg w-full max-w-md space-y-4 p-6">
            <h2 className="text-lg font-semibold text-slate-100">Sign Off Phase 5</h2>
            <p className="text-sm text-slate-400">
              {activeCount > 0
                ? `${activeCount} artifact(s) still marked active. They can be removed in Phase 7 clean-up. Confirm you've documented all deployed artifacts.`
                : 'All artifacts documented and verified removed.'}
            </p>
            <textarea value={signOffNotes} onChange={e => setSignOffNotes(e.target.value)} rows={2}
              placeholder="All web shells documented…"
              className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-600 resize-none" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowSignOffDialog(false)} className="px-4 py-2 text-sm rounded border border-slate-600 text-slate-400 hover:text-slate-200 transition-colors">Cancel</button>
              <button onClick={() => signOffMut.mutate()} disabled={signOffMut.isPending}
                className="px-4 py-2 text-sm rounded bg-green-700 hover:bg-green-600 text-white font-medium disabled:opacity-60 transition-colors">
                {signOffMut.isPending ? 'Signing Off…' : 'Sign Off Phase 5'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
