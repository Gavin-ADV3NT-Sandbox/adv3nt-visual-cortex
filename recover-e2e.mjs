import fs from 'fs'
const key = fs.readFileSync('/home/ubuntu/.openclaw/.env', 'utf-8').split('\n').find(l => l.startsWith('ELEVENLABS_API_KEY=')).split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '')
const st = await (await fetch('https://api.elevenlabs.io/v1/flows/image/8zQntbbkrkqjqbVubJqR', { headers: { 'xi-api-key': key } })).json()
console.log('status:', st.status, '| url:', st.content_url ? 'present' : 'none')
if ((st.status || '').toLowerCase() === 'completed' && st.content_url) {
  const dl = await fetch(st.content_url)
  fs.writeFileSync('/home/ubuntu/.openclaw/workspace/regression-e2e-turnaround.png', Buffer.from(await dl.arrayBuffer()))
  console.log('DONE → workspace/regression-e2e-turnaround.png')
}
