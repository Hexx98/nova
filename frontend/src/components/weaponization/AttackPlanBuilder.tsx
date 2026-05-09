import { useMemo } from 'react'
import type { AttackTask, AttackPlan } from '@/api/weaponization'
import { AttackTaskCard } from './AttackTaskCard'
import { CATEGORY_LABELS } from '@/config/weaponization'

interface Props {
  plan: AttackPlan
  onTaskToggle: (taskId: string, enabled: boolean) => void
  onTaskPriority: (taskId: string, priority: string) => void
}

type GroupedTasks = Record<string, AttackTask[]>

export function AttackPlanBuilder({ plan, onTaskToggle, onTaskPriority }: Props) {
  const editable = plan.status === 'draft'

  const grouped: GroupedTasks = useMemo(() => {
    const g: GroupedTasks = {}
    for (const task of plan.items) {
      const cat = task.category
      if (!g[cat]) g[cat] = []
      g[cat].push(task)
    }
    return g
  }, [plan.items])

  const enabledCount = plan.items.filter(t => t.enabled).length
  const totalCount   = plan.items.length

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-400">
            {enabledCount} / {totalCount} tasks enabled
          </span>
          <span className={`text-xs px-2 py-0.5 rounded border font-medium ${
            plan.mode === 'ai_proposed'
              ? 'text-cyan-400 border-cyan-700 bg-cyan-900/20'
              : plan.mode === 'customized'
              ? 'text-amber-400 border-amber-700 bg-amber-900/20'
              : 'text-slate-300 border-slate-600 bg-slate-800'
          }`}>
            {plan.mode === 'ai_proposed' ? 'AI Proposed' : plan.mode === 'customized' ? 'Customized' : 'Manual'}
          </span>
        </div>
        {!editable && (
          <span className={`text-xs px-2 py-0.5 rounded border font-medium ${
            plan.status === 'approved' ? 'text-green-400 border-green-700 bg-green-900/20' : 'text-slate-400 border-slate-600'
          }`}>
            {plan.status.charAt(0).toUpperCase() + plan.status.slice(1)}
          </span>
        )}
      </div>

      {/* Tasks grouped by category */}
      {Object.entries(grouped).map(([category, tasks]) => (
        <div key={category}>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
            {CATEGORY_LABELS[category] ?? category}
            <span className="ml-2 text-slate-600 normal-case font-normal">{tasks.length}</span>
          </h3>
          <div className="space-y-2">
            {tasks.map(task => (
              <AttackTaskCard
                key={task.id}
                task={task}
                editable={editable}
                onToggle={onTaskToggle}
                onPriorityChange={onTaskPriority}
              />
            ))}
          </div>
        </div>
      ))}

      {plan.items.length === 0 && (
        <p className="text-slate-500 text-sm text-center py-12">
          No tasks in this plan. Generate an AI plan or add tasks manually.
        </p>
      )}
    </div>
  )
}
