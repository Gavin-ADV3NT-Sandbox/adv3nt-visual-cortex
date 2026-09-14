// CLI smoke test — mirrors generateVideo's Veo dispatch with the live Gavin profile
import fs from 'fs'
const key = fs.readFileSync('/home/ubuntu/.openclaw/.env', 'utf-8').split('\n').find(l => l.startsWith('ELEVENLABS_API_KEY='))?.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '')
const prof = JSON.parse(fs.readFileSync('state/mu0kjl5idtgfkkfwa5o.json', 'utf-8'))

const refs = [
  { role: 'subject', b64: prof.mainImage },                                    // idx 0: face (mandatory)
  prof.wardrobeSlots?.[0]?.image ? { role: 'style', b64: prof.wardrobeSlots[0].image } : null,  // idx 1: wardrobe
].filter(Boolean)
const images = refs.map(r => ({ image: { type: 'inline_base64', content_base64: r.b64.split(',')[1], mime_type: 'image/jpeg' }, role: 'subject' }))
console.log('[SMOKE] dispatch →', images.length, 'images:', images.map(i => `${i.role}(${i.image.content_base64.length}b64)`).join(', '))

const prompt = `Self-filmed handheld video. The man from @image_1 holds the camera at arm's length, 24mm. He wears the knitwear outfit shown in @image_2. He looks at the lens and says with a warm smile: "Hey — quick one from the studio tonight." Natural indoor light, walk-pace handheld drift.`
const r = await fetch('https://api.elevenlabs.io/v1/flows/video', {
  method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
  body: JSON.stringify({ model_id: 'veo-3.1-generate-001', prompt, aspect_ratio: '9:16', resolution: '1080p', duration_secs: 8, generate_audio: true, images }),
})
const d = await r.json()
console.log('[SMOKE] create → HTTP', r.status, d.id || JSON.stringify(d).slice(0, 200))
if (!d.id) process.exit(1)
for (let i = 0; i < 90; i++) {
  await new Promise(res => setTimeout(res, 5000))
  const st = await (await fetch('https://api.elevenlabs.io/v1/flows/video/' + d.id, { headers: { 'xi-api-key': key } })).json()
  const s = (st.status || '').toLowerCase()
  process.stdout.write(`  status: ${s}          \r`)
  if (s === 'completed' && st.content_url) {
    const dl = await fetch(st.content_url)
    fs.writeFileSync('media/smoke-veo-gavin.mp4', Buffer.from(await dl.arrayBuffer()))
    console.log('\n[SMOKE] DONE → media/smoke-veo-gavin.mp4 (' + fs.statSync('media/smoke-veo-gavin.mp4').size + ' bytes)')
    process.exit(0)
  }
  if (s === 'failed') { console.log('\n[SMOKE] FAILED — raw payload:', JSON.stringify({ status_text: st.status_text, error: st.error, error_message: st.error_message, failure_reason: st.failure_reason, detail: st.detail })); process.exit(1) }
}
console.log('\n[SMOKE] timeout'); process.exit(1)
