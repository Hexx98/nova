import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getAuditLog } from '@/api/audit'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import type { AuditEntry } from '@/types'

const PAGE_SIZE = 50

function formatAction(action: string): string {
  return action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })
}

function actionColor(action: string): string {
  if (action.includes('fail') || action.includes('stop') || action.includes('error')) return 'text-red-400'
  if (action.includes('login') || action.includes('totp')) return 'text-sky-400'
  if (action.includes('sign_off') || action.includes('approved') || action.includes('complete')) return 'text-emerald-400'
  if (action.includes('start') || action.includes('create')) return 'text-nova-accent'
  return 'text-slate-300'
}

function DetailsCell({ entry }: { entry: AuditEntry }) {
  const [open, setOpen] = useState(false)
  if (!entry.details || Object.keys(entry.details).length === 0) {
    return <span className="text-nova-muted">—</span>
  }
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-nova-accent hover:underline"
      >
        {open ? 'hide' : 'show'}
      </button>
      {open && (
        <pre className="mt-1 text-[10px] text-slate-400 bg-nova-elevated rounded p-2 overflow-x-auto max-w-xs">
          {JSON.stringify(entry.details, null, 2)}
        </pre>
      )}
    </div>
  )
}

export function AuditLogPage() {
  const { id: engagementId } = useParams<{ id?: string }>()
  const [offset, setOffset] = useState(0)

  const { data: entries = [], isFetching, refetch } = useQuery({
    queryKey: ['audit', engagementId, offset],
    queryFn: () => getAuditLog({
      engagement_id: engagementId,
      limit: PAGE_SIZE,
      offset,
    }),
    refetchInterval: 30_000,
  })

  const hasPrev = offset > 0
  const hasNext = entries.length === PAGE_SIZE

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">Audit Log</h1>
          <p className="text-xs text-nova-muted mt-0.5">
            {engagementId ? 'Engagement-scoped view' : 'Global view — all engagements'}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? 'Refreshing…' : '↻ Refresh'}
        </Button>
      </div>

      <Card padding={false}>
        <CardHeader
          title={`${entries.length} entries${offset > 0 ? ` (page ${Math.floor(offset / PAGE_SIZE) + 1})` : ''}`}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-nova-border text-left">
                <th className="px-4 py-2.5 text-nova-muted font-medium w-40">Time</th>
                <th className="px-4 py-2.5 text-nova-muted font-medium">Action</th>
                <th className="px-4 py-2.5 text-nova-muted font-medium">Resource</th>
                <th className="px-4 py-2.5 text-nova-muted font-medium w-32">IP</th>
                <th className="px-4 py-2.5 text-nova-muted font-medium w-28">User</th>
                <th className="px-4 py-2.5 text-nova-muted font-medium w-20">Details</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-nova-muted">
                    No audit entries found
                  </td>
                </tr>
              )}
              {entries.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-b border-nova-border/50 hover:bg-nova-elevated/30 transition-colors"
                >
                  <td className="px-4 py-2.5 font-mono text-nova-muted whitespace-nowrap">
                    {formatTime(entry.created_at)}
                  </td>
                  <td className={`px-4 py-2.5 font-medium ${actionColor(entry.action)}`}>
                    {formatAction(entry.action)}
                  </td>
                  <td className="px-4 py-2.5 text-slate-400">
                    <span className="text-nova-muted">{entry.resource_type}</span>
                    {entry.resource_id && (
                      <span className="ml-1 font-mono text-[10px] text-nova-muted/70">
                        {entry.resource_id.slice(0, 8)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-nova-muted">
                    {entry.ip_address ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-nova-muted">
                    {entry.user_id ? entry.user_id.slice(0, 8) + '…' : '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <DetailsCell entry={entry} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-nova-border">
          <Button
            variant="secondary"
            size="sm"
            disabled={!hasPrev}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          >
            ← Prev
          </Button>
          <span className="text-xs text-nova-muted">
            {offset + 1}–{offset + entries.length}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={!hasNext}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            Next →
          </Button>
        </div>
      </Card>
    </div>
  )
}
