import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { deliveryApi, type AuthMethod, type SaveConfigRequest } from '@/api/delivery'
import { AuthConfigPanel } from '@/components/delivery/AuthConfigPanel'
import { CrawlConfigPanel } from '@/components/delivery/CrawlConfigPanel'
import { DiscoveredEndpoints } from '@/components/delivery/DiscoveredEndpoints'
import { useLiveFeed } from '@/hooks/useLiveFeed'

type Tab = 'auth' | 'crawl' | 'endpoints'

const DEFAULT_CONFIG: SaveConfigRequest = {
  auth_method:      'none',
  auth_config:      {},
  seed_urls:        [],
  include_patterns: [],
  exclude_patterns: [],
  max_depth:        5,
  max_pages:        500,
  render_js:        false,
  custom_headers:   {},
}

export function DeliveryPage() {
  const { id: engagementId = '' } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('auth')
  const [draft, setDraft] = useState<SaveConfigRequest>(DEFAULT_CONFIG)
  const [isDirty, setIsDirty] = useState(false)
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [showApproveDialog, setShowApproveDialog] = useState(false)
  const [approveNotes, setApproveNotes] = useState('')

  const { lines, connected, clearLines } = useLiveFeed(engagementId)

  const invalidate = () => qc.invalidateQueries({ queryKey: ['delivery', engagementId] })

  const configQuery = useQuery({
    queryKey: ['delivery', engagementId],
    queryFn: () => deliveryApi.getConfig(engagementId),
    enabled: !!engagementId,
    refetchInterval: (data) => {
      const status = (data as any)?.config?.status
      return status === 'crawling' ? 3000 : false
    },
  })

  const cfg = configQuery.data?.config ?? null

  // Sync draft from server config on first load
  useEffect(() => {
    if (cfg && !isDirty) {
      setDraft({
        auth_method:      cfg.auth_method,
        auth_config:      cfg.auth_config,
        seed_urls:        cfg.seed_urls,
        include_patterns: cfg.include_patterns,
        exclude_patterns: cfg.exclude_patterns,
        max_depth:        cfg.max_depth,
        max_pages:        cfg.max_pages,
        render_js:        cfg.render_js,
        custom_headers:   cfg.custom_headers,
      })
    }
  }, [cfg])

  const saveMut = useMutation({
    mutationFn: () => deliveryApi.saveConfig(engagementId, draft),
    onSuccess: () => { invalidate(); setIsDirty(false) },
  })

  const startMut = useMutation({
    mutationFn: () => deliveryApi.startCrawl(engagementId),
    onSuccess: () => { invalidate(); setTab('endpoints') },
  })

  const stopMut = useMutation({
    mutationFn: () => deliveryApi.stopCrawl(engagementId),
    onSuccess: invalidate,
  })

  const approveMut = useMutation({
    mutationFn: () => deliveryApi.approve(engagementId, Array.from(excluded), approveNotes),
    onSuccess: () => { invalidate(); setShowApproveDialog(false) },
  })

  const resetMut = useMutation({
    mutationFn: () => deliveryApi.reset(engagementId),
    onSuccess: invalidate,
  })

  function updateDraft(field: string, value: unknown) {
    setDraft(prev => ({ ...prev, [field]: value }))
    setIsDirty(true)
  }

  function toggleExclude(url: string) {
    setExcluded(prev => {
      const next = new Set(prev)
      if (next.has(url)) next.delete(url)
      else next.add(url)
      return next
    })
  }

  const isApproved = cfg?.status === 'approved'
  const isCrawling = cfg?.status === 'crawling'
  const isComplete = cfg?.status === 'complete'
  const editable   = !isCrawling && !isApproved

  const TABS: { id: Tab; label: string }[] = [
    { id: 'auth',      label: 'Authentication' },
    { id: 'crawl',     label: 'Crawl Config'   },
    { id: 'endpoints', label: `Endpoints${cfg?.crawl_stats ? ` (${cfg.crawl_stats.total_urls})` : ''}` },
  ]

  // Live feed lines count for crawl activity indicator
  const crawlLines = lines.filter(l => l.tool === 'crawl' || !l.tool)

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Phase 3 — Delivery</h1>
          <p className="text-sm text-slate-400 mt-0.5">Authenticated crawl configuration and attack surface mapping</p>
        </div>

        <div className="flex items-center gap-2">
          {isApproved && (
            <button
              onClick={() => resetMut.mutate()}
              disabled={resetMut.isPending}
              className="px-3 py-1.5 text-sm rounded border border-slate-600 text-slate-400 hover:text-slate-200 disabled:opacity-40 transition-colors"
            >
              Reset to Review
            </button>
          )}

          {isCrawling ? (
            <button
              onClick={() => stopMut.mutate()}
              disabled={stopMut.isPending}
              className="px-4 py-2 rounded bg-red-700 hover:bg-red-600 text-white text-sm font-medium disabled:opacity-60 transition-colors"
            >
              {stopMut.isPending ? 'Stopping…' : 'Stop Crawl'}
            </button>
          ) : isComplete ? (
            <button
              onClick={() => setShowApproveDialog(true)}
              className="px-4 py-2 rounded bg-green-700 hover:bg-green-600 text-white text-sm font-medium transition-colors"
            >
              Review &amp; Approve
            </button>
          ) : isApproved ? (
            <span className="px-3 py-1.5 text-sm rounded border border-green-700 bg-green-900/20 text-green-400 font-medium">
              ✓ Approved
            </span>
          ) : (
            <button
              onClick={() => {
                if (isDirty) {
                  saveMut.mutate(undefined, { onSuccess: () => startMut.mutate() })
                } else {
                  startMut.mutate()
                }
              }}
              disabled={startMut.isPending || saveMut.isPending}
              className="px-4 py-2 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium disabled:opacity-60 transition-colors"
            >
              {startMut.isPending || saveMut.isPending ? 'Starting…' : cfg ? 'Start Crawl' : 'Save & Start Crawl'}
            </button>
          )}
        </div>
      </div>

      {/* Status bar */}
      {cfg && (
        <div className="flex items-center gap-4 text-sm">
          <span className={`flex items-center gap-1.5 font-medium ${
            isCrawling  ? 'text-cyan-400' :
            isComplete  ? 'text-amber-400' :
            isApproved  ? 'text-green-400' :
            'text-slate-400'
          }`}>
            {isCrawling && <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />}
            {isCrawling  ? 'Crawling…' :
             isComplete  ? 'Crawl complete — review endpoints' :
             isApproved  ? 'Approved' :
             'Ready'}
          </span>
          {cfg.crawl_stats && (
            <span className="text-slate-500">{cfg.crawl_stats.total_urls} URLs discovered</span>
          )}
          {isCrawling && crawlLines.length > 0 && (
            <span className="text-slate-600 font-mono text-xs">{crawlLines.length} lines</span>
          )}
        </div>
      )}

      {/* Save/discard if dirty */}
      {isDirty && editable && (
        <div className="flex items-center gap-3 bg-amber-900/10 border border-amber-800 rounded px-4 py-2">
          <span className="text-sm text-amber-300 flex-1">Unsaved configuration changes</span>
          <button
            onClick={() => { setDraft({ ...DEFAULT_CONFIG, ...(cfg ?? {}) }); setIsDirty(false) }}
            className="text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            Discard
          </button>
          <button
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending}
            className="px-3 py-1 text-sm rounded bg-amber-700 hover:bg-amber-600 text-white font-medium disabled:opacity-60 transition-colors"
          >
            {saveMut.isPending ? 'Saving…' : 'Save'}
          </button>
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
        {tab === 'auth' && (
          <AuthConfigPanel
            method={draft.auth_method as AuthMethod}
            config={draft.auth_config}
            editable={editable}
            onMethodChange={m => updateDraft('auth_method', m)}
            onConfigChange={c => updateDraft('auth_config', c)}
          />
        )}

        {tab === 'crawl' && (
          <CrawlConfigPanel
            seedUrls={draft.seed_urls}
            includePatterns={draft.include_patterns}
            excludePatterns={draft.exclude_patterns}
            maxDepth={draft.max_depth}
            maxPages={draft.max_pages}
            renderJs={draft.render_js}
            customHeaders={draft.custom_headers}
            editable={editable}
            onChange={updateDraft}
          />
        )}

        {tab === 'endpoints' && (
          <DiscoveredEndpoints
            urls={cfg?.discovered_urls ?? []}
            stats={cfg?.crawl_stats ?? null}
            editable={isComplete}
            excluded={excluded}
            onToggleExclude={toggleExclude}
          />
        )}
      </div>

      {/* Live feed while crawling */}
      {isCrawling && (
        <div className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Live Crawl Output</span>
            <div className="flex items-center gap-2">
              {connected && <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />}
              <button onClick={clearLines} className="text-xs text-slate-600 hover:text-slate-400">Clear</button>
            </div>
          </div>
          <div className="h-48 overflow-y-auto p-3 font-mono text-xs text-slate-400 space-y-0.5">
            {crawlLines.slice(-100).map((l, i) => (
              <div key={i} className="leading-5">{l.line ?? JSON.stringify(l)}</div>
            ))}
            {crawlLines.length === 0 && (
              <span className="text-slate-600">Waiting for crawl output…</span>
            )}
          </div>
        </div>
      )}

      {/* Approve dialog */}
      {showApproveDialog && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg w-full max-w-md space-y-4 p-6">
            <h2 className="text-lg font-semibold text-slate-100">Approve Phase 3 — Delivery</h2>
            <p className="text-sm text-slate-400">
              {excluded.size > 0
                ? `${excluded.size} URL${excluded.size > 1 ? 's' : ''} excluded. `
                : ''}
              {(cfg?.crawl_stats?.total_urls ?? 0) - excluded.size} endpoints will be passed to Phase 4 — Exploitation.
            </p>
            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">
                Approval Notes (optional)
              </label>
              <textarea
                value={approveNotes}
                onChange={e => setApproveNotes(e.target.value)}
                rows={3}
                placeholder="Excluded static assets, confirmed auth working…"
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
                onClick={() => approveMut.mutate()}
                disabled={approveMut.isPending}
                className="px-4 py-2 text-sm rounded bg-green-700 hover:bg-green-600 text-white font-medium disabled:opacity-60 transition-colors"
              >
                {approveMut.isPending ? 'Approving…' : 'Approve Phase 3'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
