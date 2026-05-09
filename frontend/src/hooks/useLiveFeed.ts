import { useCallback, useEffect, useRef, useState } from 'react'
import { getAccessToken } from '@/api/client'

export interface LiveMessage {
  type: 'tool_output' | 'tool_status' | 'tier_gate' | 'phase_complete' | 'connected' | 'ping'
  tool?: string
  tier?: number
  line?: string
  status?: string
  error?: string
  engagement_id?: string
  ts?: string
}

export interface ToolLiveStatus {
  name: string
  tier: number
  status: 'pending' | 'running' | 'complete' | 'error' | 'cancelled'
  lineCount: number
  error?: string
}

const MAX_LINES = 2000

export function useLiveFeed(engagementId: string | undefined) {
  const [lines, setLines] = useState<LiveMessage[]>([])
  const [toolStatuses, setToolStatuses] = useState<Record<string, ToolLiveStatus>>({})
  const [connected, setConnected] = useState(false)
  const [tier5Gate, setTier5Gate] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  const connect = useCallback(() => {
    if (!engagementId) return

    const token = getAccessToken()
    if (!token) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${window.location.host}/ws/engagements/${engagementId}/live?token=${token}`

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => setConnected(true)
    ws.onclose = () => {
      setConnected(false)
      // Reconnect after 3s if still on this page
      setTimeout(() => {
        if (wsRef.current?.readyState === WebSocket.CLOSED) connect()
      }, 3000)
    }
    ws.onerror = () => setConnected(false)

    ws.onmessage = (e: MessageEvent) => {
      try {
        const msg: LiveMessage = JSON.parse(e.data as string)

        if (msg.type === 'tool_output') {
          setLines((prev) => [...prev.slice(-(MAX_LINES - 1)), msg])
          if (msg.tool) {
            setToolStatuses((prev) => ({
              ...prev,
              [msg.tool!]: {
                ...prev[msg.tool!],
                name: msg.tool!,
                tier: msg.tier ?? prev[msg.tool!]?.tier ?? 0,
                status: prev[msg.tool!]?.status ?? 'running',
                lineCount: (prev[msg.tool!]?.lineCount ?? 0) + 1,
              },
            }))
          }
        } else if (msg.type === 'tool_status' && msg.tool) {
          setToolStatuses((prev) => ({
            ...prev,
            [msg.tool!]: {
              name: msg.tool!,
              tier: msg.tier ?? prev[msg.tool!]?.tier ?? 0,
              status: (msg.status ?? 'pending') as ToolLiveStatus['status'],
              lineCount: prev[msg.tool!]?.lineCount ?? 0,
              error: msg.error,
            },
          }))
        } else if (msg.type === 'tier_gate') {
          setTier5Gate(true)
        }
      } catch {
        // ignore parse errors
      }
    }
  }, [engagementId])

  useEffect(() => {
    connect()
    return () => {
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [connect])

  function clearLines() {
    setLines([])
  }

  function initToolStatuses(toolNames: Array<{ name: string; tier: number }>) {
    setToolStatuses(
      Object.fromEntries(
        toolNames.map(({ name, tier }) => [
          name,
          { name, tier, status: 'pending' as const, lineCount: 0 },
        ]),
      ),
    )
  }

  return { lines, toolStatuses, connected, tier5Gate, clearLines, initToolStatuses }
}
