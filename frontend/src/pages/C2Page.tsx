import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { c2Api, type C2ChannelType, type C2Session } from '@/api/c2'

const CHANNEL_TYPES: { value: C2ChannelType; label: string; hint: string }[] = [
  { value: 'interactsh',    label: 'Interactsh',       hint: 'OOB interaction server callback' },
  { value: 'ssrf_callback', label: 'SSRF Callback',    hint: 'Server-side request to internal endpoint' },
  { value: 'xxe_oob',       label: 'XXE OOB',          hint: 'XML external entity out-of-band callback' },
  { value: 'blind_xss',     label: 'Blind XSS',        hint: 'Stored XSS firing in admin/background context' },
  { value: 'custom',        label: 'Custom',           hint: 'Other C2 channel' },
]

const CHAN_COLORS: Record<C2ChannelType, string> = {
  interactsh:    'text-cyan-400   border-cyan-800   bg-cyan-900/20',
  ssrf_callback: 'text-orange-400 border-orange-800 bg-orange-900/20',
  xxe_oob:       'text-purple-400 border-purple-800 bg-purple-900/20',
  blind_xss:     'text-red-400    border-red-800    bg-red-900/20',
  custom:        'text-slate-400  border-slate-700  bg-slate-800',
}

function SessionCard({ session, onLogInteraction, onTerminate, editable }: {
  session: C2Session
  onLogInteraction: (id: string) => void
  onTerminate: (id: string) => void
  editable: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className={`bg-slate-800 border border-slate-700 rounded-lg overflow-hidden ${session.status === 'terminated' ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-3 p-4">
        <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded border font-medium ${CHAN_COLORS[session.channel_type]}`}>
          {CHANNEL_TYPES.find(t => t.value === session.channel_type)?.label ?? session.channel_type}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-slate-100">{session.label}</div>
          <div className="text-xs font-mono text-slate-500 truncate">{session.callback_url}</div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {session.interactions.length > 0 && (
            <span className="text-xs text-amber-400 font-mono bg-amber-900/20 border border-amber-800 rounded px-1.5 py-0.5">
              {session.interactions.length} hit{session.interactions.length !== 1 ? 's' : ''}
            </span>
          )}
          <span className={`text-xs px-1.5 py-0.5 rounded border ${session.status === 'active' ? 'text-green-400 border-green-800 bg-green-900/20' : 'text-slate-500 border-slate-700'}`}>
            {session.status}
          </span>
          {editable && session.status === 'active' && (
            <>
              <button onClick={() => onLogInteraction(session.id)} className="text-xs px-2 py-1 rounded border border-cyan-700 text-cyan-400 hover:bg-cyan-900/20 transition-colors">+ Hit</button>
              <button onClick={() => onTerminate(session.id)} className="text-xs px-2 py-1 rounded border border-red-800 text-red-400 hover:bg-red-900/20 transition-colors">Terminate</button>
            </>
          )}
          <button onClick={() => setExpanded(e => !e)} className="text-slate-600 hover:text-slate-400 p-1">
            <svg className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>
      {expanded && session.interactions.length > 0 && (
        <div className="border-t border-slate-700 p-3 space-y-1">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Interactions</div>
          {session.interactions.map((ix, i) => (
            <div key={i} className="text-xs font-mono text-slate-400 bg-slate-900 rounded px-3 py-1.5 flex items-center gap-3">
              <span className="text-slate-600">{new Date(ix.ts).toLocaleTimeString()}</span>
              <span className="text-green-400">{ix.method}</span>
              {ix.source_ip && <span>{ix.source_ip}</span>}
              {ix.data_preview && <span className="text-slate-500 truncate">{ix.data_preview}</span>}
              {ix.size_bytes > 0 && <span className="text-slate-600 ml-auto">{ix.size_bytes}b</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function C2Page() {
  const { id: engagementId = '' } = useParams<{ id: string }>()
  const qc = useQueryClient()

  const [showAdd, setShowAdd] = useState(false)
  const [showInteraction, setShowInteraction] = useState<string | null>(null)
  const [showSignOff, setShowSignOff] = useState(false)
  const [signOffNotes, setSignOffNotes] = useState('')
  const [newSession, setNewSession] = useState({ channel_type: 'interactsh' as C2ChannelType, label: '', callback_url: '', notes: '' })
  const [interaction, setInteraction] = useState({ source_ip: '', method: 'GET', data_preview: '', size_bytes: 0 })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['c2', engagementId] })

  const { data } = useQuery({
    queryKey: ['c2', engagementId],
    queryFn: () => c2Api.list(engagementId),
    enabled: !!engagementId,
  })

  const createMut  = useMutation({ mutationFn: () => c2Api.create(engagementId, newSession), onSuccess: () => { invalidate(); setShowAdd(false) } })
  const hitMut     = useMutation({ mutationFn: (id: string) => c2Api.logInteraction(engagementId, id, interaction), onSuccess: () => { invalidate(); setShowInteraction(null) } })
  const termMut    = useMutation({ mutationFn: (id: string) => c2Api.terminate(engagementId, id), onSuccess: invalidate })
  const signOffMut = useMutation({ mutationFn: () => c2Api.signOff(engagementId, signOffNotes), onSuccess: () => { invalidate(); setShowSignOff(false) } })

  const sessions    = (data?.sessions ?? []) as C2Session[]
  const isSignedOff = data?.phase_status === 'complete'
  const editable    = !isSignedOff

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Phase 6 — Command &amp; Control</h1>
          <p className="text-sm text-slate-400 mt-0.5">Document C2 channels and callback interactions</p>
        </div>
        <div className="flex items-center gap-2">
          {editable && <button onClick={() => setShowAdd(true)} className="px-3 py-1.5 text-sm rounded border border-slate-600 text-slate-300 hover:text-white hover:border-slate-500 transition-colors">+ Add Channel</button>}
          {editable && sessions.length > 0 && <button onClick={() => setShowSignOff(true)} className="px-4 py-2 text-sm rounded bg-green-700 hover:bg-green-600 text-white font-medium transition-colors">Sign Off Phase 6</button>}
          {isSignedOff && <span className="px-3 py-1.5 text-sm rounded border border-green-700 bg-green-900/20 text-green-400 font-medium">✓ Signed Off</span>}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Channels',      value: sessions.length,              color: 'text-white' },
          { label: 'Active',        value: data?.active_count ?? 0,      color: 'text-green-400' },
          { label: 'Total Hits',    value: data?.total_interactions ?? 0, color: 'text-amber-400' },
        ].map(s => (
          <div key={s.label} className="bg-slate-800 rounded border border-slate-700 p-4 text-center">
            <div className={`text-2xl font-bold font-mono ${s.color}`}>{s.value}</div>
            <div className="text-xs text-slate-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {sessions.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-slate-500 text-sm">No C2 channels documented yet.</p>
          <p className="text-slate-600 text-xs mt-1">Add interactsh callbacks, SSRF/XXE out-of-band hits, or blind XSS fires.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map(s => (
            <SessionCard key={s.id} session={s} editable={editable}
              onLogInteraction={id => setShowInteraction(id)}
              onTerminate={id => termMut.mutate(id)}
            />
          ))}
        </div>
      )}

      {/* Add dialog */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg w-full max-w-md space-y-4 p-6">
            <h2 className="text-lg font-semibold text-slate-100">Add C2 Channel</h2>
            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Channel Type</label>
              <div className="grid grid-cols-2 gap-1">
                {CHANNEL_TYPES.map(t => (
                  <button key={t.value} onClick={() => setNewSession(s => ({ ...s, channel_type: t.value }))}
                    className={`text-left p-2 rounded border text-xs transition-colors ${newSession.channel_type === t.value ? 'border-cyan-600 bg-cyan-900/20 text-cyan-300' : 'border-slate-700 text-slate-400 hover:border-slate-600'}`}>
                    <div className="font-medium">{t.label}</div>
                    <div className="text-slate-500 mt-0.5">{t.hint}</div>
                  </button>
                ))}
              </div>
            </div>
            {(['label', 'callback_url'] as const).map(f => (
              <div key={f}>
                <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">{f.replace('_', ' ')}</label>
                <input type="text" value={newSession[f]} onChange={e => setNewSession(s => ({ ...s, [f]: e.target.value }))}
                  placeholder={f === 'label' ? 'Admin SSRF hit' : 'https://abc123.interactsh.com'}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-600" />
              </div>
            ))}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm rounded border border-slate-600 text-slate-400 hover:text-slate-200 transition-colors">Cancel</button>
              <button onClick={() => createMut.mutate()} disabled={createMut.isPending || !newSession.label || !newSession.callback_url}
                className="px-4 py-2 text-sm rounded bg-cyan-600 hover:bg-cyan-500 text-white font-medium disabled:opacity-60 transition-colors">
                {createMut.isPending ? 'Adding…' : 'Add Channel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Log interaction dialog */}
      {showInteraction && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg w-full max-w-md space-y-4 p-6">
            <h2 className="text-lg font-semibold text-slate-100">Log Callback Hit</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Source IP</label>
                <input type="text" value={interaction.source_ip} onChange={e => setInteraction(i => ({ ...i, source_ip: e.target.value }))}
                  placeholder="192.168.1.1" className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-600" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Method</label>
                <select value={interaction.method} onChange={e => setInteraction(i => ({ ...i, method: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200">
                  {['GET','POST','PUT','HEAD','OPTIONS'].map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Data Preview</label>
              <textarea value={interaction.data_preview} onChange={e => setInteraction(i => ({ ...i, data_preview: e.target.value }))}
                rows={3} placeholder="Request body, headers, or other interaction data…"
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 font-mono placeholder-slate-600 resize-none" />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowInteraction(null)} className="px-4 py-2 text-sm rounded border border-slate-600 text-slate-400 hover:text-slate-200 transition-colors">Cancel</button>
              <button onClick={() => hitMut.mutate(showInteraction)} disabled={hitMut.isPending}
                className="px-4 py-2 text-sm rounded bg-cyan-600 hover:bg-cyan-500 text-white font-medium disabled:opacity-60 transition-colors">
                {hitMut.isPending ? 'Saving…' : 'Log Hit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sign-off dialog */}
      {showSignOff && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg w-full max-w-md space-y-4 p-6">
            <h2 className="text-lg font-semibold text-slate-100">Sign Off Phase 6</h2>
            <p className="text-sm text-slate-400">{sessions.length} channel(s) documented with {data?.total_interactions ?? 0} total interactions.</p>
            <textarea value={signOffNotes} onChange={e => setSignOffNotes(e.target.value)} rows={2} placeholder="C2 channels documented and confirmed…"
              className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-600 resize-none" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowSignOff(false)} className="px-4 py-2 text-sm rounded border border-slate-600 text-slate-400 hover:text-slate-200 transition-colors">Cancel</button>
              <button onClick={() => signOffMut.mutate()} disabled={signOffMut.isPending}
                className="px-4 py-2 text-sm rounded bg-green-700 hover:bg-green-600 text-white font-medium disabled:opacity-60 transition-colors">
                {signOffMut.isPending ? 'Signing Off…' : 'Sign Off Phase 6'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
