import fs from 'fs'
import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Local dev search proxy — mirrors api/search.js for Vercel production
const searchPlugin = {
  name: 'search-proxy',
  configureServer(server) {
    server.middlewares.use('/api/search', async (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
      if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return }

      const q = new URLSearchParams(req.url.split('?')[1] || '').get('q')
      if (!q) { res.writeHead(400); res.end(JSON.stringify({ error: 'Missing q' })); return }

      try {
        const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`
        const r = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
        })
        const xml = await r.text()
        const items = []
        for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
          const block = match[1]
          const title = (block.match(/<title><!\[CDATA\[(.*?)\]\]>/)?.[1] || block.match(/<title>(.*?)<\/title>/)?.[1] || '').trim()
          const desc = (block.match(/<description><!\[CDATA\[(.*?)\]\]>/)?.[1] || block.match(/<description>(.*?)<\/description>/)?.[1] || '')
            .replace(/<[^>]+>/g, '').trim().slice(0, 300)
          const date = (block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '').trim()
          if (title) items.push({ title, description: desc, date })
          if (items.length >= 8) break
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ items }))
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: e.message, items: [] }))
      }
    })
  },
}

// Local dev image proxy — mirrors api/img-proxy.js for Vercel production
const imgProxyPlugin = {
  name: 'img-proxy',
  configureServer(server) {
    server.middlewares.use('/api/img-proxy', async (req, res) => {
      const qs = new URLSearchParams(req.url.split('?')[1] || '')
      const url = qs.get('url')
      const name = qs.get('name') || 'image.jpg'
      if (!url) { res.writeHead(400); res.end('Missing url'); return }
      try {
        const r = await fetch(decodeURIComponent(url))
        const ct = r.headers.get('content-type') || 'image/jpeg'
        const buf = await r.arrayBuffer()
        res.writeHead(r.status, {
          'Content-Type': ct,
          'Content-Disposition': `attachment; filename="${decodeURIComponent(name)}"`,
          'Access-Control-Allow-Origin': '*',
        })
        res.end(Buffer.from(buf))
      } catch (e) {
        res.writeHead(500); res.end('Proxy error: ' + e.message)
      }
    })
  },
}

// Local dev Claude proxy — mirrors api/claude.js for Vercel production
const claudePlugin = {
  name: 'claude-proxy',
  configureServer(server) {
    server.middlewares.use('/api/claude', async (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, anthropic-version, anthropic-beta')
      if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return }
      if (req.method !== 'POST') { res.writeHead(405); res.end('Method not allowed'); return }
      const apiKey = req.headers['x-api-key']
      if (!apiKey) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'Missing x-api-key' } })); return }
      const chunks = []
      req.on('data', c => chunks.push(c))
      await new Promise(r => req.on('end', r))
      const body = Buffer.concat(chunks).toString()
      try {
        const upstreamHeaders = {
          'x-api-key': apiKey,
          'anthropic-version': req.headers['anthropic-version'] || '2023-06-01',
          'content-type': 'application/json',
        }
        if (req.headers['anthropic-beta']) upstreamHeaders['anthropic-beta'] = req.headers['anthropic-beta']
        const upstream = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: upstreamHeaders, body })
        const data = await upstream.json()
        res.writeHead(upstream.status, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(data))
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: { message: e.message } }))
      }
    })
  },
}

// State Bridge — allows UI to save influencer profiles to disk for server-side agent access
const stateSavePlugin = {
  name: 'state-bridge',
  configureServer(server) {
    server.middlewares.use('/api/state', async (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
      if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return }

      const stateDir = path.join(process.cwd(), 'state')
      try { fs.mkdirSync(stateDir, { recursive: true }) } catch {}

      // Parse path: /api/state/:id or /api/state
      const segments = req.url.split('?')[0].split('/').filter(Boolean)
      const id = segments[0] // may be undefined for list

      if (req.method === 'GET' && !id) {
        // List all profiles
        try {
          const files = fs.readdirSync(stateDir).filter(f => f.endsWith('.json'))
          const profiles = files.map(f => {
            try { return JSON.parse(fs.readFileSync(path.join(stateDir, f), 'utf-8')) }
            catch { return null }
          }).filter(Boolean)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ profiles }))
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: e.message }))
        }
        return
      }

      if (req.method === 'GET' && id) {
        const filePath = path.join(stateDir, `${id}.json`)
        if (!fs.existsSync(filePath)) {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Profile not found' }))
          return
        }
        const data = fs.readFileSync(filePath, 'utf-8')
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(data)
        return
      }

      if (req.method === 'POST' && id) {
        const chunks = []
        req.on('data', c => chunks.push(c))
        await new Promise(r => req.on('end', r))
        const body = Buffer.concat(chunks).toString()
        const filePath = path.join(stateDir, `${id}.json`)
        fs.writeFileSync(filePath, body)

        // Cloud redundancy: async sync to Google Drive Social_Queue folder
        const SOCIAL_QUEUE_FOLDER_ID = '1ACeyKYGZzDa1e7eRCUKQyANrOMxcOiiy'
        const GWS_BIN = '/home/ubuntu/.npm-global/bin/gws'
        // Fire-and-forget — don't block the response on cloud sync
        const fileName = `${id}.json`
        try {
          import('child_process').then(({ exec }) => {
            exec(`"${GWS_BIN}" drive files upload --params '{"name": "${fileName}", "parents": ["${SOCIAL_QUEUE_FOLDER_ID}"]}' --media "${filePath}"`, { timeout: 15000 }, (err) => {
              if (err) console.warn('[StateBridge] Drive sync failed for', fileName, ':', err.message)
              else console.log('[StateBridge] Drive sync OK:', fileName)
            })
          })
        } catch (e) { console.warn('[StateBridge] Drive sync spawn failed:', e.message) }

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true, savedAt: new Date().toISOString() }))
        return
      }

      res.writeHead(405)
      res.end('Method not allowed')
    })
  },
}

// ElevenLabs Flows proxy — video/image generation via server-stored key (dev grant).
// Client stays secret-free: browser code talks to /api/elevenlabs/* only.
const elevenlabsProxy = {
  name: 'elevenlabs-proxy',
  configureServer(server) {
    // Read key once at server start; fall back to lazy read per-request if env file appears later
    const ENV_PATH = '/home/ubuntu/.openclaw/.env'
    let cachedKey = null
    function readKey() {
      if (cachedKey) return cachedKey
      try {
        const m = fs.readFileSync(ENV_PATH, 'utf-8').match(/^ELEVENLABS_API_KEY=(.+)$/m)
        if (m) { cachedKey = m[1].trim().replace(/^['"]|['"]$/g, '') }
      } catch {}
      return cachedKey
    }

    server.middlewares.use('/api/elevenlabs', async (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
      if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return }

      const key = readKey()
      if (!key) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: { message: 'ELEVENLABS_API_KEY not found in ' + ENV_PATH } }))
        return
      }

      // Path after mount point: /video, /video/:id, /image, /image/:id
      const segments = req.url.split('?')[0].split('/').filter(Boolean) // e.g. ['video'] or ['video', '<id>']
      const kind = segments[0]
      const id = segments[1]
      if (kind !== 'video' && kind !== 'image') {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: { message: `Unknown flows kind: ${kind}` } }))
        return
      }

      let body
      if (req.method === 'POST') {
        const chunks = []
        req.on('data', c => chunks.push(c))
        await new Promise(r => req.on('end', r))
        try { body = JSON.parse(Buffer.concat(chunks).toString()) }
        catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: { message: 'Invalid JSON body' } }))
          return
        }
        // Never trust a client-supplied key header/body — server key wins
        delete body.api_key
        delete body.xi_api_key
      } else if (req.method !== 'GET') {
        res.writeHead(405); res.end('Method not allowed'); return
      }

      const upstreamPath = id ? `/v1/flows/${kind}/${id}` : `/v1/flows/${kind}`
      const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''
      try {
        const upstream = await fetch(`https://api.elevenlabs.io${upstreamPath}${qs}`, {
          method: req.method,
          headers: {
            'xi-api-key': key,
            'Content-Type': 'application/json',
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        })
        const data = await upstream.text()
        res.writeHead(upstream.status, { 'Content-Type': 'application/json' })
        res.end(data)
      } catch (e) {
        res.writeHead(502, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: { message: 'ElevenLabs upstream error: ' + e.message } }))
      }
    })
  },
}

// Gavin Proxy — multimodal router: text→GLM-5, vision→MiniMax-M3 via OpenClaw Gateway
const gavinProxy = {
  name: 'gavin-proxy',
  configureServer(server) {
    server.middlewares.use('/api/gavin', async (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
      if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return }
      if (req.method !== 'POST') { res.writeHead(405); res.end('Method not allowed'); return }

      const chunks = []
      req.on('data', c => chunks.push(c))
      await new Promise(r => req.on('end', r))
      const bodyStr = Buffer.concat(chunks).toString()

      try {
        let body = JSON.parse(bodyStr)
        let model = body.model || 'zai/glm-5'

        // Detect vision payload: check messages for image content
        const hasVision = (body.messages || []).some(msg => {
          if (!Array.isArray(msg.content)) return false
          return msg.content.some(c =>
            c.type === 'image' ||
            c.type === 'image_url' ||
            (typeof c === 'object' && c.image && typeof c.image === 'string' && c.image.startsWith('data:'))
          )
        })

        if (hasVision) {
          model = 'minimaxai/minimax-m3'
        }

        body.model = model

        const upstream = await fetch('http://127.0.0.1:18789/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = await upstream.text()
        res.writeHead(upstream.status, { 'Content-Type': 'application/json' })
        res.end(data)
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: { message: e.message } }))
      }
    })
  },
}

export default defineConfig({
  plugins: [react(), searchPlugin, imgProxyPlugin, claudePlugin, stateSavePlugin, elevenlabsProxy, gavinProxy],
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api/hf': {
        target: 'https://mcp.higgsfield.ai',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api\/hf/, ''),
      },
    },
  },
})
