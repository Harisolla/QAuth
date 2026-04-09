import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

/* ─── Quantum particle field ─── */
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

    const COUNT = 72
    type Node = { x: number; y: number; vx: number; vy: number; r: number; phase: number }
    const nodes: Node[] = Array.from({ length: COUNT }, () => ({
      x: Math.random() * W(),
      y: Math.random() * H(),
      vx: (Math.random() - 0.5) * 0.28,
      vy: (Math.random() - 0.5) * 0.28,
      r: 1.2 + Math.random() * 1.4,
      phase: Math.random() * Math.PI * 2,
    }))

    let t = 0
    const draw = () => {
      t += 0.012
      const w = W(), h = H()
      ctx.clearRect(0, 0, w, h)

      ctx.save()
      ctx.strokeStyle = 'rgba(34,211,238,0.045)'
      ctx.lineWidth = 0.5
      const gS = 68
      for (let gx = 0; gx < w + gS; gx += gS) {
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke()
      }
      for (let gy = 0; gy < h + gS; gy += gS) {
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke()
      }
      ctx.restore()

      const DIST = 130
      for (let i = 0; i < COUNT; i++) {
        for (let j = i + 1; j < COUNT; j++) {
          const dx = nodes[i].x - nodes[j].x
          const dy = nodes[i].y - nodes[j].y
          const d = Math.sqrt(dx * dx + dy * dy)
          if (d < DIST) {
            const alpha = (1 - d / DIST) * 0.18
            ctx.beginPath()
            ctx.strokeStyle = `rgba(34,211,238,${alpha})`
            ctx.lineWidth = 0.6
            ctx.moveTo(nodes[i].x, nodes[i].y)
            ctx.lineTo(nodes[j].x, nodes[j].y)
            ctx.stroke()
          }
        }
      }

      nodes.forEach((n) => {
        const pulse = 0.7 + 0.3 * Math.sin(t * 1.4 + n.phase)
        ctx.beginPath()
        ctx.arc(n.x, n.y, n.r * pulse, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(34,211,238,${0.55 * pulse})`
        ctx.fill()
        ctx.beginPath()
        ctx.arc(n.x, n.y, n.r * pulse + 3, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(34,211,238,${0.1 * pulse})`
        ctx.lineWidth = 1
        ctx.stroke()
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
      position: 'absolute', inset: 0, width: '100%', height: '100%',
      pointerEvents: 'none',
    }} />
  )
}

/* ─── Animated counter ─── */
function Counter({ to, suffix = '' }: { to: number; suffix?: string }) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    let start = 0
    const step = Math.ceil(to / 60)
    const id = setInterval(() => {
      start += step
      if (start >= to) { setVal(to); clearInterval(id) }
      else setVal(start)
    }, 18)
    return () => clearInterval(id)
  }, [to])
  return <>{val.toLocaleString()}{suffix}</>
}

/* ─── Stat card ─── */
function StatCard({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <div style={{
      background: 'rgba(6,182,212,0.06)',
      border: '0.5px solid rgba(34,211,238,0.2)',
      borderRadius: 12, padding: '1.25rem 1.5rem',
      textAlign: 'center', backdropFilter: 'blur(8px)',
    }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: '#22d3ee', letterSpacing: '-0.5px', fontFamily: '"Syne", sans-serif' }}>
        <Counter to={value} suffix={suffix} />
      </div>
      <div style={{ fontSize: 12, color: 'rgba(148,163,184,0.85)', marginTop: 4, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {label}
      </div>
    </div>
  )
}

/* ─── Feature row ─── */
function Feature({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', gap: 16, alignItems: 'flex-start',
        background: hover ? 'rgba(6,182,212,0.07)' : 'rgba(255,255,255,0.03)',
        border: `0.5px solid ${hover ? 'rgba(34,211,238,0.3)' : 'rgba(34,211,238,0.12)'}`,
        borderRadius: 12, padding: '1rem 1.25rem',
        transition: 'all 0.25s ease', cursor: 'default',
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 8,
        background: 'rgba(34,211,238,0.12)', border: '0.5px solid rgba(34,211,238,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 17, flexShrink: 0,
      }}>{icon}</div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0', marginBottom: 4, fontFamily: '"Syne", sans-serif' }}>{title}</div>
        <div style={{ fontSize: 13, color: 'rgba(148,163,184,0.8)', lineHeight: 1.6 }}>{desc}</div>
      </div>
    </div>
  )
}

/* ─── Badge pill ─── */
function Badge({ label }: { label: string }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 500, letterSpacing: '0.1em',
      textTransform: 'uppercase', color: '#22d3ee',
      background: 'rgba(34,211,238,0.1)', border: '0.5px solid rgba(34,211,238,0.3)',
      borderRadius: 99, padding: '3px 10px',
    }}>{label}</span>
  )
}

/* ─── How It Works ─── */
const STEPS = [
  {
    num: '01', icon: '🔑', title: 'Password Verification', color: '#22d3ee',
    short: 'Bootstrap JWT issued',
    detail: 'You enter your email and password. The server validates your credentials against the hashed password in the database and issues a short-lived Bootstrap JWT — a temporary pass to proceed to the quantum layer.',
    tech: 'bcrypt · Django SimpleJWT',
  },
  {
    num: '02', icon: '⚛', title: 'Quantum Key Reveal', color: '#818cf8',
    short: 'One-time key shown',
    detail: 'Using the Bootstrap JWT, your client calls /api/auth/quantum-key-reveal/ exactly once. The server returns your 256-bit quantum key (generated via ANU QRNG → BB84 → CSPRNG). After this single reveal, the endpoint locks — further calls return 403 Forbidden.',
    tech: 'ANU QRNG · BB84 · SHA3-256 · AES-256-GCM',
  },
  {
    num: '03', icon: '🎲', title: 'Nonce Request', color: '#34d399',
    short: 'Server sends random nonce',
    detail: 'Your client requests a cryptographic nonce from /api/auth/quantum-challenge/. The server generates a fresh random value, stores it in Redis with a 300-second TTL, and returns it. Each nonce is single-use — replaying it fails.',
    tech: 'Redis · CSPRNG · 300s TTL',
  },
  {
    num: '04', icon: '✍', title: 'HMAC Proof', color: '#fb923c',
    short: 'Client signs nonce locally',
    detail: 'Your browser computes HMAC-SHA256(nonce, quantumKeyHex) entirely client-side using the Web Crypto API. The raw quantum key never travels the network again — only the 256-bit proof signature is sent to the server.',
    tech: 'Web Crypto API · HMAC-SHA256',
  },
  {
    num: '05', icon: '🛡', title: 'Risk Engine Check', color: '#f472b6',
    short: 'Behavioral analysis runs',
    detail: 'Before issuing the final token, the Anomaly Engine scores the request (0.0–1.0) checking for brute-force patterns, credential stuffing, bot user-agents, and time anomalies. High-risk attempts are blocked and logged to the audit trail.',
    tech: 'Redis sliding windows · Risk scoring · Audit log',
  },
  {
    num: '06', icon: '🎟', title: 'Full Access Token', color: '#22d3ee',
    short: 'Long-lived JWT granted',
    detail: 'The server recomputes HMAC-SHA256(nonce, storedKey) and compares it to your proof. On match, a full-access JWT is issued and stored. Your session is now quantum-authenticated — forward secrecy is maintained via key rotation.',
    tech: 'JWT · Forward secrecy · Key rotation',
  },
]

function HowItWorks() {
  const [active, setActive] = useState(0)
  const step = STEPS[active]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Step selector */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
        {STEPS.map((s, i) => (
          <button
            key={s.num}
            onClick={() => setActive(i)}
            style={{
              background: active === i ? `${s.color}18` : 'rgba(255,255,255,0.03)',
              border: `0.5px solid ${active === i ? s.color : 'rgba(34,211,238,0.12)'}`,
              borderRadius: 10, padding: '10px 6px',
              cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s',
            }}
          >
            <div style={{ fontSize: 18, marginBottom: 4 }}>{s.icon}</div>
            <div style={{
              fontSize: 9, fontFamily: '"JetBrains Mono", monospace',
              color: active === i ? s.color : 'rgba(100,116,139,0.7)',
              letterSpacing: '0.08em',
            }}>{s.num}</div>
          </button>
        ))}
      </div>

      {/* Detail card */}
      <div style={{
        background: 'rgba(15,28,52,0.6)',
        border: `0.5px solid ${step.color}40`,
        borderRadius: 14, padding: '2rem',
        backdropFilter: 'blur(12px)', transition: 'border-color 0.3s',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12, flexShrink: 0,
            background: `${step.color}18`, border: `0.5px solid ${step.color}50`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
          }}>{step.icon}</div>
          <div>
            <div style={{ fontSize: 10, fontFamily: '"JetBrains Mono", monospace', color: step.color, letterSpacing: '0.1em', marginBottom: 4 }}>
              STEP {step.num}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9', fontFamily: '"Syne", sans-serif' }}>
              {step.title}
            </div>
          </div>
        </div>

        <p style={{ fontSize: 14, color: 'rgba(148,163,184,0.85)', lineHeight: 1.8, marginBottom: 20 }}>
          {step.detail}
        </p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {step.tech.split(' · ').map(t => (
            <span key={t} style={{
              fontSize: 11, fontFamily: '"JetBrains Mono", monospace',
              color: step.color, background: `${step.color}12`,
              border: `0.5px solid ${step.color}30`,
              borderRadius: 99, padding: '3px 10px',
            }}>{t}</span>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 6, marginTop: 24, justifyContent: 'center' }}>
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              style={{
                width: active === i ? 20 : 6, height: 6,
                borderRadius: 99, border: 'none', cursor: 'pointer',
                background: active === i ? step.color : 'rgba(100,116,139,0.3)',
                transition: 'all 0.25s', padding: 0,
              }}
            />
          ))}
        </div>
      </div>

      {/* Prev / Next */}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button
          onClick={() => setActive(i => Math.max(0, i - 1))}
          disabled={active === 0}
          style={{
            background: 'transparent', border: '0.5px solid rgba(34,211,238,0.2)',
            borderRadius: 8, padding: '8px 18px',
            color: active === 0 ? 'rgba(100,116,139,0.3)' : '#94a3b8',
            fontSize: 13, fontFamily: '"Syne", sans-serif', fontWeight: 600,
            cursor: active === 0 ? 'default' : 'pointer', transition: 'all 0.2s',
          }}
        >← Previous</button>
        <button
          onClick={() => setActive(i => Math.min(STEPS.length - 1, i + 1))}
          disabled={active === STEPS.length - 1}
          style={{
            background: 'transparent', border: '0.5px solid rgba(34,211,238,0.2)',
            borderRadius: 8, padding: '8px 18px',
            color: active === STEPS.length - 1 ? 'rgba(100,116,139,0.3)' : '#22d3ee',
            fontSize: 13, fontFamily: '"Syne", sans-serif', fontWeight: 600,
            cursor: active === STEPS.length - 1 ? 'default' : 'pointer', transition: 'all 0.2s',
          }}
        >Next →</button>
      </div>
    </div>
  )
}

/* ─── Main ─── */
export default function HomePage() {
  const navigate = useNavigate()

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0d1b2e; }

        .qa-shell {
          min-height: 100vh;
          background: radial-gradient(ellipse 80% 50% at 50% -10%, rgba(6,182,212,0.15) 0%, transparent 70%),
                      radial-gradient(ellipse 50% 40% at 80% 80%, rgba(99,102,241,0.08) 0%, transparent 60%),
                      #0d1b2e;
          position: relative; overflow: hidden;
          font-family: 'Syne', system-ui, sans-serif;
          color: #e2e8f0;
        }

        .qa-primary {
          background: linear-gradient(135deg, #06b6d4, #0891b2);
          color: #0d1b2e; font-weight: 700; font-size: 15px;
          letter-spacing: 0.02em; border: none; cursor: pointer;
          font-family: 'Syne', sans-serif;
          box-shadow: 0 0 20px rgba(6,182,212,0.35);
          transition: transform 0.18s, box-shadow 0.18s;
        }
        .qa-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 0 32px rgba(6,182,212,0.55);
        }
      `}</style>

      <div className="qa-shell">
        <QuantumCanvas />

        {/* ── Header ── */}
        <header style={{
          position: 'relative', zIndex: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '1.2rem 2.5rem',
          borderBottom: '0.5px solid rgba(34,211,238,0.08)',
          backdropFilter: 'blur(12px)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <ellipse cx="11" cy="11" rx="9" ry="4.5" stroke="#22d3ee" strokeWidth="1.2" transform="rotate(0 11 11)" />
              <ellipse cx="11" cy="11" rx="9" ry="4.5" stroke="#22d3ee" strokeWidth="1.2" transform="rotate(60 11 11)" opacity=".6" />
              <ellipse cx="11" cy="11" rx="9" ry="4.5" stroke="#22d3ee" strokeWidth="1.2" transform="rotate(120 11 11)" opacity=".35" />
              <circle cx="11" cy="11" r="1.8" fill="#22d3ee" />
            </svg>
            <span style={{ fontSize: 17, fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.3px' }}>Qauth</span>
          </div>
        </header>

        {/* ── Hero ── */}
        <main style={{
          position: 'relative', zIndex: 10,
          maxWidth: 860, margin: '0 auto',
          padding: '5rem 2rem 4rem',
          textAlign: 'center',
        }}>
          {/* Badges */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            <Badge label="Post-Quantum Cryptography" />
            <Badge label="Zero-Knowledge Proof" />
            <Badge label="HMAC-SHA256" />
          </div>

          <h1 style={{
            fontSize: 'clamp(2.2rem, 6vw, 3.8rem)',
            fontWeight: 800, lineHeight: 1.1, letterSpacing: '-1.5px',
            background: 'linear-gradient(135deg, #f8fafc 30%, #22d3ee 75%, #818cf8 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            marginBottom: '1.25rem',
          }}>
            Quantum-Grade<br />Authentication
          </h1>

          <p style={{
            fontSize: 'clamp(15px, 2vw, 17px)',
            color: 'rgba(148,163,184,0.85)',
            lineHeight: 1.75, maxWidth: 580, margin: '0 auto 2.5rem',
          }}>
            A defense-in-depth auth system powered by ANU Quantum RNG, post-quantum key
            conditioning, HMAC challenge-response, and a real-time behavioral risk engine.
          </p>

          {/* CTA */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: '3.5rem' }}>
            <button
              onClick={() => navigate('/login')}
              className="qa-primary"
              style={{ borderRadius: 10, padding: '13px 28px' }}
            >
              Launch Secure Login →
            </button>
            <button
              onClick={() => navigate('/login', { state: { mode: 'register' } })}
              style={{
                background: 'transparent',
                border: '0.5px solid rgba(34,211,238,0.35)',
                borderRadius: 10, padding: '13px 28px',
                color: '#94a3b8', fontSize: 15, fontWeight: 600,
                cursor: 'pointer', fontFamily: '"Syne", sans-serif',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(34,211,238,0.7)'; e.currentTarget.style.color = '#22d3ee' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(34,211,238,0.35)'; e.currentTarget.style.color = '#94a3b8' }}
            >
              Create Account
            </button>
          </div>

          {/* Stats */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: 12, marginBottom: '4rem',
          }}>
            <StatCard label="Key entropy (bits)" value={256} />
            <StatCard label="Risk levels" value={4} />
            <StatCard label="RNG fallback tiers" value={3} />
            <StatCard label="Nonce TTL (sec)" value={300} />
          </div>

          {/* Divider */}
          <div style={{
            height: '0.5px',
            background: 'linear-gradient(90deg, transparent, rgba(34,211,238,0.25), transparent)',
            marginBottom: '3rem',
          }} />

          {/* Features grid */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 12, textAlign: 'left', marginBottom: '4rem',
          }}>
            <Feature icon="⚛" title="Quantum Key Generation"
              desc="Entropy sourced from ANU QRNG (vacuum fluctuations), falling back to BB84 simulation and OS CSPRNG. Conditioned with SHA3-256." />
            <Feature icon="🔐" title="HMAC Challenge-Response"
              desc="Your 256-bit quantum key never travels the wire. You sign a server nonce locally — only the proof is transmitted." />
            <Feature icon="🛡" title="Behavioral Risk Engine"
              desc="Real-time scoring in Redis tracks brute-force patterns, credential stuffing, bot user-agents, and time anomalies across sliding windows." />
            <Feature icon="🔄" title="Forward Secrecy via Rotation"
              desc="One-time key reveal with instant rotation. Old keys are cryptographically invalidated; only the fingerprint (SHA-256 hash) is retained." />
            <Feature icon="🔒" title="AES-256-GCM at Rest"
              desc="Keys encrypted with PBKDF2-derived master keys. A stolen database yields no usable material without server-side secrets." />
            <Feature icon="📊" title="Audit Intelligence"
              desc="Every LoginEvent records the 'why' behind blocks — feeding the Admin Dashboard with actionable threat intelligence." />
          </div>

          {/* Auth flow strip */}
          <div style={{
            background: 'rgba(15,28,52,0.6)',
            border: '0.5px solid rgba(34,211,238,0.14)',
            borderRadius: 14, padding: '1.75rem 2rem',
            backdropFilter: 'blur(12px)',
          }}>
            <div style={{ fontSize: 11, letterSpacing: '0.12em', color: 'rgba(34,211,238,0.6)', textTransform: 'uppercase', marginBottom: '1.25rem' }}>
              The quantum handshake — 5 steps
            </div>
            <div style={{ display: 'flex', gap: 0, alignItems: 'center', overflowX: 'auto', paddingBottom: 4 }}>
              {[
                ['01', 'Password Verify',  'Bootstrap JWT issued'],
                ['02', 'Key Reveal',       'One-time quantum key shown'],
                ['03', 'Nonce Request',    'Server sends random nonce'],
                ['04', 'HMAC Proof',       'Client signs nonce locally'],
                ['05', 'Token Grant',      'Full access JWT issued'],
              ].map(([num, title, sub], i, arr) => (
                <div key={num} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                  <div style={{ textAlign: 'center', minWidth: 120 }}>
                    <div style={{ fontSize: 10, color: 'rgba(34,211,238,0.5)', fontFamily: '"JetBrains Mono", monospace', marginBottom: 4 }}>{num}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', marginBottom: 2 }}>{title}</div>
                    <div style={{ fontSize: 10, color: 'rgba(148,163,184,0.6)', lineHeight: 1.4 }}>{sub}</div>
                  </div>
                  {i < arr.length - 1 && (
                    <div style={{ color: 'rgba(34,211,238,0.35)', fontSize: 18, margin: '0 6px', flexShrink: 0 }}>›</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </main>

        {/* ── How It Works ── */}
        <section style={{
          position: 'relative', zIndex: 10,
          maxWidth: 860, margin: '0 auto',
          padding: '0 2rem 5rem',
        }}>
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <div style={{ fontSize: 11, letterSpacing: '0.12em', color: 'rgba(34,211,238,0.6)', textTransform: 'uppercase', marginBottom: 10 }}>
              How it works
            </div>
            <h2 style={{
              fontSize: 'clamp(1.5rem, 4vw, 2.2rem)', fontWeight: 800, letterSpacing: '-0.5px',
              background: 'linear-gradient(135deg, #f8fafc 40%, #22d3ee 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            }}>
              The Quantum Authentication Flow
            </h2>
            <p style={{ fontSize: 14, color: 'rgba(148,163,184,0.7)', marginTop: 10, maxWidth: 480, margin: '10px auto 0' }}>
              Click each step to explore what happens under the hood
            </p>
          </div>
          <HowItWorks />
        </section>

        {/* ── Footer ── */}
        <footer style={{
          position: 'relative', zIndex: 10, textAlign: 'center',
          padding: '1.5rem 2rem',
          borderTop: '0.5px solid rgba(34,211,238,0.07)',
          fontSize: 12, color: 'rgba(100,116,139,0.7)',
        }}>
          Qauth — Quantum Authentication Platform &nbsp;·&nbsp; AES-256-GCM · SHA3-256 · HMAC-SHA256 · BB84
        </footer>
      </div>
    </>
  )
}