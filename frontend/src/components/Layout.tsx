import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { useEngagementStore } from '@/store/engagement'
import { PhaseStatusDot } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { emergencyStop } from '@/api/engagements'
import { PHASE_NAMES } from '@/types'
import clsx from 'clsx'

export function Layout() {
  const { user, logout } = useAuthStore()
  const { activeEngagement, phases } = useEngagementStore()
  const navigate = useNavigate()

  async function handleEmergencyStop() {
    if (!activeEngagement) return
    const confirmed = window.confirm(
      `EMERGENCY STOP — this will immediately kill all running tasks for ${activeEngagement.name}. Continue?`,
    )
    if (!confirmed) return
    await emergencyStop(activeEngagement.id)
  }

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex h-screen overflow-hidden bg-nova-bg">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 flex flex-col bg-nova-surface border-r border-nova-border overflow-y-auto">
        {/* Logo */}
        <div className="px-5 py-4 border-b border-nova-border">
          <span className="text-lg font-bold tracking-tight text-nova-accent font-mono">
            ◈ NOVA
          </span>
          <p className="text-[10px] text-nova-muted mt-0.5 uppercase tracking-widest">
            Web App Pentest Platform
          </p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          <SidebarLink to="/dashboard" label="Dashboard" icon="⊞" />
          <SidebarLink to="/engagements" label="Engagements" icon="◉" />
          <SidebarLink to="/audit" label="Audit Log" icon="≡" />

          {/* Phase navigation — only when an engagement is active */}
          {activeEngagement && phases.length > 0 && (
            <>
              <div className="pt-4 pb-1.5 px-2">
                <p className="text-[10px] font-semibold text-nova-muted uppercase tracking-widest">
                  {activeEngagement.target_domain}
                </p>
              </div>

              {phases.map((phase) => (
                <NavLink
                  key={phase.phase_number}
                  to={`/engagements/${activeEngagement.id}/phase/${phase.phase_number}`}
                  className={({ isActive }) =>
                    clsx(
                      'flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors',
                      isActive
                        ? 'bg-nova-elevated text-slate-100'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-nova-elevated/60',
                    )
                  }
                >
                  <PhaseStatusDot status={phase.status} />
                  <span className="text-[11px] font-mono text-nova-muted mr-0.5">
                    {phase.phase_number}
                  </span>
                  <span className="truncate text-xs">{PHASE_NAMES[phase.phase_number]}</span>
                </NavLink>
              ))}

              {/* Engagement-level links — shown below phases */}
              <div className="mt-1 border-t border-nova-border pt-2 space-y-0.5">
                {[
                  { to: `/engagements/${activeEngagement.id}/attack-coverage`, icon: '◈', label: 'ATT&CK Coverage' },
                  { to: `/engagements/${activeEngagement.id}/audit`,           icon: '≡', label: 'Audit Log' },
                  { to: `/engagements/${activeEngagement.id}/export`,          icon: '⎘', label: 'Export to Titanux' },
                ].map(({ to, icon, label }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) =>
                      clsx(
                        'flex items-center gap-2.5 px-2.5 py-2 rounded-md transition-colors',
                        isActive
                          ? 'bg-nova-elevated text-slate-100'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-nova-elevated/60',
                      )
                    }
                  >
                    <span className="text-nova-muted">{icon}</span>
                    <span className="truncate text-xs">{label}</span>
                  </NavLink>
                ))}
              </div>
            </>
          )}
        </nav>

        {/* User / logout */}
        <div className="px-3 py-3 border-t border-nova-border space-y-1">
          <div className="px-2.5 py-1.5">
            <p className="text-xs font-medium text-slate-300 truncate">{user?.full_name}</p>
            <p className="text-[11px] text-nova-muted truncate">{user?.role?.replace('_', ' ')}</p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs text-slate-400 hover:text-slate-200 hover:bg-nova-elevated transition-colors"
          >
            ⎋ Sign out
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="h-12 shrink-0 flex items-center justify-between px-5 border-b border-nova-border bg-nova-surface">
          <div className="flex items-center gap-2 text-sm text-nova-muted">
            {activeEngagement ? (
              <>
                <span className="text-slate-400">{activeEngagement.name}</span>
                <span>·</span>
                <span className="font-mono text-xs">{activeEngagement.target_domain}</span>
              </>
            ) : (
              <span>Nova</span>
            )}
          </div>

          {activeEngagement && (
            <Button
              variant="danger"
              size="sm"
              onClick={handleEmergencyStop}
              className="animate-pulse-slow"
            >
              ⏹ Emergency Stop
            </Button>
          )}
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function SidebarLink({ to, label, icon }: { to: string; label: string; icon: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        clsx(
          'flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors',
          isActive
            ? 'bg-nova-elevated text-slate-100'
            : 'text-slate-400 hover:text-slate-200 hover:bg-nova-elevated/60',
        )
      }
    >
      <span className="text-nova-muted">{icon}</span>
      {label}
    </NavLink>
  )
}
