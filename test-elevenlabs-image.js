#!/usr/bin/env node
// test-elevenlabs-image.js — standalone verification of the ElevenLabs Flows image pipeline.
// Mirrors the exact REST surface the studio's generator uses (POST /v1/flows/image,
// GET /v1/flows/image/{id}), so a pass proves both grant tokens and schema.
//
// Usage:
//   node test-elevenlabs-image.js            → full flow (generate → poll → download)
//   node test-elevenlabs-image.js --quick    → verify key + list recent generations
//   node test-elevenlabs-image.js --ref <f>  → full flow with a reference image file

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

  if (process.argv.includes('--quick')) {
    const list = await api('GET', '/image?page_size=5', key)
    if (list.ok) {
      const gens = list.data.generations || []
      console.log(`✓ API access confirmed — ${gens.length} recent image generation(s)`)
      for (const g of gens) console.log(`  - ${g.id}: ${g.status}`)
      process.exit(0)
    }
    console.error(`✗ API error ${list.status}: ${JSON.stringify(list.data).slice(0, 300)}`)
    process.exit(1)
  }

  // Build request — gpt-image-2 (the model Higgsfield used; verified authorized)
  const body = {
    model_id: 'gpt-image-2',
    prompt: 'A professional studio portrait of a confident woman with dark hair, soft rim lighting, shallow depth of field, photorealistic',
    aspect_ratio: '9:16',
    resolution: '1K', // smoke-test economy
    quality: 'medium',
  }

  // Optional reference image
  const refIdx = process.argv.indexOf('--ref')
  if (refIdx !== -1 && process.argv[refIdx + 1]) {
    const filePath = process.argv[refIdx + 1]
    const buf = fs.readFileSync(filePath)
    const ext = filePath.split('.').pop().toLowerCase()
    const mimes = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
    const mime = mimes[ext]
    if (!mime) { console.error(`✗ Unsupported ref extension .${ext}`); process.exit(1) }
    body.images = [{ type: 'inline_base64', content_base64: buf.toString('base64'), mime_type: mime }]
    console.log(`→ Including reference image: ${filePath} (${(buf.length / 1024).toFixed(0)} KB)`)
  }

  console.log('→ Launching test image generation (gpt-image-2, 1K)...')
  const create = await api('POST', '/image', key, body)
  if (!create.ok) {
    console.error(`✗ Create failed ${create.status}: ${JSON.stringify(create.data).slice(0, 400)}`)
    process.exit(1)
  }
  const id = create.data.id
  console.log(`✓ Generation launched: ${id}`)

  // Poll until terminal (max ~5 min)
  const deadline = Date.now() + 5 * 60 * 1000
  let url = null
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 4000))
    const st = await api('GET', `/image/${id}`, key)
    const status = (st.data?.status || '').toLowerCase()
    process.stdout.write(`  [${new Date().toISOString().slice(11, 19)}] status: ${status}        \r`)
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
  console.log(`\n✓ Generation completed (${create.data.id})`)

  // Download to confirm URL liveness
  console.log('→ Downloading output...')
  const dl = await fetch(url)
  if (!dl.ok) { console.error(`✗ Download failed: HTTP ${dl.status}`); process.exit(1) }
  const buf = Buffer.from(await dl.arrayBuffer())
  const out = '/tmp/elevenlabs-smoke-image.png'
  fs.writeFileSync(out, buf)
  console.log(`✓ Downloaded ${(buf.length / 1024).toFixed(0)} KB → ${out}`)
  console.log(`\n✅ IMAGE SMOKE TEST PASSED — grant tokens firing on the image pipeline. ${url.slice(0, 80)}...`)
}

main().catch(e => { console.error('✗ Unexpected error:', e.message); process.exit(1) })
