import clsx from 'clsx'
import type { ToolLiveStatus } from '@/hooks/useLiveFeed'
import type { TierDef } from '@/config/recon'

interface ToolStatusListProps {
  tiers: TierDef[]
  toolStatuses: Record<string, ToolLiveStatus>
  activeTool: string | null
  onSelectTool: (tool: string | null) => void
  enabledTools: Record<string, boolean>
  onToggleTool: (tool: string, enabled: boolean) => void
  editable: boolean
}

const STATUS_DOT: Record<ToolLiveStatus['status'], string> = {
  pending:   'bg-slate-600',
  running:   'bg-nova-accent animate-pulse',
  complete:  'bg-emerald-400',
  error:     'bg-red-400',
  cancelled: 'bg-slate-700',
}

export function ToolStatusList({
  tiers, toolStatuses, activeTool, onSelectTool, enabledTools, onToggleTool, editable,
}: ToolStatusListProps) {
  return (
    <div className="space-y-4 text-sm">
      {tiers.map((tier) => {
        const tierTools = tier.tools.filter((t) => enabledTools[t.name] !== false)
        const runningCount = tierTools.filter((t) => toolStatuses[t.name]?.status === 'running').length
        const completeCount = tierTools.filter((t) => toolStatuses[t.name]?.status === 'complete').length

        return (
          <div key={tier.tier}>
            {/* Tier header */}
            <div className="flex items-center justify-between mb-1.5 px-1">
              <div className="flex items-center gap-2">
                <span className={clsx(
                  'text-[10px] font-bold px-1.5 py-0.5 rounded font-mono',
                  tier.requires_approval
                    ? 'bg-yellow-500/20 text-yellow-400'
                    : 'bg-nova-elevated text-nova-muted',
                )}>
                  T{tier.tier}
                </span>
                <span className="text-xs font-medium text-slate-300">{tier.name}</span>
              </div>
              {runningCount > 0 && (
                <span className="text-[10px] text-nova-accent">{runningCount} running</span>
              )}
              {runningCount === 0 && completeCount === tierTools.length && tierTools.length > 0 && (
                <span className="text-[10px] text-emerald-400">✓</span>
              )}
            </div>

            {/* Tools */}
            <div className="space-y-0.5">
              {tier.tools.map((tool) => {
                const st = toolStatuses[tool.name]
                const enabled = enabledTools[tool.name] !== false
                const isActive = activeTool === tool.name

                return (
                  <div
                    key={tool.name}
                    onClick={() => enabled && onSelectTool(isActive ? null : tool.name)}
                    className={clsx(
                      'flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors',
                      isActive ? 'bg-nova-elevated border border-nova-border' : 'hover:bg-nova-elevated/40',
                      !enabled && 'opacity-40',
                    )}
                  >
                    {/* Status dot */}
                    <span className={clsx(
                      'w-2 h-2 rounded-full shrink-0',
                      st ? STATUS_DOT[st.status] : (enabled ? 'bg-slate-600' : 'bg-slate-800'),
                    )} />

                    <span className={clsx(
                      'flex-1 text-xs truncate',
                      st?.status === 'running' ? 'text-slate-100' :
                      st?.status === 'complete' ? 'text-slate-300' :
                      st?.status === 'error' ? 'text-red-400' : 'text-slate-500',
                    )}>
                      {tool.name}
                    </span>

                    {st?.lineCount ? (
                      <span className="text-[10px] text-nova-muted tabular-nums">{st.lineCount}</span>
                    ) : null}

                    {editable && (
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(e) => { e.stopPropagation(); onToggleTool(tool.name, e.target.checked) }}
                        onClick={(e) => e.stopPropagation()}
                        className="accent-nova-accent"
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
