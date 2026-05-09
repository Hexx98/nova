import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import type { LiveMessage } from '@/hooks/useLiveFeed'

const TOOL_COLORS: Record<string, string> = {
  theHarvester: 'text-cyan-400',
  Shodan:       'text-purple-400',
  Censys:       'text-blue-400',
  WHOIS:        'text-slate-400',
  Subfinder:    'text-emerald-400',
  Amass:        'text-green-400',
  httpx:        'text-nova-accent',
  Naabu:        'text-yellow-400',
  WhatWeb:      'text-orange-400',
  wafw00f:      'text-red-400',
  Feroxbuster:  'text-pink-400',
  Nikto:        'text-red-300',
}

function toolColor(tool?: string) {
  if (!tool) return 'text-slate-500'
  return TOOL_COLORS[tool] ?? 'text-slate-400'
}

interface LiveFeedProps {
  lines: LiveMessage[]
  filterTool: string | null
  connected: boolean
  onClear: () => void
}

export function LiveFeed({ lines, filterTool, connected, onClear }: LiveFeedProps) {
  const endRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (autoScroll) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [lines, autoScroll])

  function handleScroll() {
    const el = containerRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60
    setAutoScroll(atBottom)
  }

  const displayed = filterTool
    ? lines.filter((l) => l.tool === filterTool)
    : lines

  return (
    <div className="flex flex-col h-full">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-nova-border bg-nova-elevated/50 shrink-0">
        <div className="flex items-center gap-2">
          <span className={clsx(
            'w-2 h-2 rounded-full',
            connected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600',
          )} />
          <span className="text-xs text-nova-muted">
            {connected ? 'Live' : 'Disconnected'}
            {filterTool && <span className="ml-2 text-nova-accent">· {filterTool}</span>}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] text-nova-muted tabular-nums">{displayed.length} lines</span>
          <button
            onClick={() => setAutoScroll(true)}
            className={clsx(
              'text-[10px] px-1.5 py-0.5 rounded transition-colors',
              autoScroll ? 'text-nova-accent' : 'text-nova-muted hover:text-slate-300',
            )}
          >
            ↓ scroll
          </button>
          <button onClick={onClear} className="text-[10px] text-nova-muted hover:text-slate-300 transition-colors">
            clear
          </button>
        </div>
      </div>

      {/* Output */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-3 font-mono text-xs leading-relaxed"
      >
        {displayed.length === 0 ? (
          <div className="flex items-center justify-center h-full text-nova-muted">
            {connected ? 'Waiting for tool output...' : 'Not connected'}
          </div>
        ) : (
          displayed.map((msg, i) => (
            <div key={i} className="flex gap-2 hover:bg-nova-elevated/20 px-1 py-0.5 rounded group">
              {msg.tool && (
                <span className={clsx('shrink-0 w-24 truncate opacity-70 group-hover:opacity-100', toolColor(msg.tool))}>
                  [{msg.tool}]
                </span>
              )}
              <span className="text-slate-300 break-all">{msg.line}</span>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
    </div>
  )
}
