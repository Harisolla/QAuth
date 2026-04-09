import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

const QUANTUM_VERIFY_MS = 1500

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

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

/* ─── Verification overlay ─── */
function VerifyingOverlay({ stage }: { stage: number }) {
  const stages = [
    'Validating credentials…',
    'Requesting quantum key…',
    'Generating challenge nonce…',
    'Computing HMAC proof…',
    'Finalizing session token…',
  ]
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(15,28,52,0.94)', backdropFilter: 'blur(12px)',
    }}>
      <div style={{ position: 'relative', width: 72, height: 72, marginBottom: 28 }}>
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          border: '2px solid rgba(34,211,238,0.15)', borderTopColor: '#22d3ee',
          animation: 'qa-spin 0.9s linear infinite',
        }} />
        <div style={{
          position: 'absolute', inset: 10, borderRadius: '50%',
          border: '1.5px solid rgba(129,140,248,0.15)', borderBottomColor: '#818cf8',
          animation: 'qa-spin 1.4s linear infinite reverse',
        }} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="18" height="18" viewBox="0 0 22 22" fill="none">
            <ellipse cx="11" cy="11" rx="9" ry="4.5" stroke="#22d3ee" strokeWidth="1.2" />
            <ellipse cx="11" cy="11" rx="9" ry="4.5" stroke="#22d3ee" strokeWidth="1.2" transform="rotate(60 11 11)" opacity=".5" />
            <circle cx="11" cy="11" r="1.8" fill="#22d3ee" />
          </svg>
        </div>
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9', fontFamily: '"Syne", sans-serif', marginBottom: 8 }}>
        Quantum Verification
      </div>
      <div style={{ fontSize: 13, color: '#22d3ee', fontFamily: '"JetBrains Mono", monospace', marginBottom: 28, minHeight: 20 }}>
        {stages[Math.min(stage, stages.length - 1)]}
      </div>
      <div style={{ width: 240, height: 2, background: 'rgba(34,211,238,0.1)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${((stage + 1) / stages.length) * 100}%`,
          background: 'linear-gradient(90deg, #22d3ee, #818cf8)',
          borderRadius: 99, transition: 'width 0.5s ease',
        }} />
      </div>
      <div style={{ fontSize: 11, color: 'rgba(100,116,139,0.6)', fontFamily: '"JetBrains Mono", monospace', marginTop: 10 }}>
        {stage + 1} / {stages.length}
      </div>
    </div>
  )
}

/* ─── Input field ─── */
function Field({
  label, type = 'text', value, onChange, disabled, autoComplete, placeholder,
}: {
  label: string; type?: string; value: string
  onChange: (v: string) => void; disabled: boolean
  autoComplete?: string; placeholder?: string
}) {
  const [focused, setFocused] = useState(false)
  return (
    <div>
      <label style={{
        display: 'block', fontSize: 12, fontWeight: 600,
        color: 'rgba(148,163,184,0.8)', marginBottom: 6,
        fontFamily: '"Syne", sans-serif', letterSpacing: '0.04em',
        textTransform: 'uppercase',
      }}>{label}</label>
      <input
        type={type} value={value} disabled={disabled}
        autoComplete={autoComplete} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: '100%', background: 'rgba(15,28,52,0.5)',
          border: `0.5px solid ${focused ? 'rgba(34,211,238,0.6)' : 'rgba(34,211,238,0.15)'}`,
          borderRadius: 10, padding: '11px 14px',
          fontSize: 14, color: '#f1f5f9',
          fontFamily: '"JetBrains Mono", monospace',
          outline: 'none', transition: 'border-color 0.2s',
          boxShadow: focused ? '0 0 0 3px rgba(34,211,238,0.06)' : 'none',
          opacity: disabled ? 0.5 : 1,
        }}
      />
    </div>
  )
}

/* ─── useBreakpoint ─── */
function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false
  )
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < breakpoint)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [breakpoint])
  return isMobile
}

/* ─── Main LoginPage ─── */
const LoginPage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const isMobile = useIsMobile()

  const [mode, setMode] = useState<'login' | 'register'>(
    (location.state as { mode?: string })?.mode === 'register' ? 'register' : 'login'
  )
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [verifyStage, setVerifyStage] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setVerifying(true)
    setVerifyStage(0)
    try {
      if (mode === 'register') {
        const registerRes = await fetch('/api/auth/register/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, username, password, password2 }),
        })
        const registerData = await registerRes.json().catch(() => ({}))
        if (!registerRes.ok) {
          setError(
            registerData?.detail || registerData?.password?.[0] ||
            registerData?.username?.[0] || registerData?.password2?.[0] ||
            'Registration failed. Please check your inputs.',
          )
          setVerifying(false)
          return
        }
      }

      setVerifyStage(0)
      const loginPromise = fetch('/api/auth/token/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const [res] = await Promise.all([loginPromise, delay(QUANTUM_VERIFY_MS)])
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError((data as any).detail || 'Login failed. Please try again.'); setVerifying(false); return }
      const access = (data as any).access
      if (!access) { setError('Login succeeded but access token missing.'); setVerifying(false); return }
      localStorage.setItem('access_token', access)
      localStorage.setItem('user_email', email)
      const refresh = (data as any).refresh
      if (refresh) localStorage.setItem('refresh_token', refresh)

      setVerifyStage(1)
      let quantumKeyHex = ''
      const revealRes = await fetch('/api/auth/quantum-key-reveal/', { method: 'GET', headers: { Authorization: `Bearer ${access}` } })
      let revealJson = await revealRes.json().catch(() => ({}))
      if (!revealRes.ok) {
        if (revealRes.status === 403) {
          const rotateRes = await fetch('/api/auth/rotate-key/', { method: 'POST', headers: { Authorization: `Bearer ${access}` } })
          if (!rotateRes.ok) { setError(revealJson.error || revealJson.detail || 'Key rotation failed.'); setVerifying(false); return }
          const revealRes2 = await fetch('/api/auth/quantum-key-reveal/', { method: 'GET', headers: { Authorization: `Bearer ${access}` } })
          const revealJson2 = await revealRes2.json().catch(() => ({}))
          if (!revealRes2.ok) { setError(revealJson2.error || revealJson2.detail || 'Quantum key reveal failed after rotating.'); setVerifying(false); return }
          quantumKeyHex = (revealJson2 as any).key_hex || ''
        } else { setError(revealJson.error || revealJson.detail || 'Quantum key reveal failed.'); setVerifying(false); return }
      } else { quantumKeyHex = (revealJson as any).key_hex || '' }
      if (!quantumKeyHex) { setError('key_hex missing from reveal response.'); setVerifying(false); return }
      localStorage.setItem('quantum_key_hex', quantumKeyHex)

      setVerifyStage(2)
      const challengeRes = await fetch('/api/auth/quantum-challenge/', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const challengeJson = await challengeRes.json().catch(() => ({}))
      if (!challengeRes.ok) { setError((challengeJson as any).detail || 'Challenge failed.'); setVerifying(false); return }
      const nonce = (challengeJson as any).nonce
      if (!nonce) { setError('Challenge nonce missing.'); setVerifying(false); return }

      setVerifyStage(3)
      const proof = await hmacSha256Hex(nonce, quantumKeyHex)

      setVerifyStage(4)
      const quantumLoginRes = await fetch('/api/auth/quantum-login/', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, nonce, proof }),
      })
      const quantumLoginJson = await quantumLoginRes.json().catch(() => ({}))
      if (!quantumLoginRes.ok) { setError((quantumLoginJson as any).detail || 'Quantum login failed.'); setVerifying(false); return }
      const access2 = (quantumLoginJson as any).access
      if (access2) localStorage.setItem('access_token', access2)
      const refresh2 = (quantumLoginJson as any).refresh
      if (refresh2) localStorage.setItem('refresh_token', refresh2)

      await delay(400)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      console.error(err)
      setVerifying(false)
      setError('Network error. Please try again.')
    }
  }

  const STEPS = [
    { icon: '🔑', label: 'Password check',      sub: 'Bootstrap JWT issued'   },
    { icon: '⚛',  label: 'Quantum key reveal',  sub: 'One-time, then locked'  },
    { icon: '✍',  label: 'HMAC proof',           sub: 'Computed client-side'   },
    { icon: '🎟', label: 'Session granted',      sub: 'Full access JWT'        },
  ]

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0d1b2e; }
        @keyframes qa-spin    { to { transform: rotate(360deg); } }
        @keyframes qa-fadein  { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes qa-fadein2 { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

        /* ── Responsive layout ── */
        .ql-outer {
          position: relative; zIndex: 10;
          flex: 1;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          gap: 48px;
          padding: 5rem 2rem 4rem;
        }
        .ql-info {
          flex-basis: 340px; flex-shrink: 1; flex-grow: 0;
          display: flex; flex-direction: column; gap: 20px;
          animation: qa-fadein 0.5s ease both;
        }
        .ql-form-wrap {
          flex-basis: 420px; flex-shrink: 0; flex-grow: 0;
          background: rgba(15,28,52,0.75);
          border: 0.5px solid rgba(34,211,238,0.18);
          border-radius: 18px;
          padding: 2.25rem;
          backdrop-filter: blur(20px);
          box-shadow: 0 0 60px rgba(34,211,238,0.05);
          animation: qa-fadein 0.5s ease 0.1s both;
        }
        /* Steps grid: 2-col on mobile */
        .ql-steps {
          display: flex; flex-direction: column; gap: 10px;
        }
        /* Tablet — hide info panel, center form */
        @media (max-width: 900px) {
          .ql-info { display: none; }
          .ql-outer { padding: 3rem 1.5rem; justify-content: center; }
          .ql-form-wrap { flex-basis: 100%; max-width: 480px; }
        }
        /* Mobile — tighter padding, full-width form */
        @media (max-width: 540px) {
          .ql-outer { padding: 1.5rem 1rem 2rem; }
          .ql-form-wrap { padding: 1.5rem; border-radius: 14px; }
        }
        /* Show a compact 2-col steps strip on mobile above form */
        .ql-steps-mobile {
          display: none;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-bottom: 1.5rem;
        }
        @media (max-width: 900px) {
          .ql-steps-mobile { display: grid; }
        }
        /* Input placeholder color */
        input::placeholder { color: rgba(100,116,139,0.45); }
        /* Submit button hover */
        .ql-submit:not(:disabled):hover {
          transform: translateY(-1px);
          box-shadow: 0 0 32px rgba(6,182,212,0.5) !important;
        }
        /* Mode tab hover */
        .ql-tab:hover { opacity: 0.85; }
      `}</style>

      <div style={{
        minHeight: '100vh',
        background: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(6,182,212,0.15) 0%, transparent 70%), #0d1b2e',
        position: 'relative', display: 'flex', flexDirection: 'column',
        fontFamily: '"Syne", system-ui, sans-serif', color: '#e2e8f0',
      }}>
        <QuantumCanvas />
        {verifying && <VerifyingOverlay stage={verifyStage} />}

        {/* ── Header ── */}
        <header style={{
          position: 'relative', zIndex: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '1.2rem 2rem',
          borderBottom: '0.5px solid rgba(34,211,238,0.08)',
          backdropFilter: 'blur(12px)',
        }}>
          <button onClick={() => navigate('/')} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 8, padding: 0,
          }}>
            <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
              <ellipse cx="11" cy="11" rx="9" ry="4.5" stroke="#22d3ee" strokeWidth="1.2" />
              <ellipse cx="11" cy="11" rx="9" ry="4.5" stroke="#22d3ee" strokeWidth="1.2" transform="rotate(60 11 11)" opacity=".6" />
              <ellipse cx="11" cy="11" rx="9" ry="4.5" stroke="#22d3ee" strokeWidth="1.2" transform="rotate(120 11 11)" opacity=".35" />
              <circle cx="11" cy="11" r="1.8" fill="#22d3ee" />
            </svg>
            <span style={{ fontSize: 16, fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.3px' }}>Qauth</span>
          </button>
          <div style={{
            fontSize: 10, fontFamily: '"JetBrains Mono", monospace',
            color: 'rgba(34,211,238,0.5)', letterSpacing: '0.1em',
          }}>
            {isMobile ? 'AES-256 · HMAC' : 'AES-256-GCM · HMAC-SHA256'}
          </div>
        </header>

        {/* ── Main layout ── */}
        <div className="ql-outer" style={{ position: 'relative', zIndex: 10, flex: 1 }}>

          {/* Left info panel — hidden below 900px via CSS */}
          <div className="ql-info">
            <div>
              <div style={{
                fontSize: 11, letterSpacing: '0.12em', color: 'rgba(34,211,238,0.6)',
                textTransform: 'uppercase', marginBottom: 10,
              }}>
                {mode === 'login' ? 'Secure login' : 'Create account'}
              </div>
              <h1 style={{
                fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', fontWeight: 800,
                lineHeight: 1.1, letterSpacing: '-1px',
                background: 'linear-gradient(135deg, #f8fafc 30%, #22d3ee 80%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                marginBottom: 14, whiteSpace: 'pre-line',
              }}>
                {mode === 'login' ? 'Quantum-Verified\nSign In' : 'Start Your\nQuantum Journey'}
              </h1>
              <p style={{ fontSize: 13, color: 'rgba(148,163,184,0.75)', lineHeight: 1.75 }}>
                {mode === 'login'
                  ? 'Your identity is verified using a cryptographic challenge-response. Your quantum key never travels the network.'
                  : 'Create your account and a 256-bit quantum key will be generated exclusively for you using vacuum fluctuation entropy.'}
              </p>
            </div>

            <div className="ql-steps">
              {STEPS.map((s, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px',
                  background: 'rgba(255,255,255,0.02)',
                  border: '0.5px solid rgba(34,211,238,0.08)',
                  borderRadius: 10,
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                    background: 'rgba(34,211,238,0.1)', border: '0.5px solid rgba(34,211,238,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
                  }}>{s.icon}</div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>{s.label}</div>
                    <div style={{ fontSize: 11, color: 'rgba(100,116,139,0.8)', fontFamily: '"JetBrains Mono", monospace' }}>{s.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Form card ── */}
          <div className="ql-form-wrap">

            {/* Mobile-only compact steps strip */}
            <div className="ql-steps-mobile">
              {STEPS.map((s, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 10px',
                  background: 'rgba(255,255,255,0.02)',
                  border: '0.5px solid rgba(34,211,238,0.08)',
                  borderRadius: 8,
                }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: 6, flexShrink: 0,
                    background: 'rgba(34,211,238,0.1)', border: '0.5px solid rgba(34,211,238,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
                  }}>{s.icon}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}</div>
                    <div style={{ fontSize: 10, color: 'rgba(100,116,139,0.7)', fontFamily: '"JetBrains Mono", monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.sub}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Mode toggle tabs */}
            <div style={{
              display: 'flex', gap: 4,
              background: 'rgba(15,28,52,0.5)',
              border: '0.5px solid rgba(34,211,238,0.1)',
              borderRadius: 10, padding: 4, marginBottom: '1.75rem',
            }}>
              {(['login', 'register'] as const).map(m => (
                <button
                  key={m}
                  className="ql-tab"
                  onClick={() => { setMode(m); setError(null) }}
                  disabled={verifying}
                  style={{
                    flex: 1, padding: '8px 0',
                    borderRadius: 7, border: 'none', cursor: 'pointer',
                    fontFamily: '"Syne", sans-serif', fontSize: 13, fontWeight: 700,
                    transition: 'all 0.2s',
                    background: mode === m ? 'rgba(34,211,238,0.12)' : 'transparent',
                    color: mode === m ? '#22d3ee' : 'rgba(100,116,139,0.7)',
                    outline: mode === m ? '0.5px solid rgba(34,211,238,0.3)' : 'none',
                  }}
                >
                  {m === 'login' ? 'Sign In' : 'Register'}
                </button>
              ))}
            </div>

            {/* Heading */}
            <div style={{ marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.3px', marginBottom: 6 }}>
                {mode === 'login' ? 'Welcome back' : 'Create your account'}
              </h2>
              <p style={{ fontSize: 13, color: 'rgba(100,116,139,0.8)', lineHeight: 1.6 }}>
                {mode === 'login'
                  ? 'Enter your credentials to initiate the quantum handshake.'
                  : 'Fill in your details — a quantum key will be generated automatically.'}
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {mode === 'register' && (
                <Field label="Username" value={username} onChange={setUsername}
                  disabled={verifying} autoComplete="username" placeholder="your_handle" />
              )}
              <Field label="Email" type="email" value={email} onChange={setEmail}
                disabled={verifying} autoComplete="email" placeholder="you@example.com" />
              <Field label="Password" type="password" value={password} onChange={setPassword}
                disabled={verifying} autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                placeholder="••••••••" />
              {mode === 'register' && (
                <Field label="Confirm Password" type="password" value={password2} onChange={setPassword2}
                  disabled={verifying} autoComplete="new-password" placeholder="••••••••" />
              )}

              {error && (
                <div style={{
                  background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.35)',
                  borderRadius: 8, padding: '10px 14px',
                  fontSize: 12, color: '#fca5a5', lineHeight: 1.5,
                  fontFamily: '"JetBrains Mono", monospace',
                }}>
                  ⚠ {error}
                </div>
              )}

              <button
                type="submit"
                className="ql-submit"
                disabled={verifying}
                style={{
                  marginTop: 4,
                  background: verifying ? 'rgba(6,182,212,0.3)' : 'linear-gradient(135deg, #06b6d4, #0891b2)',
                  color: verifying ? 'rgba(2,8,16,0.5)' : '#0d1b2e',
                  border: 'none', borderRadius: 10,
                  padding: '13px', width: '100%',
                  fontSize: 14, fontWeight: 700,
                  fontFamily: '"Syne", sans-serif',
                  cursor: verifying ? 'not-allowed' : 'pointer',
                  letterSpacing: '0.02em',
                  boxShadow: verifying ? 'none' : '0 0 20px rgba(6,182,212,0.3)',
                  transition: 'all 0.2s',
                }}
              >
                {mode === 'login' ? 'Initiate Quantum Login →' : 'Create Account →'}
              </button>
            </form>

            {/* Footer note */}
            <div style={{
              marginTop: '1.25rem', paddingTop: '1.25rem',
              borderTop: '0.5px solid rgba(34,211,238,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: '#22d3ee', boxShadow: '0 0 6px #22d3ee',
              }} />
              <span style={{ fontSize: 11, color: 'rgba(100,116,139,0.6)', fontFamily: '"JetBrains Mono", monospace', textAlign: 'center' }}>
                {mode === 'login'
                  ? 'HMAC proof computed locally — key never sent'
                  : 'ANU QRNG → BB84 → CSPRNG key generation'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default LoginPage