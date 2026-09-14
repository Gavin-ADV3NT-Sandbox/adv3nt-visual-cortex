import fs from 'fs'
const key = fs.readFileSync('/home/ubuntu/.openclaw/.env', 'utf-8').split('\n').find(l => l.startsWith('ELEVENLABS_API_KEY='))?.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '')
const st = await (await fetch('https://api.elevenlabs.io/v1/flows/video/5rZKHOyk4kafzPZcIhKo', { headers: { 'xi-api-key': key } })).json()
console.log('status:', st.status, '| raw:', JSON.stringify({ status_text: st.status_text, error: st.error, error_message: st.error_message, failure_reason: st.failure_reason }).slice(0, 300))
if ((st.status || '').toLowerCase() === 'completed' && st.content_url) {
  const dl = await fetch(st.content_url)
  fs.writeFileSync('media/smoke-veo-gavin.mp4', Buffer.from(await dl.arrayBuffer()))
  console.log('DONE → media/smoke-veo-gavin.mp4 (' + fs.statSync('media/smoke-veo-gavin.mp4').size + ' bytes)')
}
