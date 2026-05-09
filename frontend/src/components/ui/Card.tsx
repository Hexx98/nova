import clsx from 'clsx'

interface CardProps {
  children: React.ReactNode
  className?: string
  padding?: boolean
}

export function Card({ children, className, padding = true }: CardProps) {
  return (
    <div
      className={clsx(
        'bg-nova-surface border border-nova-border rounded-lg',
        padding && 'p-5',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function CardHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">{title}</h3>
      {action}
    </div>
  )
}
