import clsx from 'clsx'
import type { Severity, PhaseStatus, EngagementStatus } from '@/types'

interface BadgeProps {
  children: React.ReactNode
  className?: string
}

export function Badge({ children, className }: BadgeProps) {
  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', className)}>
      {children}
    </span>
  )
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const styles: Record<Severity, string> = {
    critical: 'bg-red-500/15 text-red-400 border border-red-500/30',
    high:     'bg-orange-500/15 text-orange-400 border border-orange-500/30',
    medium:   'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30',
    low:      'bg-blue-500/15 text-blue-400 border border-blue-500/30',
    info:     'bg-slate-500/15 text-slate-400 border border-slate-500/30',
  }
  return <Badge className={styles[severity]}>{severity.toUpperCase()}</Badge>
}

export function PhaseStatusDot({ status }: { status: PhaseStatus }) {
  const styles: Record<PhaseStatus, string> = {
    complete:    'bg-emerald-400',
    in_progress: 'bg-nova-accent animate-pulse',
    pending:     'bg-slate-600',
    skipped:     'bg-slate-700',
  }
  return <span className={clsx('inline-block w-2 h-2 rounded-full shrink-0', styles[status])} />
}

export function EngagementStatusBadge({ status }: { status: EngagementStatus }) {
  const styles: Record<EngagementStatus, string> = {
    setup:    'bg-slate-500/15 text-slate-400 border border-slate-500/30',
    active:   'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
    paused:   'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30',
    complete: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
    archived: 'bg-slate-700/30 text-slate-500 border border-slate-700/50',
  }
  return <Badge className={styles[status]}>{status}</Badge>
}
