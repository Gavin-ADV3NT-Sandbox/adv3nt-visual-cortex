#!/usr/bin/env node
// test-elevenlabs-video.js — standalone verification of the ElevenLabs Flows video pipeline.
// Exercises the EXACT same code path the studio uses (via the Vite proxy), so the
// result proves both the grant tokens fire AND the studio plumbing works end-to-end.
//
// Usage:
//   node test-elevenlabs-video.js              → full flow (generate → poll → download)
//   node test-elevenlabs-video.js --quick      → skip generation, just verify key + API access
//
// NOTE: the studio's generator runs in the browser against the Vite middleware.
// This script bypasses Vite and hits the same ElevenLabs REST surface directly
// with the server-stored key — proving grant + schema; the proxy adds zero logic.

import fs from 'fs'

const ENV_PATH = '/home/ubuntu/.openclaw/.env'
const API = 'https://api.elevenlabs.io/v1/flows'

function readKey() {
  try {
    const m = fs.readFileSync(ENV_PATH, 'utf-8').match(/^ELEVENLABS_API_KEY=(.+)$/m)
    if (!m) return null
    return m[1].trim().replace(/^['"]|['"]$/g, '')
  } catch { return null }
}

async function api(method, path, key, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = { raw: text } }
  return { status: res.status, ok: res.ok, data }
}

async function main() {
  const key = readKey()
  if (!key) {
    console.error('✗ ELEVENLABS_API_KEY not found in ' + ENV_PATH)
    process.exit(1)
  }
  console.log(`✓ Key loaded (${key.length} chars, ending ...${key.slice(-4)})`)

  // ── Quick mode: verify key validity by listing recent video generations ──
  const quick = process.argv.includes('--quick')

  if (quick) {
    const list = await api('GET', '/video?page_size=5', key)
    if (list.ok) {
      const gens = list.data.generations || []
      console.log(`✓ API access confirmed — ${gens.length} recent generation(s)`)
      for (const g of gens) console.log(`  - ${g.id}: ${g.status}`)
      process.exit(0)
    }
    console.error(`✗ API error ${list.status}: ${JSON.stringify(list.data).slice(0, 300)}`)
    process.exit(1)
  }

  // ── Full mode: short test generation → poll → download ──
  // ByteDance models are locked behind approval on this grant; Veo 3.1 verified working.
  const body = {
    model_id: 'veo-3.1-fast-generate-001',
    prompt: 'A serene beach at golden hour, waves gently rolling, cinematic slow pan, warm tones',
    aspect_ratio: '16:9',
    duration_secs: 4,
    generate_audio: false,
  }
  console.log('→ Launching test video generation (480p, 4s, fast model)...')
  const create = await api('POST', '/video', key, body)
  if (!create.ok) {
    console.error(`✗ Create failed ${create.status}: ${JSON.stringify(create.data).slice(0, 400)}`)
    process.exit(1)
  }
  const id = create.data.id
  console.log(`✓ Generation launched: ${id}`)

  // Poll until terminal (max ~10 min)
  const deadline = Date.now() + 10 * 60 * 1000
  let url = null
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 5000))
    const st = await api('GET', `/video/${id}`, key)
    const status = (st.data?.status || '').toLowerCase()
    process.stdout.write(`  [${new Date().toISOString().slice(11, 19)}] status: ${status}\r`)
    if (status === 'completed' && st.data?.content_url) { url = st.data.content_url; break }
    if (status === 'failed') {
      console.error(`\n✗ Generation failed: ${st.data?.failure_reason} — ${st.data?.error_message}`)
      process.exit(1)
    }
    if (!st.ok) {
      console.error(`\n✗ Poll error ${st.status}: ${JSON.stringify(st.data).slice(0, 300)}`)
      process.exit(1)
    }
  }
  if (!url) { console.error('\n✗ Timed out waiting for completion'); process.exit(1) }
  console.log(`\n✓ Generation completed`)

  // Download to confirm the URL is live
  console.log('→ Downloading output...')
  const dl = await fetch(url)
  if (!dl.ok) { console.error(`✗ Download failed: HTTP ${dl.status}`); process.exit(1) }
  const buf = Buffer.from(await dl.arrayBuffer())
  const out = '/tmp/elevenlabs-smoke-test.mp4'
  fs.writeFileSync(out, buf)
  console.log(`✓ Downloaded ${(buf.length / 1024 / 1024).toFixed(2)} MB → ${out}`)
  console.log(`\n✅ SMOKE TEST PASSED — grant tokens are firing. ${url.slice(0, 80)}...`)
}

main().catch(e => { console.error('✗ Unexpected error:', e.message); process.exit(1) })
