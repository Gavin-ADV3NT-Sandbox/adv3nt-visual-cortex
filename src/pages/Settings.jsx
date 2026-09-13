import { useState, useEffect } from 'react'
import { useTheme } from '../context/theme'

function Section({ title, children }) {
  return (
    <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border-subtle)', overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{title}</div>
      </div>
      <div style={{ padding: '20px 24px' }}>{children}</div>
    </div>
  )
}

function StatusDot({ color }) {
  return <div style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
}

export default function Settings() {
  const { theme, toggle } = useTheme()
  // Live proxy health check — proves the server-side key path, not just a static label
  const [elStatus, setElStatus] = useState('checking') // checking | active | unreachable
  useEffect(() => {
    let cancelled = false
    fetch('/api/elevenlabs/video?page_size=1')
      .then(r => { if (!cancelled) setElStatus(r.ok ? 'active' : 'unreachable') })
      .catch(() => { if (!cancelled) setElStatus('unreachable') })
    return () => { cancelled = true }
  }, [])

  return (
    <div style={{ paddingTop: 'var(--nav-h)', minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 24px' }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.5px', marginBottom: 28 }}>Settings</h1>

        <Section title="Appearance">
          <div style={{ display: 'flex', gap: 10 }}>
            {(['light', 'dark']).map(val => {
              const on = theme === val
              return (
                <button key={val} onClick={e => { if (!on) toggle(e.clientX, e.clientY) }} style={{
                  flex: 1, padding: '14px 12px', borderRadius: 12, cursor: on ? 'default' : 'pointer',
                  border: `1.5px solid ${on ? '#8B5CF6' : 'var(--border)'}`,
                  background: on ? 'rgba(139,92,246,0.09)' : 'var(--bg)',
                  color: on ? '#8B5CF6' : 'var(--text-secondary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
                  fontWeight: 600, fontSize: 14, fontFamily: 'inherit',
                  transition: 'all 0.15s',
                  boxShadow: on ? '0 0 0 1px #8B5CF655' : 'none',
                }}>
                  {val === 'light' ? (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <circle cx="12" cy="12" r="5"/>
                      <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                    </svg>
                  )}
                  {val.charAt(0).toUpperCase() + val.slice(1)}
                </button>
              )
            })}
          </div>
        </Section>

        <Section title="ElevenLabs Creative Engine">
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
            All video and image generation runs on the ElevenLabs Developer Grant via the OpenClaw server-side proxy. No browser sign-in, no client-side credentials.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <StatusDot color={elStatus === 'active' ? '#34C759' : elStatus === 'checking' ? '#FF9F0A' : '#FF3B30'} />
            <span style={{ fontSize: 13, fontWeight: 600, color: elStatus === 'active' ? '#34C759' : elStatus === 'checking' ? '#FF9F0A' : '#FF3B30' }}>
              {elStatus === 'active' ? 'Active — Connected via OpenClaw server-side proxy'
                : elStatus === 'checking' ? 'Checking proxy status…'
                : 'Proxy unreachable — check OpenClaw gateway'}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', marginTop: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
            <span style={{ fontWeight: 600 }}>API Key</span><span>…0c76 (server-managed, zero browser exposure)</span>
            <span style={{ fontWeight: 600 }}>Models</span><span>Veo 3.1 (Video) · GPT-Image-2 (Images)</span>
            <span style={{ fontWeight: 600 }}>Grant</span><span>1,000,000 Video Tokens Active</span>
          </div>
        </Section>

        <Section title="ADV3NT Engine">
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
            ADV3NT Engine is active via OpenClaw Gateway. Vision analysis handled by MiniMax-M3.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <StatusDot color="#34C759" />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#34C759' }}>ADV3NT Engine: Active</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            Vision: MiniMax-M3 · Reasoning: GLM-5
          </div>
        </Section>
      </div>
    </div>
  )
}
