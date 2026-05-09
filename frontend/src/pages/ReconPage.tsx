import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getEngagement, getPhases } from '@/api/engagements'
import { getReconStatus, startRecon, approveTier5, pauseRecon, signOffRecon } from '@/api/recon'
import { useEngagementStore } from '@/store/engagement'
import { useLiveFeed } from '@/hooks/useLiveFeed'
import { ToolStatusList } from '@/components/phase/ToolStatusList'
import { LiveFeed } from '@/components/phase/LiveFeed'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { RECON_TIERS } from '@/config/recon'
import clsx from 'clsx'

export function ReconPage() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const { setActiveEngagement, setPhases } = useEngagementStore()

  const [activeTool, setActiveTool] = useState<string | null>(null)
  const [enabledTools, setEnabledTools] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(RECON_TIERS.flatMap((t) => t.tools.map((tl) => [tl.name, tl.enabled_by_default]))),
  )
  const [starting, setStarting] = useState(false)
  const [approving, setApproving] = useState(false)
  const [pausing, setPausing] = useState(false)
  const [signingOff, setSigningOff] = useState(false)
  const [showSignOffDialog, setShowSignOffDialog] = useState(false)
  const [techStackInput, setTechStackInput] = useState('nginx, php, jquery')

  const { data: engagement } = useQuery({
    queryKey: ['engagement', id],
    queryFn: () => getEngagement(id!),
    enabled: !!id,
  })

  const { data: phases = [] } = useQuery({
    queryKey: ['phases', id],
    queryFn: () => getPhases(id!),
    enabled: !!id,
  })

  const { data: reconStatus, refetch: refetchStatus } = useQuery({
    queryKey: ['recon-status', id],
    queryFn: () => getReconStatus(id!),
    enabled: !!id,
    refetchInterval: (data) => {
      // Poll every 3s while running
      const hasRunning = data && Object.values(data.tool_status).some((s) => s.status === 'running')
      return hasRunning ? 3000 : false
    },
  })

  const { lines, toolStatuses, connected, tier5Gate, clearLines, initToolStatuses } = useLiveFeed(id)

  useEffect(() => {
    if (engagement) setActiveEngagement(engagement)
    if (phases.length) setPhases(phases)
  }, [engagement, phases, setActiveEngagement, setPhases])

  const phase1 = phases.find((p) => p.phase_number === 1)
  const isRunning = phase1?.status === 'in_progress'
  const isComplete = phase1?.status === 'complete'

  // Merge live tool statuses with polled status
  const mergedStatuses = { ...reconStatus?.tool_status, ...toolStatuses }

  async function handleStart() {
    if (!id) return
    setStarting(true)
    try {
      initToolStatuses(
        RECON_TIERS.flatMap((t) =>
          t.tools.filter((tl) => enabledTools[tl.name]).map((tl) => ({ name: tl.name, tier: t.tier })),
        ),
      )
      await startRecon(id, enabledTools)
      qc.invalidateQueries({ queryKey: ['phases', id] })
      qc.invalidateQueries({ queryKey: ['recon-status', id] })
    } finally {
      setStarting(false)
    }
  }

  async function handleApproveTier5() {
    if (!id) return
    setApproving(true)
    try {
      await approveTier5(id)
      refetchStatus()
    } finally {
      setApproving(false)
    }
  }

  async function handlePause() {
    if (!id) return
    setPausing(true)
    try {
      await pauseRecon(id)
      qc.invalidateQueries({ queryKey: ['recon-status', id] })
    } finally {
      setPausing(false)
    }
  }

  async function handleSignOff() {
    if (!id) return
    setSigningOff(true)
    try {
      const techStack = techStackInput.split(',').map(s => s.trim()).filter(Boolean)
      await signOffRecon(id, techStack)
      qc.invalidateQueries({ queryKey: ['phases', id] })
      setShowSignOffDialog(false)
    } finally {
      setSigningOff(false)
    }
  }

  const allComplete = reconStatus
    ? Object.values(reconStatus.tool_status).length > 0 &&
      Object.values(reconStatus.tool_status).every((s) => ['complete', 'error', 'cancelled'].includes(s.status))
    : false

  const showTier5Gate = tier5Gate || reconStatus?.tier_5_gate

  return (
    <div className="flex gap-4 h-[calc(100vh-6rem)]">
      {/* Left panel — tool status list */}
      <div className="w-56 shrink-0 flex flex-col gap-3">
        {/* Phase header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono text-nova-muted">Phase 1</span>
            <span className={clsx(
              'text-[10px] px-1.5 py-0.5 rounded-full',
              isRunning ? 'bg-nova-accent/20 text-nova-accent' :
              isComplete ? 'bg-emerald-500/20 text-emerald-400' :
              'bg-slate-700/50 text-slate-500',
            )}>
              {isRunning ? 'Running' : isComplete ? 'Complete' : 'Ready'}
            </span>
          </div>
          <h2 className="text-sm font-semibold text-slate-100">Reconnaissance</h2>
          <p className="text-xs text-nova-muted mt-0.5">
            {engagement?.target_domain}
          </p>
        </div>

        {/* Controls */}
        <div className="space-y-2">
          {!isRunning && !isComplete && (
            <Button className="w-full" size="sm" onClick={handleStart} loading={starting}>
              ▶ Start Recon
            </Button>
          )}
          {isRunning && (
            <Button variant="secondary" className="w-full" size="sm" onClick={handlePause} loading={pausing}>
              ⏸ Pause
            </Button>
          )}
          {allComplete && !isComplete && (
            <Button className="w-full" size="sm" onClick={() => setShowSignOffDialog(true)}>
              ✓ Sign Off Phase 1
            </Button>
          )}
        </div>

        {/* Tier 5 gate */}
        {showTier5Gate && !isComplete && (
          <div className="border border-yellow-500/30 bg-yellow-500/5 rounded-lg p-3 space-y-2">
            <p className="text-xs font-medium text-yellow-400">⚠ Tier 5 gate</p>
            <p className="text-[11px] text-slate-400">
              Tiers 1–4 complete. Tier 5 runs active scanning — louder and more detectable.
            </p>
            <Button
              variant="danger"
              size="sm"
              className="w-full"
              onClick={handleApproveTier5}
              loading={approving}
            >
              Approve Active Scanning
            </Button>
          </div>
        )}

        {/* Scrollable tool list */}
        <div className="flex-1 overflow-y-auto pr-1">
          <ToolStatusList
            tiers={RECON_TIERS}
            toolStatuses={mergedStatuses as any}
            activeTool={activeTool}
            onSelectTool={setActiveTool}
            enabledTools={enabledTools}
            onToggleTool={(tool, val) => setEnabledTools((prev) => ({ ...prev, [tool]: val }))}
            editable={!isRunning && !isComplete}
          />
        </div>
      </div>

      {/* Right panel — live feed */}
      <div className="flex-1 bg-nova-surface border border-nova-border rounded-lg overflow-hidden">
        <LiveFeed
          lines={lines}
          filterTool={activeTool}
          connected={connected}
          onClear={clearLines}
        />
      </div>

      {/* Sign-off dialog */}
      {showSignOffDialog && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg w-full max-w-md space-y-4 p-6">
            <h2 className="text-lg font-semibold text-slate-100">Sign Off Phase 1 — Reconnaissance</h2>
            <p className="text-sm text-slate-400">
              Confirm the tech stack discovered during recon. This populates Phase 2 CVE intelligence and attack plan generation.
            </p>
            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">
                Tech Stack (comma-separated)
              </label>
              <input
                type="text"
                value={techStackInput}
                onChange={e => setTechStackInput(e.target.value)}
                placeholder="nginx, php, wordpress, jquery"
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-600"
              />
              <p className="text-xs text-slate-500 mt-1">
                Detected technologies used to query CVE databases in Phase 2.
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowSignOffDialog(false)}
                className="px-4 py-2 text-sm rounded border border-slate-600 text-slate-400 hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSignOff}
                disabled={signingOff}
                className="px-4 py-2 text-sm rounded bg-cyan-600 hover:bg-cyan-500 text-white font-medium disabled:opacity-60 transition-colors"
              >
                {signingOff ? 'Signing Off…' : 'Sign Off Phase 1'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
