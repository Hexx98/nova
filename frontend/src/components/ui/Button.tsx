import { type ButtonHTMLAttributes, forwardRef } from 'react'
import clsx from 'clsx'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, className, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={clsx(
          'inline-flex items-center justify-center gap-2 font-medium rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nova-accent disabled:opacity-50 disabled:cursor-not-allowed',
          {
            'bg-nova-accent text-nova-bg hover:bg-nova-accent-dim': variant === 'primary',
            'bg-nova-elevated text-slate-200 border border-nova-border hover:border-slate-500': variant === 'secondary',
            'bg-red-600 text-white hover:bg-red-700': variant === 'danger',
            'text-slate-400 hover:text-slate-100 hover:bg-nova-elevated': variant === 'ghost',
          },
          {
            'px-2.5 py-1 text-xs': size === 'sm',
            'px-4 py-2 text-sm': size === 'md',
            'px-5 py-2.5 text-base': size === 'lg',
          },
          className,
        )}
        {...props}
      >
        {loading && (
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        )}
        {children}
      </button>
    )
  },
)

Button.displayName = 'Button'
