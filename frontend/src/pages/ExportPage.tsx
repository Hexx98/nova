import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { exportApi } from '@/api/export'

const SEV_COLORS: Record<string, string> = {
  critical: 'text-red-400',
  high:     'text-orange-400',
  medium:   'text-yellow-400',
  low:      'text-blue-400',
  info:     'text-slate-400',
}

const IMPACT_COLORS: Record<string, string> = {
  critical: 'text-red-400    bg-red-900/20    border-red-800',
  high:     'text-orange-400 bg-orange-900/20 border-orange-800',
  medium:   'text-yellow-400 bg-yellow-900/20 border-yellow-800',
  low:      'text-blue-400   bg-blue-900/20   border-blue-800',
}

export function ExportPage() {
  const { id: engagementId = '' } = useParams<{ id: string }>()

  const [showPushDialog, setShowPushDialog] = useState(false)
  const [overrideUrl, setOverrideUrl]       = useState('')
  const [overrideKey, setOverrideKey]       = useState('')
  const [pushResult, setPushResult]         = useState<{ success: boolean; message: string } | null>(null)

  const previewQuery = useQuery({
    queryKey: ['export-preview', engagementId],
    queryFn:  () => exportApi.preview(engagementId),
    enabled:  !!engagementId,
  })

  const downloadMut = useMutation({
    mutationFn: () => exportApi.download(engagementId),
  })

  const pushMut = useMutation({
    mutationFn: () => exportApi.push(engagementId, {
      titanux_url: overrideUrl || undefined,
      api_key:     overrideKey || undefined,
    }),
    onSuccess: (res) => {
      setPushResult({
        success: true,
        message: `Successfully pushed ${res.finding_count} findings to ${res.titanux_url}`,
      })
    },
    onError: (err: any) => {
      setPushResult({
        success: false,
        message: err.response?.data?.detail ?? 'Push failed — check Titanux URL and API key.',
      })
    },
  })

  const preview = previewQuery.data
  const counts  = preview?.counts
  const summary = preview?.summary
  const ready   = preview?.readiness

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Export to Titanux</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Export findings, objectives, and engagement data to Titanux
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => downloadMut.mutate()}
            disabled={downloadMut.isPending || !preview}
            className="px-3 py-1.5 text-sm rounded border border-slate-600 text-slate-300 hover:text-white hover:border-slate-500 disabled:opacity-40 transition-colors"
          >
            {downloadMut.isPending ? 'Preparing…' : '↓ Download JSON'}
          </button>
          <button
            onClick={() => { setPushResult(null); setShowPushDialog(true) }}
            disabled={!preview}
            className="px-4 py-2 text-sm rounded bg-cyan-600 hover:bg-cyan-500 text-white font-medium disabled:opacity-40 transition-colors"
          >
            Push to Titanux
          </button>
        </div>
      </div>

      {previewQuery.isLoading && (
        <div className="text-slate-500 text-sm text-center py-12">Loading export preview…</div>
      )}

      {preview && (
        <>
          {/* Engagement info */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-200">{preview.engagement.name}</h2>
              <span className={`text-xs px-2 py-0.5 rounded border font-medium capitalize ${
                preview.engagement.status === 'complete'
                  ? 'text-green-400 border-green-800 bg-green-900/20'
                  : 'text-amber-400 border-amber-800 bg-amber-900/20'
              }`}>
                {preview.engagement.status}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <div className="text-slate-500">Target</div>
              <div className="text-slate-300 font-mono">{preview.engagement.target_domain}</div>
              {preview.engagement.operator && (
                <>
                  <div className="text-slate-500">Operator</div>
                  <div className="text-slate-300">{preview.engagement.operator}</div>
                </>
              )}
              {preview.engagement.start_date && (
                <>
                  <div className="text-slate-500">Dates</div>
                  <div className="text-slate-300">
                    {new Date(preview.engagement.start_date).toLocaleDateString()}
                    {preview.engagement.end_date && ` — ${new Date(preview.engagement.end_date).toLocaleDateString()}`}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Readiness */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-300">Phase Readiness</h3>
            <div className="grid grid-cols-2 gap-2">
              {(ready?.phases_complete ?? []).map(name => (
                <div key={name} className="flex items-center gap-2 text-sm text-green-400">
                  <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414L8.414 15l-4.121-4.121a1 1 0 111.414-1.414L8.414 12.172l7.879-7.879a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  {name}
                </div>
              ))}
              {(ready?.phases_incomplete ?? []).map(name => (
                <div key={name} className="flex items-center gap-2 text-sm text-slate-500">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="9" strokeWidth="2" />
                  </svg>
                  {name}
                </div>
              ))}
            </div>
            {!ready?.engagement_complete && (
              <p className="text-xs text-amber-400 bg-amber-900/10 border border-amber-800 rounded px-3 py-2">
                Engagement not yet complete. You can still export a partial snapshot — all available data will be included.
              </p>
            )}
          </div>

          {/* Content summary */}
          <div className="grid grid-cols-2 gap-4">
            {/* Findings */}
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold text-slate-300">Findings</h3>
              <div className="text-3xl font-bold font-mono text-white">{counts?.findings ?? 0}</div>
              <div className="space-y-1">
                {Object.entries(counts?.finding_counts ?? {}).filter(([, v]) => (v as number) > 0).map(([sev, cnt]) => (
                  <div key={sev} className="flex items-center justify-between text-sm">
                    <span className={`capitalize ${SEV_COLORS[sev]}`}>{sev}</span>
                    <span className="text-slate-300 font-mono">{cnt as number}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Impact + Objectives */}
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold text-slate-300">Assessment</h3>
              {summary?.business_impact ? (
                <span className={`inline-block text-sm px-2 py-1 rounded border font-medium capitalize ${IMPACT_COLORS[summary.business_impact] ?? ''}`}>
                  {summary.business_impact} impact
                </span>
              ) : (
                <span className="text-sm text-slate-500">Impact not assessed</span>
              )}
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Objectives</span>
                  <span className={summary?.objectives_count ? 'text-slate-300' : 'text-slate-600'}>{summary?.objectives_count ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Executive Summary</span>
                  <span className={summary?.has_executive_summary ? 'text-green-400' : 'text-red-400'}>
                    {summary?.has_executive_summary ? '✓' : '✗ Missing'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Artifacts</span>
                  <span className="text-slate-300">{counts?.artifacts ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">C2 Sessions</span>
                  <span className="text-slate-300">{counts?.c2_sessions ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Attack Surface URLs</span>
                  <span className="text-slate-300">{counts?.target_urls ?? 0}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Titanux connection status */}
          <div className={`rounded-lg border p-4 flex items-start gap-3 ${
            preview.titanux_configured
              ? 'bg-green-900/10 border-green-800'
              : 'bg-slate-800 border-slate-700'
          }`}>
            <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${preview.titanux_configured ? 'bg-green-500' : 'bg-slate-600'}`} />
            <div>
              <div className="text-sm font-medium text-slate-200">
                {preview.titanux_configured ? 'Titanux Connected' : 'Titanux Not Configured'}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                {preview.titanux_configured
                  ? `Endpoint: ${preview.titanux_url}`
                  : 'Set TITANUX_URL and TITANUX_API_KEY in the environment, or enter them manually when pushing.'}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Push dialog */}
      {showPushDialog && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg w-full max-w-md space-y-4 p-6">
            <h2 className="text-lg font-semibold text-slate-100">Push to Titanux</h2>

            {pushResult ? (
              <div className={`rounded p-3 text-sm ${pushResult.success ? 'bg-green-900/20 border border-green-800 text-green-300' : 'bg-red-900/20 border border-red-800 text-red-300'}`}>
                {pushResult.message}
              </div>
            ) : (
              <>
                <p className="text-sm text-slate-400">
                  {preview?.titanux_configured
                    ? 'Using configured Titanux instance. Optionally override below.'
                    : 'Enter your Titanux URL and API key to push this export.'}
                </p>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">
                      Titanux URL {preview?.titanux_configured && <span className="text-slate-600 normal-case font-normal">(optional override)</span>}
                    </label>
                    <input
                      type="text"
                      value={overrideUrl}
                      onChange={e => setOverrideUrl(e.target.value)}
                      placeholder={preview?.titanux_url ?? 'https://titanux.internal'}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">
                      API Key {preview?.titanux_configured && <span className="text-slate-600 normal-case font-normal">(optional override)</span>}
                    </label>
                    <input
                      type="password"
                      value={overrideKey}
                      onChange={e => setOverrideKey(e.target.value)}
                      placeholder={preview?.titanux_configured ? '••••••••' : 'tx-...'}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-600"
                    />
                  </div>
                </div>

                <div className="bg-slate-900 rounded p-3 text-xs text-slate-500 space-y-1">
                  <div className="font-medium text-slate-400">Will push:</div>
                  <div>{counts?.findings ?? 0} findings · {counts?.artifacts ?? 0} artifacts · {counts?.c2_sessions ?? 0} C2 sessions</div>
                  <div>Executive summary: {summary?.has_executive_summary ? '✓' : '✗ missing'}</div>
                </div>
              </>
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setShowPushDialog(false); setPushResult(null) }}
                className="px-4 py-2 text-sm rounded border border-slate-600 text-slate-400 hover:text-slate-200 transition-colors"
              >
                {pushResult ? 'Close' : 'Cancel'}
              </button>
              {!pushResult && (
                <button
                  onClick={() => pushMut.mutate()}
                  disabled={pushMut.isPending || (!preview?.titanux_configured && !overrideUrl)}
                  className="px-4 py-2 text-sm rounded bg-cyan-600 hover:bg-cyan-500 text-white font-medium disabled:opacity-60 transition-colors"
                >
                  {pushMut.isPending ? 'Pushing…' : 'Push to Titanux'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
