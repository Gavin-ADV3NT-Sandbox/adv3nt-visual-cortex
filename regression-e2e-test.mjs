import fs from 'fs'
// E2E: disk profile mainImage (data URL) → resolved base64 → gemini-3-pro-image turnaround
const key = fs.readFileSync('/home/ubuntu/.openclaw/.env', 'utf-8').split('\n').find(l => l.startsWith('ELEVENLABS_API_KEY=')).split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '')
const prof = JSON.parse(fs.readFileSync('state/mtz19z9ykin2b1cb35j.json', 'utf-8'))
const src = prof.mainImage
console.log('[TEST] mainImage type:', src.slice(0, 30), '| len:', src.length)
if (!src.startsWith('data:image')) { console.error('[TEST] FAIL: not a data URL'); process.exit(1) }
const [meta, b64] = src.split(',')
console.log(`[TEST] resolved: mime=${meta.slice(5, meta.indexOf(';'))} b64len=${b64.length} preview=${b64.slice(0, 32)}...`)
if (b64.length < 100) { console.error('[TEST] FAIL: empty bytes'); process.exit(1) }

const prompt = `Professional full-body character turnaround sheet. ${prof.physicalDesc || 'Male, early 30s, short dark hair, strong jawline'}. Single row of four equally sized full-body panels labelled "FRONT VIEW" | "SIDE VIEW" | "BACK VIEW" | "THREE-QUARTER VIEW". All four panels show the SAME person — identical face, hair, skin tone, proportions. The first reference image is the appearance reference — faithfully recreate this person's face, skin tone, hair, eye color exactly. Pure white background, flat studio lighting. Photorealistic.`
const r = await fetch('https://api.elevenlabs.io/v1/flows/image', {
  method: 'POST',
  headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
  body: JSON.stringify({ model_id: 'gemini-3-pro-image', prompt, aspect_ratio: '16:9', resolution: '2K',
    images: [{ type: 'inline_base64', content_base64: b64, mime_type: 'image/jpeg' }] }),
})
const d = await r.json()
console.log('[TEST] create →', r.status, d.id || JSON.stringify(d).slice(0, 120))
if (!d.id) process.exit(1)
for (let i = 0; i < 60; i++) {
  await new Promise(res => setTimeout(res, 4000))
  const st = await (await fetch('https://api.elevenlabs.io/v1/flows/image/' + d.id, { headers: { 'xi-api-key': key } })).json()
  const s = (st.status || '').toLowerCase()
  process.stdout.write(`  status: ${s}        \r`)
  if (s === 'completed' && st.content_url) {
    const dl = await fetch(st.content_url)
    fs.writeFileSync('/home/ubuntu/.openclaw/workspace/regression-e2e-turnaround.png', Buffer.from(await dl.arrayBuffer()))
    console.log('\n[TEST] DONE → workspace/regression-e2e-turnaround.png')
    process.exit(0)
  }
  if (s === 'failed') { console.log('\n[TEST] FAILED', st.failure_reason, st.error_message); process.exit(1) }
}
