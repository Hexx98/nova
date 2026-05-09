import clsx from 'clsx'

export const CHECKLIST_ITEMS: Array<{ key: string; label: string; hint: string; autoChecked?: boolean }> = [
  { key: 'loa_uploaded',                       label: 'Letter of Authorization uploaded',           hint: 'LoA document received and on file',                   autoChecked: true },
  { key: 'roe_uploaded',                        label: 'Rules of Engagement uploaded',               hint: 'RoE document reviewed and signed',                    autoChecked: true },
  { key: 'scope_confirmed',                     label: 'Scope reviewed and confirmed with client',   hint: 'All targets and exclusions agreed upon' },
  { key: 'emergency_contact_confirmed',         label: 'Emergency contact confirmed',                hint: 'Client emergency contact reachable and verified' },
  { key: 'data_handling_acknowledged',          label: 'Data handling requirements acknowledged',    hint: 'Operator confirms understanding of data sensitivity' },
  { key: 'operator_assigned',                   label: 'Lead operator assigned',                     hint: 'Engagement operator and backup confirmed' },
  { key: 'target_environment_noted',            label: 'Target environment documented',              hint: 'Production / staging / dev noted in RoE' },
  { key: 'notification_requirements_confirmed', label: 'Client notification requirements confirmed', hint: 'Who to notify and when is agreed upon' },
  { key: 'testing_window_confirmed',            label: 'Testing window confirmed',                   hint: 'Start and end dates/times agreed upon' },
  { key: 'legal_review_completed',             label: 'Legal review completed (if required)',        hint: 'Any jurisdiction-specific legal requirements addressed' },
]

interface ChecklistProps {
  items: Record<string, boolean>
  onToggle: (key: string, value: boolean) => void
  disabled?: boolean
}

export function PreEngagementChecklist({ items, onToggle, disabled }: ChecklistProps) {
  const allChecked = CHECKLIST_ITEMS.every((item) => items[item.key])
  const checkedCount = CHECKLIST_ITEMS.filter((item) => items[item.key]).length

  return (
    <div className="space-y-3">
      {/* Progress indicator */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-nova-muted">
          {checkedCount} / {CHECKLIST_ITEMS.length} items confirmed
        </span>
        {allChecked && (
          <span className="text-xs font-medium text-emerald-400">✓ All items confirmed — ready to proceed</span>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-nova-elevated rounded-full overflow-hidden mb-4">
        <div
          className="h-full bg-gradient-to-r from-nova-accent to-emerald-400 rounded-full transition-all duration-500"
          style={{ width: `${(checkedCount / CHECKLIST_ITEMS.length) * 100}%` }}
        />
      </div>

      {/* Items */}
      <div className="space-y-2">
        {CHECKLIST_ITEMS.map((item) => {
          const checked = !!items[item.key]
          return (
            <label
              key={item.key}
              className={clsx(
                'flex items-start gap-3 p-3 rounded-lg border transition-colors',
                checked
                  ? 'border-emerald-500/30 bg-emerald-500/5'
                  : 'border-nova-border hover:border-slate-600',
                item.autoChecked ? 'cursor-default' : 'cursor-pointer',
                disabled && 'opacity-60 cursor-not-allowed',
              )}
            >
              <div className={clsx(
                'mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                checked ? 'bg-emerald-500 border-emerald-500' : 'border-nova-muted',
              )}>
                {checked && (
                  <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className={clsx('text-sm font-medium', checked ? 'text-slate-200' : 'text-slate-400')}>
                  {item.label}
                  {item.autoChecked && (
                    <span className="ml-2 text-[10px] text-nova-muted font-normal">(auto)</span>
                  )}
                </p>
                <p className="text-xs text-nova-muted mt-0.5">{item.hint}</p>
              </div>

              {!item.autoChecked && !disabled && (
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => onToggle(item.key, e.target.checked)}
                  className="sr-only"
                />
              )}
            </label>
          )
        })}
      </div>
    </div>
  )
}
