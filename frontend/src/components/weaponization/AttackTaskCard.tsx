import { useState } from 'react'
import type { AttackTask } from '@/api/weaponization'
import { CATEGORY_LABELS, PRIORITY_COLORS, PRIORITY_DOT, TOOL_LABELS } from '@/config/weaponization'

interface Props {
  task: AttackTask
  editable: boolean
  onToggle: (id: string, enabled: boolean) => void
  onPriorityChange: (id: string, priority: string) => void
}

const PRIORITIES = ['critical', 'high', 'medium', 'low'] as const

export function AttackTaskCard({ task, editable, onToggle, onPriorityChange }: Props) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className={`rounded border transition-colors ${
        task.enabled
          ? 'bg-slate-800 border-slate-700'
          : 'bg-slate-900 border-slate-800 opacity-50'
      }`}
    >
      <div className="flex items-center gap-3 p-3">
        {/* Toggle */}
        {editable && (
          <button
            onClick={() => onToggle(task.id, !task.enabled)}
            className={`flex-shrink-0 w-5 h-5 rounded border-2 transition-colors ${
              task.enabled
                ? 'bg-cyan-500 border-cyan-500'
                : 'bg-transparent border-slate-600 hover:border-slate-400'
            }`}
            title={task.enabled ? 'Disable task' : 'Enable task'}
          >
            {task.enabled && (
              <svg className="w-3 h-3 m-auto text-slate-900" fill="currentColor" viewBox="0 0 12 12">
                <path d="M10 3L5 8.5 2 5.5l-1 1L5 10.5 11 4z" />
              </svg>
            )}
          </button>
        )}

        {!editable && (
          <div className={`flex-shrink-0 w-2 h-2 rounded-full mt-0.5 ${PRIORITY_DOT[task.priority] ?? 'bg-slate-500'}`} />
        )}

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-slate-100">{task.technique}</span>
            {task.cve_ref && (
              <span className="text-xs font-mono text-cyan-400 bg-cyan-900/20 border border-cyan-800 px-1.5 py-0.5 rounded">
                {task.cve_ref}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-slate-500">{CATEGORY_LABELS[task.category] ?? task.category}</span>
            <span className="text-slate-700">·</span>
            <span className="text-xs text-slate-500">{TOOL_LABELS[task.tool] ?? task.tool}</span>
          </div>
        </div>

        {/* Priority badge / selector */}
        {editable ? (
          <select
            value={task.priority}
            onChange={e => onPriorityChange(task.id, e.target.value)}
            className={`text-xs px-2 py-1 rounded border font-medium bg-transparent cursor-pointer ${PRIORITY_COLORS[task.priority]}`}
            onClick={e => e.stopPropagation()}
          >
            {PRIORITIES.map(p => (
              <option key={p} value={p} className="bg-slate-900 text-slate-100">
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </option>
            ))}
          </select>
        ) : (
          <span className={`text-xs px-2 py-0.5 rounded border font-medium uppercase ${PRIORITY_COLORS[task.priority]}`}>
            {task.priority}
          </span>
        )}

        {/* Expand */}
        <button
          onClick={() => setExpanded(e => !e)}
          className="text-slate-600 hover:text-slate-400 transition-colors"
        >
          <svg
            className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {expanded && (
        <div className="px-3 pb-3 pt-0 space-y-2 border-t border-slate-700 mt-0">
          <p className="text-sm text-slate-400 pt-2">{task.description}</p>
          {task.operator_notes && (
            <p className="text-xs text-amber-400 bg-amber-900/20 border border-amber-800 rounded px-2 py-1">
              Note: {task.operator_notes}
            </p>
          )}
          {Object.keys(task.params).length > 0 && (
            <pre className="text-xs text-slate-500 bg-slate-900 rounded p-2 overflow-x-auto">
              {JSON.stringify(task.params, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
