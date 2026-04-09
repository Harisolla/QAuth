import { useEffect, useRef, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

/* ─── Types ─── */
type LoginEventEntry = {
  id: string
  email: string
  username: string | null
  ip_address: string
  success: boolean
  failure_reason: string
  anomaly_score: number
  risk_level: 'low' | 'medium' | 'high' | 'critical'
  anomaly_flags: string[]
  timestamp: string
}

type RiskBreakdownEntry = {
  risk_level: string
  count: number
}

const POLL_INTERVAL_MS = 15000

/* ─── Crypto helpers ─── */
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase()
  if (clean.length % 2 !== 0) throw new Error('Invalid hex length')
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < clean.length; i += 2) {
    out[i / 2] = parseInt(clean.slice(i, i + 2), 16)
  }
  return out
}

async function hmacSha256Hex(message: string, keyHex: string): Promise<string> {
  const keyBytes = hexToBytes(keyHex)
  const keyBuf = keyBytes.buffer.slice(
    keyBytes.byteOffset,
    keyBytes.byteOffset + keyBytes.byteLength,
  ) as ArrayBuffer
  const key = await crypto.subtle.importKey(
    'raw', keyBuf,
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/* ─── useBreakpoint ─── */
function useBreakpoint() {
  const [w, setW] = useState(() => typeof window !== 'undefined' ? window.innerWidth : 1200)
  useEffect(() => {
    const h = () => setW(window.innerWidth)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  return { isMobile: w < 640, isTablet: w < 1024, width: w }
}

/* ─── Quantum particle canvas ─── */
function QuantumCanvas() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d')!
    let raf: number
    const resize = () => {
      canvas.width = canvas.offsetWidth * devicePixelRatio
      canvas.height = canvas.offsetHeight * devicePixelRatio
      ctx.scale(devicePixelRatio, devicePixelRatio)
    }
    resize()
    window.addEventListener('resize', resize)
    const W = () => canvas.offsetWidth
    const H = () => canvas.offsetHeight
    const COUNT = 55
    type Node = { x: number; y: number; vx: number; vy: number; r: number; phase: number }
    const nodes: Node[] = Array.from({ length: COUNT }, () => ({
      x: Math.random() * W(), y: Math.random() * H(),
      vx: (Math.random() - 0.5) * 0.22, vy: (Math.random() - 0.5) * 0.22,
      r: 1.2 + Math.random() * 1.4, phase: Math.random() * Math.PI * 2,
    }))
    let t = 0
    const draw = () => {
      t += 0.012
      const w = W(), h = H()
      ctx.clearRect(0, 0, w, h)
      ctx.save()
      ctx.strokeStyle = 'rgba(34,211,238,0.03)'
      ctx.lineWidth = 0.5
      const gS = 68
      for (let gx = 0; gx < w + gS; gx += gS) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke() }
      for (let gy = 0; gy < h + gS; gy += gS) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke() }
      ctx.restore()
      const DIST = 120
      for (let i = 0; i < COUNT; i++) {
        for (let j = i + 1; j < COUNT; j++) {
          const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y
          const d = Math.sqrt(dx * dx + dy * dy)
          if (d < DIST) {
            ctx.beginPath()
            ctx.strokeStyle = `rgba(34,211,238,${(1 - d / DIST) * 0.14})`
            ctx.lineWidth = 0.6
            ctx.moveTo(nodes[i].x, nodes[i].y); ctx.lineTo(nodes[j].x, nodes[j].y); ctx.stroke()
          }
        }
      }
      nodes.forEach((n) => {
        const pulse = 0.7 + 0.3 * Math.sin(t * 1.4 + n.phase)
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r * pulse, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(34,211,238,${0.5 * pulse})`; ctx.fill()
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r * pulse + 3, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(34,211,238,${0.08 * pulse})`; ctx.lineWidth = 1; ctx.stroke()
        n.x += n.vx; n.y += n.vy
        if (n.x < 0 || n.x > w) n.vx *= -1
        if (n.y < 0 || n.y > h) n.vy *= -1
      })
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [])
  return (
    <canvas ref={ref} style={{
      position: 'fixed', inset: 0, width: '100%', height: '100%',
      pointerEvents: 'none', zIndex: 0,
    }} />
  )
}

/* ─── Recharts custom tooltip ─── */
function CustomTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ name?: string; value?: any; color?: string }>
  label?: string
}) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div style={{
      background: 'rgba(15,28,52,0.97)', border: '0.5px solid rgba(34,211,238,0.2)',
      borderRadius: 8, padding: '8px 12px', fontSize: 12,
      fontFamily: '"JetBrains Mono", monospace',
    }}>
      <div style={{ color: '#e2e8f0', marginBottom: 4, fontWeight: 600 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color || '#22d3ee', display: 'inline-block' }} />
          <span style={{ color: '#94a3b8' }}>{p.name || 'Value'}</span>
          <span style={{ color: '#f1f5f9', marginLeft: 'auto' }}>{String(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

/* ─── Explorer output renderer ─── */
const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const formatScalar = (v: unknown): string => {
  if (v == null) return '—'
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return String(v)
}

function RenderPreview({ body }: { body: unknown }) {
  if (!body) return <div style={{ fontSize: 12, color: 'rgba(100,116,139,0.7)' }}>No response body.</div>

  if (isPlainObject(body) && Array.isArray((body as any).events)) {
    const events = (body as any).events as unknown[]
    const total = (body as any).total ?? events.length
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 10, fontFamily: '"JetBrains Mono", monospace', color: 'rgba(34,211,238,0.5)', letterSpacing: '0.08em' }}>
          {total} event{total !== 1 ? 's' : ''} returned
        </div>
        <RenderPreview body={events} />
      </div>
    )
  }

  if (isPlainObject(body) && (typeof body.error === 'string' || typeof body.detail === 'string')) {
    const msg = (typeof body.error === 'string' && body.error) || (typeof body.detail === 'string' && body.detail) || 'Request failed.'
    return (
      <div style={{
        background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.3)',
        borderRadius: 8, padding: '8px 12px', fontSize: 12,
        color: '#fca5a5', fontFamily: '"JetBrains Mono", monospace',
      }}>
        {msg}
      </div>
    )
  }

  if (isPlainObject(body)) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {Object.entries(body).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span style={{
              fontSize: 10, color: 'rgba(34,211,238,0.5)', textTransform: 'uppercase',
              letterSpacing: '0.06em', minWidth: 110, paddingTop: 1, flexShrink: 0,
              fontFamily: '"JetBrains Mono", monospace',
            }}>{k}</span>
            <span style={{ fontSize: 12, color: '#e2e8f0', wordBreak: 'break-all', fontFamily: '"JetBrains Mono", monospace' }}>
              {typeof v === 'object' ? JSON.stringify(v) : formatScalar(v)}
            </span>
          </div>
        ))}
      </div>
    )
  }

  if (Array.isArray(body)) {
    const riskStyle: Record<string, { bg: string; border: string; color: string }> = {
      low:      { bg: 'rgba(52,211,153,0.1)',  border: 'rgba(52,211,153,0.25)',  color: '#34d399' },
      medium:   { bg: 'rgba(250,204,21,0.1)',  border: 'rgba(250,204,21,0.25)',  color: '#fbbf24' },
      high:     { bg: 'rgba(251,146,60,0.1)',  border: 'rgba(251,146,60,0.25)',  color: '#fb923c' },
      critical: { bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.25)',   color: '#f87171' },
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 70px 68px 84px 80px',
          padding: '5px 10px', marginBottom: 4,
          fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase',
          color: 'rgba(100,116,139,0.5)', fontFamily: '"JetBrains Mono", monospace',
          borderBottom: '0.5px solid rgba(34,211,238,0.08)',
        }}>
          <span>User</span><span>Score</span><span>Level</span><span>Status</span><span style={{ textAlign: 'right' }}>Time</span>
        </div>
        {body.slice(0, 20).map((item, idx) => {
          if (!isPlainObject(item)) return (
            <div key={idx} style={{ fontSize: 12, color: '#94a3b8', padding: '4px 10px' }}>{formatScalar(item)}</div>
          )
          const e = item as any
          const rs = riskStyle[e.risk_level] || riskStyle.low
          const score = typeof e.anomaly_score === 'number' ? e.anomaly_score : null
          const scoreColor = score !== null ? (score > 0.7 ? '#f87171' : score > 0.4 ? '#fb923c' : '#34d399') : '#94a3b8'
          const flags: string[] = Array.isArray(e.anomaly_flags) ? e.anomaly_flags : []
          const time = e.timestamp ? new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'
          const user = e.username || e.email || 'Unknown'
          return (
            <div key={idx} style={{
              display: 'grid', gridTemplateColumns: '1fr 70px 68px 84px 80px',
              alignItems: 'center', padding: '7px 10px',
              background: idx % 2 === 0 ? 'rgba(0,0,0,0.15)' : 'transparent',
              borderRadius: 6, gap: 4,
              borderLeft: `2px solid ${rs.color}22`,
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 600, fontFamily: '"Syne", sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user}
                </div>
                {flags.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
                    {flags.slice(0, 3).map(f => (
                      <span key={f} style={{
                        fontSize: 9, fontFamily: '"JetBrains Mono", monospace',
                        color: rs.color, background: rs.bg, border: `0.5px solid ${rs.border}`,
                        borderRadius: 4, padding: '1px 5px', letterSpacing: '0.04em',
                      }}>{f}</span>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ fontSize: 12, fontFamily: '"JetBrains Mono", monospace', color: scoreColor, fontWeight: 500 }}>
                {score !== null ? score.toFixed(3) : '—'}
              </div>
              <div>
                <span style={{
                  fontSize: 9, fontFamily: '"JetBrains Mono", monospace', fontWeight: 600,
                  color: rs.color, background: rs.bg, border: `0.5px solid ${rs.border}`,
                  borderRadius: 99, padding: '2px 7px', textTransform: 'uppercase', letterSpacing: '0.06em',
                }}>
                  {e.risk_level || '—'}
                </span>
              </div>
              <div>
                <span style={{
                  fontSize: 9, fontFamily: '"JetBrains Mono", monospace',
                  color: e.success ? '#34d399' : '#f87171',
                  background: e.success ? 'rgba(52,211,153,0.08)' : 'rgba(239,68,68,0.08)',
                  border: `0.5px solid ${e.success ? 'rgba(52,211,153,0.2)' : 'rgba(239,68,68,0.2)'}`,
                  borderRadius: 99, padding: '2px 7px',
                }}>
                  {e.success ? '✓ ok' : '✗ fail'}
                </span>
              </div>
              <div style={{ fontSize: 10, fontFamily: '"JetBrains Mono", monospace', color: 'rgba(100,116,139,0.6)', textAlign: 'right' }}>
                {time}
              </div>
            </div>
          )
        })}
        {body.length > 20 && (
          <div style={{ fontSize: 10, color: 'rgba(100,116,139,0.4)', fontFamily: '"JetBrains Mono", monospace', padding: '6px 10px', textAlign: 'center' }}>
            + {body.length - 20} more events
          </div>
        )}
      </div>
    )
  }

  return <div style={{ fontSize: 12, color: '#e2e8f0', fontFamily: '"JetBrains Mono", monospace' }}>{formatScalar(body)}</div>
}

/* ─── Risk badge ─── */
function RiskBadge({ level }: { level: string }) {
  const map: Record<string, { bg: string; border: string; color: string; label: string }> = {
    low:      { bg: 'rgba(52,211,153,0.1)',  border: 'rgba(52,211,153,0.3)',  color: '#34d399', label: 'Safe' },
    medium:   { bg: 'rgba(250,204,21,0.1)',  border: 'rgba(250,204,21,0.3)',  color: '#fbbf24', label: 'Medium' },
    high:     { bg: 'rgba(251,146,60,0.1)',  border: 'rgba(251,146,60,0.3)',  color: '#fb923c', label: 'High' },
    critical: { bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.3)',   color: '#f87171', label: 'Critical' },
  }
  const s = map[level] || map.low
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      background: s.bg, border: `0.5px solid ${s.border}`,
      color: s.color, borderRadius: 99, padding: '2px 10px',
      fontSize: 10, fontWeight: 600, fontFamily: '"Syne", sans-serif',
    }}>
      {s.label}
    </span>
  )
}

/* ─── Main ─── */
const AdminDashboard = () => {
  const navigate = useNavigate()
  const { isMobile } = useBreakpoint()

  const [logs, setLogs] = useState<LoginEventEntry[]>([])
  const [riskBreakdown, setRiskBreakdown] = useState<RiskBreakdownEntry[]>([])
  const [keyInfo, setKeyInfo] = useState<{
    key_fingerprint: string; generation_method: string
    created_at: string; rotated_at: string | null
  } | null>(null)
  const [bb84Demo, setBb84Demo] = useState<{
    message: string; protocol: string; stats: any
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)

  /* Explorer */
  const [explorerNonce, setExplorerNonce] = useState('')
  const [explorerBusy, setExplorerBusy] = useState(false)
  const [explorerOutput, setExplorerOutput] = useState<{
    title: string; status: number | null; body: any
  } | null>(null)
  const [explorerShowRaw, setExplorerShowRaw] = useState(false)
  const [explorerOpen, setExplorerOpen] = useState(true)

  const userEmail = typeof window !== 'undefined' ? localStorage.getItem('user_email') || '' : ''

  const getAuthHeaders = (): Record<string, string> => {
    const token = localStorage.getItem('access_token')
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  const statusTone = (status: number | null) => {
    if (!status) return { label: 'n/a', bg: 'rgba(100,116,139,0.15)', border: 'rgba(100,116,139,0.3)', color: '#94a3b8' }
    if (status >= 200 && status < 300) return { label: String(status), bg: 'rgba(52,211,153,0.1)', border: 'rgba(52,211,153,0.3)', color: '#34d399' }
    if (status >= 400 && status < 500) return { label: String(status), bg: 'rgba(251,146,60,0.1)', border: 'rgba(251,146,60,0.3)', color: '#fb923c' }
    return { label: String(status), bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)', color: '#f87171' }
  }

  const callExplorerApi = async (title: string, url: string, init?: RequestInit) => {
    setExplorerBusy(true)
    setExplorerShowRaw(false)
    try {
      const res = await fetch(url, init)
      const body = await res.json().catch(() => ({}))
      setExplorerOutput({ title, status: res.status, body })
      return { res, body }
    } catch (e: any) {
      setExplorerOutput({ title, status: null, body: { error: String(e) } })
      throw e
    } finally {
      setExplorerBusy(false)
    }
  }

  const fetchData = async () => {
    try {
      setError(null)
      const token = localStorage.getItem('access_token')
      if (!token) throw new Error('Missing access token. Please login again.')
      const authHeaders = { Authorization: `Bearer ${token}` }
      const [keyRes, bb84Res] = await Promise.all([
        fetch('/api/auth/key-info/', { headers: authHeaders }),
        fetch('/api/auth/bb84-demo/', { headers: authHeaders }),
      ])
      if (!keyRes.ok) throw new Error(`Failed to load key info (${keyRes.status})`)
      if (!bb84Res.ok) throw new Error(`Failed to load BB84 demo (${bb84Res.status})`)
      setKeyInfo(await keyRes.json().catch(() => null))
      setBb84Demo(await bb84Res.json().catch(() => null))
      const statsRes = await fetch('/api/auth/stats/', { headers: authHeaders })
      if (statsRes.ok) {
        setIsAdmin(true)
        const statsJson = await statsRes.json().catch(() => ({}))
        setRiskBreakdown(statsJson.risk_breakdown_24h || [])
        const eventsRes = await fetch('/api/auth/events/?limit=50', { headers: authHeaders })
        if (eventsRes.ok) {
          const eventsJson = await eventsRes.json().catch(() => ({}))
          setLogs(Array.isArray(eventsJson.events) ? eventsJson.events : [])
        } else {
          setError(`Failed to load events (${eventsRes.status})`)
          setLogs([])
        }
      } else if (statsRes.status === 403) {
        setIsAdmin(false); setRiskBreakdown([]); setLogs([])
      } else {
        setIsAdmin(null); setRiskBreakdown([]); setLogs([])
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])

  const flaggedVsSafeData = useMemo(() => {
    let flagged = 0, safe = 0
    logs.forEach((l) => {
      if (l.risk_level === 'high' || l.risk_level === 'critical') flagged++
      else safe++
    })
    return [{ status: 'Flagged', count: flagged }, { status: 'Safe', count: safe }]
  }, [logs])

  const riskMax = useMemo(() => Math.max(1, ...riskBreakdown.map(d => d.count)), [riskBreakdown])
  const flaggedMax = useMemo(() => Math.max(1, ...flaggedVsSafeData.map(d => d.count)), [flaggedVsSafeData])

  const [chartsReady, setChartsReady] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setChartsReady(true))
    return () => cancelAnimationFrame(id)
  }, [])

  /* ─── Style tokens ─── */
  const card: React.CSSProperties = {
    background: 'rgba(15,28,52,0.75)', border: '0.5px solid rgba(34,211,238,0.18)',
    borderRadius: 14, padding: '1.5rem', backdropFilter: 'blur(16px)',
  }
  const cardSm: React.CSSProperties = {
    background: 'rgba(15,28,52,0.55)', border: '0.5px solid rgba(34,211,238,0.15)',
    borderRadius: 10, padding: '1.25rem', backdropFilter: 'blur(12px)',
  }
  const sectionLabel: React.CSSProperties = {
    fontSize: 10, letterSpacing: '0.12em', color: 'rgba(34,211,238,0.6)',
    textTransform: 'uppercase', marginBottom: 10,
  }
  const sectionTitle: React.CSSProperties = {
    fontSize: 14, fontWeight: 700, color: '#f1f5f9',
    fontFamily: '"Syne", sans-serif', marginBottom: 4,
  }
  const exBtn = (variant: 'cyan' | 'slate' | 'green'): React.CSSProperties => {
    const map = {
      cyan:  { bg: 'rgba(34,211,238,0.1)',  border: 'rgba(34,211,238,0.25)',  color: '#22d3ee' },
      slate: { bg: 'rgba(15,28,52,0.5)',        border: 'rgba(34,211,238,0.15)',  color: '#94a3b8' },
      green: { bg: 'rgba(52,211,153,0.1)',  border: 'rgba(52,211,153,0.25)',  color: '#34d399' },
    }
    return {
      background: map[variant].bg, border: `0.5px solid ${map[variant].border}`,
      color: map[variant].color, borderRadius: 8,
      padding: isMobile ? '6px 10px' : '7px 14px',
      fontSize: isMobile ? 10 : 11, fontWeight: 600, fontFamily: '"Syne", sans-serif',
      cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap' as const,
    }
  }

  /* events table: fewer columns on mobile */
  const tableHeaders = isMobile ? ['User', 'Score', 'Risk'] : ['User', 'Risk score', 'Risk level', 'Time']

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0d1b2e; }
        @keyframes qa-spin   { to { transform: rotate(360deg); } }
        @keyframes qa-fadein { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes qa-pulse  { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(34,211,238,0.2); border-radius: 99px; }
        .qa-ex-btn:hover { opacity: 0.85; }

        /* Events + charts: 2-col desktop, stacked tablet/mobile */
        .qa-events-grid {
          display: grid;
          grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
          gap: 16px;
        }
        @media (max-width: 900px) {
          .qa-events-grid { grid-template-columns: 1fr; }
        }

        /* Charts: stacked by default; side-by-side on tablet when already stacked */
        .qa-charts-inner { display: flex; flex-direction: column; gap: 24px; }
        @media (max-width: 900px) and (min-width: 560px) {
          .qa-charts-inner { flex-direction: row; }
          .qa-charts-inner > * { flex: 1; min-width: 0; }
          .qa-charts-divider { display: none !important; }
        }

        /* Key + BB84 */
        .qa-meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
        @media (max-width: 480px) { .qa-meta-grid { grid-template-columns: 1fr; } }

        /* BB84 sub-grid */
        .qa-bb84-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        @media (max-width: 360px) { .qa-bb84-grid { grid-template-columns: 1fr; } }

        /* Stats: 2-col on small mobile */
        .qa-stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
        @media (max-width: 480px) { .qa-stats-grid { grid-template-columns: 1fr 1fr; gap: 8px; } }

        /* Explorer buttons */
        .qa-explorer-btns { display: flex; flex-wrap: wrap; gap: 8px; }
        @media (max-width: 480px) { .qa-explorer-btns { gap: 6px; } }

        /* Hide header items on small screens */
        @media (max-width: 540px) {
          .qa-header-email { display: none !important; }
          .qa-header-algo  { display: none !important; }
        }
      `}</style>

      <div style={{
        minHeight: '100vh',
        background: 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(6,182,212,0.15) 0%, transparent 70%), #0d1b2e',
        position: 'relative', fontFamily: '"Syne", system-ui, sans-serif', color: '#e2e8f0',
      }}>
        <QuantumCanvas />

        {/* ── Header ── */}
        <header style={{
          position: 'relative', zIndex: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: isMobile ? '1rem 1.1rem' : '1.1rem 2rem',
          borderBottom: '0.5px solid rgba(34,211,238,0.08)',
          backdropFilter: 'blur(12px)', gap: 8,
        }}>
          <button onClick={() => navigate('/')} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 8, padding: 0, flexShrink: 0,
          }}>
            <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
              <ellipse cx="11" cy="11" rx="9" ry="4.5" stroke="#22d3ee" strokeWidth="1.2" />
              <ellipse cx="11" cy="11" rx="9" ry="4.5" stroke="#22d3ee" strokeWidth="1.2" transform="rotate(60 11 11)" opacity=".6" />
              <ellipse cx="11" cy="11" rx="9" ry="4.5" stroke="#22d3ee" strokeWidth="1.2" transform="rotate(120 11 11)" opacity=".35" />
              <circle cx="11" cy="11" r="1.8" fill="#22d3ee" />
            </svg>
            <span style={{ fontSize: 16, fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.3px' }}>Qauth</span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12, minWidth: 0 }}>
            <div style={{
              width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
              background: '#22d3ee', boxShadow: '0 0 6px #22d3ee',
              animation: 'qa-pulse 2s ease-in-out infinite',
            }} />
            <span className="qa-header-algo" style={{
              fontSize: 10, fontFamily: '"JetBrains Mono", monospace',
              color: 'rgba(34,211,238,0.5)', letterSpacing: '0.1em', whiteSpace: 'nowrap',
            }}>
              AES-256-GCM · HMAC-SHA256
            </span>
            <span className="qa-header-email" style={{
              fontSize: 10, fontFamily: '"JetBrains Mono", monospace',
              color: 'rgba(34,211,238,0.4)', letterSpacing: '0.08em',
              background: 'rgba(15,28,52,0.5)', border: '0.5px solid rgba(34,211,238,0.12)',
              borderRadius: 99, padding: '3px 10px',
              maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {userEmail || 'admin'}
            </span>
            <button
              onClick={() => { localStorage.clear(); navigate('/login', { replace: true }) }}
              style={{
                background: 'transparent', border: '0.5px solid rgba(34,211,238,0.2)',
                borderRadius: 8, padding: isMobile ? '5px 10px' : '6px 14px',
                color: '#94a3b8', fontSize: isMobile ? 11 : 12, fontWeight: 600,
                fontFamily: '"Syne", sans-serif', cursor: 'pointer', transition: 'all 0.2s', flexShrink: 0,
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(34,211,238,0.5)'; e.currentTarget.style.color = '#22d3ee' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(34,211,238,0.2)'; e.currentTarget.style.color = '#94a3b8' }}
            >
              {isMobile ? '↩' : 'Sign out'}
            </button>
          </div>
        </header>

        {/* ── Body ── */}
        <div style={{
          position: 'relative', zIndex: 10,
          maxWidth: 1200, margin: '0 auto',
          padding: isMobile ? '1.25rem 1rem' : '2rem',
          display: 'flex', flexDirection: 'column', gap: '1.25rem',
          animation: 'qa-fadein 0.4s ease both',
        }}>

          {/* Page title */}
          <div>
            <h1 style={{
              fontSize: 'clamp(1.1rem, 4vw, 1.9rem)', fontWeight: 800, letterSpacing: '-0.5px',
              background: 'linear-gradient(135deg, #f8fafc 30%, #22d3ee 80%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            }}>
              Quantum Security Dashboard
            </h1>
            <p style={{ fontSize: isMobile ? 12 : 13, color: 'rgba(100,116,139,0.7)', marginTop: 4 }}>
              Real-time monitoring of authentication risk and quantum key metadata.
            </p>
          </div>

          {/* Alerts */}
          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.3)',
              borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#fca5a5',
              fontFamily: '"JetBrains Mono", monospace',
            }}>⚠ {error}</div>
          )}
          {isAdmin === false && !error && (
            <div style={{
              background: 'rgba(251,146,60,0.08)', border: '0.5px solid rgba(251,146,60,0.25)',
              borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#fdba74',
              fontFamily: '"JetBrains Mono", monospace',
            }}>
              Admin-only endpoints are disabled for your account.
            </div>
          )}

          {/* Stats */}
          <div className="qa-stats-grid">
            {[
              { label: 'Total events (24h)', value: logs.length + riskBreakdown.reduce((a, b) => a + b.count, 0) },
              { label: 'Safe logins',         value: flaggedVsSafeData[1]?.count ?? 0 },
              { label: 'Flagged attempts',     value: flaggedVsSafeData[0]?.count ?? 0 },
              { label: 'Nonce TTL (sec)',       value: 300 },
            ].map(s => (
              <div key={s.label} style={{
                background: 'rgba(6,182,212,0.06)', border: '0.5px solid rgba(34,211,238,0.2)',
                borderRadius: 10, padding: isMobile ? '0.85rem 1rem' : '1.1rem 1.25rem', textAlign: 'center',
              }}>
                <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 500, color: '#22d3ee', letterSpacing: '0.02em', fontFamily: '"JetBrains Mono", monospace' }}>
                  {s.value}
                </div>
                <div style={{ fontSize: 9, color: 'rgba(148,163,184,0.85)', marginTop: 3, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          {/* ── API Explorer ── */}
          <div style={card}>
            <div
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: explorerOpen ? 12 : 0, cursor: isMobile ? 'pointer' : 'default' }}
              onClick={() => isMobile && setExplorerOpen(v => !v)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div>
                  <div style={sectionLabel}>API Explorer</div>
                  <div style={{ ...sectionTitle, marginBottom: 0 }}>Live endpoint testing</div>
                </div>
                {isMobile && (
                  <span style={{ fontSize: 11, color: 'rgba(34,211,238,0.4)', marginTop: 14 }}>
                    {explorerOpen ? '▲' : '▼'}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {explorerBusy && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#22d3ee', fontFamily: '"JetBrains Mono", monospace' }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22d3ee', animation: 'qa-pulse 1s infinite', flexShrink: 0 }} />
                    {!isMobile && 'Calling…'}
                  </div>
                )}
                {!isMobile && (
                  <span style={{ fontSize: 10, fontFamily: '"JetBrains Mono", monospace', color: 'rgba(34,211,238,0.5)' }}>
                    Nonce: {explorerNonce ? explorerNonce.slice(0, 10) + '…' : '—'}
                  </span>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); setExplorerOutput(null); setExplorerNonce(''); setExplorerShowRaw(false) }}
                  disabled={!explorerOutput && !explorerNonce}
                  style={{ ...exBtn('slate'), fontSize: 10, padding: '4px 10px', borderRadius: 6 }}
                >
                  Clear
                </button>
              </div>
            </div>

            {explorerOpen && (
              <>
                {isMobile && explorerNonce && (
                  <div style={{ fontSize: 10, fontFamily: '"JetBrains Mono", monospace', color: 'rgba(34,211,238,0.5)', marginBottom: 10 }}>
                    Nonce: {explorerNonce.slice(0, 16)}…
                  </div>
                )}

                <div className="qa-explorer-btns">
                  <button className="qa-ex-btn" style={exBtn('cyan')} disabled={explorerBusy}
                    onClick={() => callExplorerApi('GET key-info', '/api/auth/key-info/', { headers: getAuthHeaders() })}>
                    Key info
                  </button>
                  <button className="qa-ex-btn" style={exBtn('cyan')} disabled={explorerBusy}
                    onClick={() => callExplorerApi('GET bb84-demo', '/api/auth/bb84-demo/', { headers: getAuthHeaders() })}>
                    BB84 demo
                  </button>
                  <button className="qa-ex-btn" style={exBtn('cyan')} disabled={explorerBusy}
                    onClick={() => callExplorerApi('POST rotate-key', '/api/auth/rotate-key/', { method: 'POST', headers: getAuthHeaders() })}>
                    Rotate key
                  </button>
                  <button className="qa-ex-btn" style={exBtn('slate')} disabled={explorerBusy}
                    onClick={async () => {
                      const { res, body } = await callExplorerApi('GET quantum-key-reveal', '/api/auth/quantum-key-reveal/', { headers: getAuthHeaders() })
                      if (res.ok && body?.key_hex) localStorage.setItem('quantum_key_hex', String(body.key_hex))
                    }}>
                    Quantum reveal
                  </button>
                  <button className="qa-ex-btn" style={exBtn('slate')} disabled={explorerBusy}
                    onClick={async () => {
                      if (!userEmail) { setExplorerOutput({ title: 'POST quantum-challenge', status: null, body: { error: 'user_email missing.' } }); return }
                      const { res, body } = await callExplorerApi('POST quantum-challenge', '/api/auth/quantum-challenge/', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email: userEmail }),
                      })
                      if (res.ok && body?.nonce) setExplorerNonce(String(body.nonce))
                    }}>
                    {isMobile ? 'Challenge' : 'Quantum challenge'}
                  </button>
                  <button className="qa-ex-btn" style={exBtn('green')} disabled={explorerBusy}
                    onClick={async () => {
                      const quantumKeyHex = localStorage.getItem('quantum_key_hex') || ''
                      if (!userEmail) { setExplorerOutput({ title: 'POST quantum-login', status: null, body: { error: 'user_email missing.' } }); return }
                      if (!explorerNonce) { setExplorerOutput({ title: 'POST quantum-login', status: null, body: { error: 'Nonce missing. Click "Quantum challenge" first.' } }); return }
                      if (!quantumKeyHex) { setExplorerOutput({ title: 'POST quantum-login', status: null, body: { error: 'quantum_key_hex missing. Click "Quantum reveal" first.' } }); return }
                      const proof = await hmacSha256Hex(explorerNonce, quantumKeyHex)
                      const { res, body } = await callExplorerApi('POST quantum-login', '/api/auth/quantum-login/', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email: userEmail, nonce: explorerNonce, proof }),
                      })
                      if (res.ok && body?.access) {
                        localStorage.setItem('access_token', String(body.access))
                        if (body?.refresh) localStorage.setItem('refresh_token', String(body.refresh))
                      }
                    }}>
                    {isMobile ? 'Q-Login' : 'Quantum login'}
                  </button>
                  <button className="qa-ex-btn" style={exBtn('slate')} disabled={explorerBusy}
                    onClick={() => callExplorerApi('GET stats', '/api/auth/stats/', { headers: getAuthHeaders() })}>
                    Stats
                  </button>
                  <button className="qa-ex-btn" style={exBtn('slate')} disabled={explorerBusy}
                    onClick={() => callExplorerApi('GET events', '/api/auth/events/?limit=50', { headers: getAuthHeaders() })}>
                    Events
                  </button>
                </div>

                {explorerOutput && (() => {
                  const tone = statusTone(explorerOutput.status)
                  return (
                    <div style={{
                      marginTop: 12, background: 'rgba(15,28,52,0.65)',
                      border: '0.5px solid rgba(34,211,238,0.12)', borderRadius: 10, overflow: 'hidden',
                    }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '8px 12px', borderBottom: '0.5px solid rgba(34,211,238,0.1)',
                        background: 'rgba(15,28,52,0.5)', gap: 8, flexWrap: 'wrap',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                          <span style={{ fontSize: 11, fontFamily: '"JetBrains Mono", monospace', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {explorerOutput.title}
                          </span>
                          <span style={{
                            fontSize: 10, fontFamily: '"JetBrains Mono", monospace', flexShrink: 0,
                            background: tone.bg, border: `0.5px solid ${tone.border}`,
                            color: tone.color, borderRadius: 99, padding: '2px 8px',
                          }}>
                            {tone.label}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <button style={{ ...exBtn('slate'), fontSize: 10, padding: '3px 8px', borderRadius: 6 }}
                            onClick={() => setExplorerShowRaw(v => !v)}>
                            {explorerShowRaw ? 'Preview' : 'Raw'}
                          </button>
                          <button style={{ ...exBtn('slate'), fontSize: 10, padding: '3px 8px', borderRadius: 6 }}
                            onClick={() => { try { navigator.clipboard.writeText(JSON.stringify(explorerOutput.body, null, 2)) } catch {} }}>
                            Copy
                          </button>
                        </div>
                      </div>
                      <div style={{ maxHeight: 320, overflowY: 'auto', overflowX: 'auto', padding: '10px 12px' }}>
                        {explorerShowRaw
                          ? <pre style={{ fontSize: 11, color: '#94a3b8', fontFamily: '"JetBrains Mono", monospace', whiteSpace: 'pre-wrap' }}>
                              {JSON.stringify(explorerOutput.body, null, 2)}
                            </pre>
                          : <RenderPreview body={explorerOutput.body} />
                        }
                      </div>
                    </div>
                  )
                })()}
              </>
            )}
          </div>

          {/* ── Events + Charts ── */}
          <div className="qa-events-grid">
            {/* Events table */}
            <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '1.1rem 1.25rem 0.9rem', borderBottom: '0.5px solid rgba(34,211,238,0.08)' }}>
                <div style={sectionLabel}>Authentication events</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={sectionTitle}>Recent sign-in log</div>
                  <span style={{ fontSize: 10, color: 'rgba(100,116,139,0.6)', fontFamily: '"JetBrains Mono", monospace' }}>
                    ↻ {POLL_INTERVAL_MS / 1000}s
                  </span>
                </div>
              </div>
              <div style={{ maxHeight: 320, overflowY: 'auto', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '0.5px solid rgba(34,211,238,0.1)' }}>
                      {tableHeaders.map(h => (
                        <th key={h} style={{
                          textAlign: 'left', padding: isMobile ? '7px 10px' : '8px 14px',
                          fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase',
                          color: 'rgba(100,116,139,0.7)', fontWeight: 600,
                          fontFamily: '"Syne", sans-serif', whiteSpace: 'nowrap',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {!loading && logs.length === 0 && (
                      <tr>
                        <td colSpan={tableHeaders.length} style={{ padding: '2rem', textAlign: 'center', color: 'rgba(100,116,139,0.5)', fontSize: 12 }}>
                          No login attempts recorded yet.
                        </td>
                      </tr>
                    )}
                    {logs.map(log => (
                      <tr key={log.id} style={{ borderBottom: '0.5px solid rgba(34,211,238,0.06)' }}>
                        <td style={{ padding: isMobile ? '8px 10px' : '9px 14px', color: '#f1f5f9', maxWidth: isMobile ? 100 : 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {log.username || log.email || 'Unknown'}
                        </td>
                        <td style={{ padding: isMobile ? '8px 10px' : '9px 14px', fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: log.anomaly_score > 0.5 ? '#fb923c' : '#34d399', whiteSpace: 'nowrap' }}>
                          {log.anomaly_score.toFixed(3)}
                        </td>
                        <td style={{ padding: isMobile ? '8px 10px' : '9px 14px' }}>
                          <RiskBadge level={log.risk_level} />
                        </td>
                        {!isMobile && (
                          <td style={{ padding: '9px 14px', fontSize: 11, color: 'rgba(100,116,139,0.7)', fontFamily: '"JetBrains Mono", monospace', whiteSpace: 'nowrap' }}>
                            {log.timestamp ? new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Charts */}
            <div style={{ ...card }}>
              <div className="qa-charts-inner">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={sectionLabel}>Risk breakdown (24h)</div>
                  <div style={{ height: 160 }}>
                    {chartsReady ? (
                      <ResponsiveContainer width="100%" height={160}>
                        <BarChart data={riskBreakdown} margin={{ top: 4, right: 4, left: -20, bottom: 4 }}>
                          <defs>
                            <linearGradient id="qaBlue" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.9} />
                              <stop offset="100%" stopColor="#0891b2" stopOpacity={0.6} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid vertical={false} stroke="rgba(34,211,238,0.06)" />
                          <XAxis dataKey="risk_level" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 9 }} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 9 }} domain={[0, riskMax]} />
                          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(34,211,238,0.05)' }} />
                          <Bar dataKey="count" name="Occurrences" fill="url(#qaBlue)" maxBarSize={40} radius={[3, 3, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160, fontSize: 11, color: 'rgba(100,116,139,0.5)' }}>Loading chart…</div>
                    )}
                  </div>
                </div>

                <div className="qa-charts-divider" style={{ height: '0.5px', background: 'linear-gradient(90deg, transparent, rgba(34,211,238,0.2), transparent)' }} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={sectionLabel}>Flagged vs safe</div>
                  <div style={{ height: 140 }}>
                    {chartsReady ? (
                      <ResponsiveContainer width="100%" height={140}>
                        <BarChart data={flaggedVsSafeData} margin={{ top: 4, right: 4, left: -20, bottom: 4 }}>
                          <defs>
                            <linearGradient id="qaGreen" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#34d399" stopOpacity={0.9} />
                              <stop offset="100%" stopColor="#059669" stopOpacity={0.6} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid vertical={false} stroke="rgba(34,211,238,0.06)" />
                          <XAxis dataKey="status" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 9 }} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 9 }} domain={[0, flaggedMax]} />
                          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(34,211,238,0.05)' }} />
                          <Bar dataKey="count" name="Logins" fill="url(#qaGreen)" maxBarSize={48} radius={[3, 3, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 140, fontSize: 11, color: 'rgba(100,116,139,0.5)' }}>Loading chart…</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Key info + BB84 ── */}
          <div className="qa-meta-grid">
            <div style={cardSm}>
              <div style={sectionLabel}>Quantum key metadata</div>
              {!keyInfo ? (
                <div style={{ fontSize: 12, color: 'rgba(100,116,139,0.5)' }}>Loading key info…</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { label: 'Fingerprint', value: keyInfo.key_fingerprint.slice(0, isMobile ? 12 : 16) + '…', accent: true },
                    { label: 'Method', value: keyInfo.generation_method },
                    { label: 'Created', value: new Date(keyInfo.created_at).toLocaleString() },
                    ...(keyInfo.rotated_at ? [{ label: 'Rotated', value: new Date(keyInfo.rotated_at).toLocaleString() }] : []),
                  ].map(f => (
                    <div key={f.label}>
                      <div style={{ fontSize: 10, color: 'rgba(100,116,139,0.7)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>{f.label}</div>
                      <div style={{ fontSize: 12, fontFamily: '"JetBrains Mono", monospace', color: f.accent ? '#22d3ee' : '#94a3b8', wordBreak: 'break-word' }}>{f.value}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={cardSm}>
              <div style={sectionLabel}>BB84 protocol demo</div>
              {!bb84Demo ? (
                <div style={{ fontSize: 12, color: 'rgba(100,116,139,0.5)' }}>Loading BB84 stats…</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="qa-bb84-grid">
                    {[
                      { label: 'Protocol',     value: bb84Demo.protocol },
                      { label: 'QBER',         value: bb84Demo.stats.qber },
                      { label: 'Eavesdropper', value: String(bb84Demo.stats.eavesdropper_detected) },
                      { label: 'Sift eff.',    value: bb84Demo.stats.sifting_efficiency },
                    ].map(f => (
                      <div key={f.label} style={{
                        background: 'rgba(34,211,238,0.04)', border: '0.5px solid rgba(34,211,238,0.1)',
                        borderRadius: 8, padding: '8px 12px',
                      }}>
                        <div style={{ fontSize: 9, color: 'rgba(100,116,139,0.7)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>{f.label}</div>
                        <div style={{ fontSize: 13, fontFamily: '"JetBrains Mono", monospace', color: '#22d3ee', fontWeight: 500 }}>{f.value}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ background: 'rgba(34,211,238,0.04)', border: '0.5px solid rgba(34,211,238,0.1)', borderRadius: 8, padding: '8px 12px' }}>
                    <div style={{ fontSize: 9, color: 'rgba(100,116,139,0.7)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Generation method</div>
                    <div style={{ fontSize: 12, fontFamily: '"JetBrains Mono", monospace', color: '#22d3ee', wordBreak: 'break-word' }}>{bb84Demo.stats.generation_method}</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <footer style={{
            textAlign: 'center', paddingTop: '1rem',
            borderTop: '0.5px solid rgba(34,211,238,0.07)',
            fontSize: 10, color: 'rgba(100,116,139,0.6)',
            fontFamily: '"JetBrains Mono", monospace', lineHeight: 1.8,
          }}>
            {isMobile
              ? 'Qauth · AES-256-GCM · HMAC-SHA256'
              : 'Qauth — Quantum Authentication Platform \u00a0·\u00a0 AES-256-GCM · SHA3-256 · HMAC-SHA256 · BB84'
            }
          </footer>
        </div>
      </div>
    </>
  )
}

export default AdminDashboard