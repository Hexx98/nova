import { useState, useMemo } from 'react'
import type { DiscoveredUrl, CrawlStats } from '@/api/delivery'

interface Props {
  urls: DiscoveredUrl[]
  stats: CrawlStats | null
  editable: boolean
  excluded: Set<string>
  onToggleExclude: (url: string) => void
}

const METHOD_COLORS: Record<string, string> = {
  GET:    'text-green-400  bg-green-900/20  border-green-800',
  POST:   'text-orange-400 bg-orange-900/20 border-orange-800',
  PUT:    'text-yellow-400 bg-yellow-900/20 border-yellow-800',
  PATCH:  'text-yellow-400 bg-yellow-900/20 border-yellow-800',
  DELETE: 'text-red-400    bg-red-900/20    border-red-800',
}

export function DiscoveredEndpoints({ urls, stats, editable, excluded, onToggleExclude }: Props) {
  const [filter, setFilter] = useState('')
  const [showExcluded, setShowExcluded] = useState(false)
  const [methodFilter, setMethodFilter] = useState<string>('ALL')

  const methods = useMemo(() => {
    const m = new Set(urls.map(u => u.method))
    return ['ALL', ...Array.from(m).sort()]
  }, [urls])

  const filtered = useMemo(() => {
    return urls.filter(u => {
      if (!showExcluded && excluded.has(u.url)) return false
      if (methodFilter !== 'ALL' && u.method !== methodFilter) return false
      if (filter && !u.url.toLowerCase().includes(filter.toLowerCase())) return false
      return true
    })
  }, [urls, filter, methodFilter, excluded, showExcluded])

  if (urls.length === 0) {
    return <p className="text-slate-500 text-sm text-center py-12">Run the crawl to discover endpoints.</p>
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: 'Total URLs',    value: stats.total_urls,    color: 'text-white' },
            { label: 'In Scope',      value: stats.in_scope,      color: 'text-green-400' },
            { label: 'With Params',   value: stats.with_params,   color: 'text-cyan-400' },
            { label: 'With Forms',    value: stats.with_forms,    color: 'text-amber-400' },
            { label: 'POST Endpoints',value: stats.post_endpoints, color: 'text-orange-400' },
          ].map(s => (
            <div key={s.label} className="bg-slate-800 rounded border border-slate-700 p-3 text-center">
              <div className={`text-xl font-bold font-mono ${s.color}`}>{s.value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="text"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filter URLs…"
          className="flex-1 min-w-40 bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-200 placeholder-slate-600"
        />
        <div className="flex gap-1">
          {methods.map(m => (
            <button
              key={m}
              onClick={() => setMethodFilter(m)}
              className={`px-2 py-1 rounded text-xs font-medium border transition-colors ${
                methodFilter === m
                  ? 'border-cyan-600 bg-cyan-900/20 text-cyan-300'
                  : 'border-slate-700 text-slate-500 hover:text-slate-300'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        {editable && excluded.size > 0 && (
          <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={showExcluded}
              onChange={e => setShowExcluded(e.target.checked)}
              className="accent-cyan-500"
            />
            Show excluded ({excluded.size})
          </label>
        )}
      </div>

      <p className="text-xs text-slate-500">{filtered.length} of {urls.length} endpoints shown</p>

      {/* URL list */}
      <div className="space-y-1 max-h-[500px] overflow-y-auto pr-1">
        {filtered.map((u, i) => {
          const isExcluded = excluded.has(u.url)
          return (
            <div
              key={i}
              className={`flex items-center gap-3 rounded px-3 py-2 border transition-colors ${
                isExcluded
                  ? 'opacity-40 border-slate-800 bg-slate-900'
                  : 'border-slate-700 bg-slate-800'
              }`}
            >
              {editable && (
                <input
                  type="checkbox"
                  checked={!isExcluded}
                  onChange={() => onToggleExclude(u.url)}
                  className="accent-cyan-500 flex-shrink-0"
                  title={isExcluded ? 'Include this URL' : 'Exclude this URL'}
                />
              )}
              <span className={`flex-shrink-0 text-xs px-1.5 py-0.5 rounded border font-mono font-medium ${METHOD_COLORS[u.method] ?? 'text-slate-400 bg-slate-800 border-slate-700'}`}>
                {u.method}
              </span>
              <span className={`flex-1 text-sm font-mono truncate ${isExcluded ? 'line-through text-slate-600' : 'text-slate-200'}`}>
                {u.url}
              </span>
              <div className="flex items-center gap-2 flex-shrink-0">
                {u.params.length > 0 && (
                  <span className="text-xs text-cyan-500 bg-cyan-900/20 border border-cyan-800 rounded px-1.5 py-0.5">
                    {u.params.length}P
                  </span>
                )}
                {u.forms > 0 && (
                  <span className="text-xs text-amber-500 bg-amber-900/20 border border-amber-800 rounded px-1.5 py-0.5">
                    {u.forms}F
                  </span>
                )}
                {u.status_code > 0 && (
                  <span className={`text-xs font-mono ${
                    u.status_code < 300 ? 'text-green-400' :
                    u.status_code < 400 ? 'text-yellow-400' :
                    u.status_code < 500 ? 'text-orange-400' :
                    'text-red-400'
                  }`}>
                    {u.status_code}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
