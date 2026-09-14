// ElevenLabs Flows generator — full replacement for the Higgsfield MCP dispatch.
// Talks only to the Vite dev middleware (/api/elevenlabs/*) which injects the
// server-stored ELEVENLABS_API_KEY. Browser code stays secret-free and zero-touch.
//
// Models verified live on the developer grant (2026-09-09):
//   VIDEO: veo-3.1-generate-001, veo-3.1-fast-generate-001  (ByteDance video = 403)
//   IMAGE: gpt-image-2, gpt-image-1.5, gemini-3-pro-image, gemini-3.1-flash-image,
//          gemini-3.1-flash-lite-image, gemini-2.5-flash-image (Seedream = 403)

const FLOWS_BASE = '/api/elevenlabs'

// ── Model maps: Higgsfield id → ElevenLabs model_id ──────────────────────────
const VIDEO_MODEL_MAP = {
  seedance_2_0: 'veo-3.1-generate-001',          // quality tier
  seedance_2_0_fast: 'veo-3.1-fast-generate-001', // fast tier
}
const DEFAULT_VIDEO_MODEL = 'veo-3.1-fast-generate-001'

const IMAGE_MODEL_MAP = {
  gpt_image_2: 'gpt-image-2',        // OpenAI tier
  soul_2: 'gemini-3-pro-image',      // photoreal portrait tier — Gavin's native lineage
}
// Default: gemini-3-pro-image — superior subject retention; the canonical Gavin
// avatar was synthesized in a Gemini latent space, so facial geometry carries natively.
const DEFAULT_IMAGE_MODEL = 'gemini-3-pro-image'

// Veo 3.1 constraints: aspect 16:9|9:16; duration 4|6|8 (images require 8);
// resolution 720p|1080p|4K; images max 3 ({image, role}), no audios field.
const VEO_RESOLUTIONS = new Set(['720p', '1080p', '4K'])
const VEO_DURATIONS = [4, 6, 8]
function snapDuration(want, hasImages) {
  if (hasImages) return 8
  return VEO_DURATIONS.reduce((best, d) => Math.abs(d - want) < Math.abs(best - want) ? d : best, 4)
}

// Image constraints: aspect auto|1:1|3:4|16:9|4:3|9:16; quality low|medium|high;
// resolution 1K|2K|4K; images max 10.
const IMAGE_ASPECTS = new Set(['auto', '1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'])
const IMAGE_RESOLUTION_MAP = { '1k': '1K', '2k': '2K', '4k': '4K', '1K': '1K', '2K': '2K', '4K': '4K' }
const GEMINI_IMAGE_MODELS = new Set(['gemini-2.5-flash-image', 'gemini-3-pro-image', 'gemini-3.1-flash-image', 'gemini-3.1-flash-lite-image'])

const ellog = (...a) => console.log('[EL]', ...a)

// ── Pending generation persistence (same localStorage keys as HF so the UI's ──
//    resume-after-reload effects keep working without modification)
const PENDING_GEN_KEY = 'hf_pending_gens'

export function savePendingGen(influencerId, slot, jobIds) {
  const list = JSON.parse(localStorage.getItem(PENDING_GEN_KEY) || '[]')
  const filtered = list.filter(j => !(j.influencerId === influencerId && j.slot === slot))
  filtered.push({ influencerId, slot, jobIds, startedAt: Date.now() })
  localStorage.setItem(PENDING_GEN_KEY, JSON.stringify(filtered))
}
export function clearPendingGen(influencerId, slot) {
  const list = JSON.parse(localStorage.getItem(PENDING_GEN_KEY) || '[]')
  localStorage.setItem(PENDING_GEN_KEY, JSON.stringify(
    list.filter(j => !(j.influencerId === influencerId && j.slot === slot))
  ))
}
export function getPendingGens() {
  return JSON.parse(localStorage.getItem(PENDING_GEN_KEY) || '[]')
}

const PENDING_VIDEO_KEY = 'hf_pending_videos'

export function savePendingVideo(influencerId, jobIds, count) {
  const list = JSON.parse(localStorage.getItem(PENDING_VIDEO_KEY) || '[]')
  const next = list.filter(j => j.influencerId !== influencerId)
  next.push({ influencerId, jobIds, count, startedAt: Date.now() })
  localStorage.setItem(PENDING_VIDEO_KEY, JSON.stringify(next))
}
export function clearPendingVideo(influencerId) {
  const list = JSON.parse(localStorage.getItem(PENDING_VIDEO_KEY) || '[]')
  localStorage.setItem(PENDING_VIDEO_KEY, JSON.stringify(list.filter(j => j.influencerId !== influencerId)))
}
export function getPendingVideo(influencerId) {
  const list = JSON.parse(localStorage.getItem(PENDING_VIDEO_KEY) || '[]')
  return list.find(j => j.influencerId === influencerId) || null
}

const PENDING_PHOTO_KEY = 'hf_pending_photos_v2'
const PHOTO_SESSION_KEY = 'hf_photo_gen_session'

export function savePendingPhoto(influencerId, jobIds) {
  const list = JSON.parse(localStorage.getItem(PENDING_PHOTO_KEY) || '[]')
  const next = list.filter(j => j.influencerId !== influencerId)
  next.push({ influencerId, jobIds, startedAt: Date.now() })
  localStorage.setItem(PENDING_PHOTO_KEY, JSON.stringify(next))
}
export function clearPendingPhoto(influencerId) {
  const list = JSON.parse(localStorage.getItem(PENDING_PHOTO_KEY) || '[]')
  localStorage.setItem(PENDING_PHOTO_KEY, JSON.stringify(list.filter(j => j.influencerId !== influencerId)))
}
export function getPendingPhoto(influencerId) {
  const list = JSON.parse(localStorage.getItem(PENDING_PHOTO_KEY) || '[]')
  return list.find(j => j.influencerId === influencerId) || null
}
export function markPhotoGenSession() { try { sessionStorage.setItem(PHOTO_SESSION_KEY, '1') } catch {} }
export function hasPhotoGenSession() { try { return !!sessionStorage.getItem(PHOTO_SESSION_KEY) } catch { return false } }

// Stateless REST — no session handshake needed. Kept for API compatibility with
// callers that do `initSession().then(() => pollAllJobs(...))`.
export async function initSession() {}

// ── Media conversion ─────────────────────────────────────────────────────────
function bufToBase64(buf) {
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < buf.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, buf.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

// ── Headless crop fallback ──────────────────────────────────────────────
// Foreign outfit reference photos (user uploads featuring a different human
// model) cause multi-face attention blending in Gemini. Uploaded images enter
// as data: URLs; studio-generated refs (Gavin's own cards/sheets) are hosted
// URLs. Crop the head/neck region from uploaded refs only — garment pixels pass.
export async function cropHeadFromRef(src, topFraction = 0.28) {
  if (!src || !src.startsWith('data:')) return src // hosted/generated refs pass untouched
  const img = await new Promise((res, rej) => {
    const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('ref load failed')); i.src = src
  })
  const c = document.createElement('canvas')
  c.width = img.naturalWidth; c.height = Math.floor(img.naturalHeight * (1 - topFraction))
  const ctx = c.getContext('2d')
  ctx.drawImage(img, 0, Math.floor(img.naturalHeight * topFraction), img.naturalWidth, c.height, 0, 0, img.naturalWidth, c.height)
  return c.toDataURL('image/jpeg', 0.92)
}

async function toInlineImage(src) {
  if (!src) throw new Error('no image source provided')
  // Resolve any origin — data:, blob:, hosted, or CORS-blocked CDN — to inline_base64.
  // CDN refs route through the dev-server img-proxy (server-side fetch, no CORS);
  // blob: URLs resolve via FileReader (same-origin object URLs always readable).
  let fetchable = src
  if (src.startsWith('blob:')) {
    fetchable = await new Promise((res, rej) => {
      const fr = new FileReader()
      fr.onload = () => res(fr.result)
      fr.onerror = () => rej(new Error('blob: URL unreadable (object may be revoked)'))
      fetch(src).then(b => b.blob()).then(b => fr.readAsDataURL(b)).catch(rej)
    })
    return { type: 'inline_base64', content_base64: fetchable.split(',')[1], mime_type: fetchable.slice(5, fetchable.indexOf(';')) }
  }
  if (/^https?:/.test(src) && !src.includes('/api/img-proxy')) {
    fetchable = `/api/img-proxy?url=${encodeURIComponent(src)}`
  }
  const res = await fetch(fetchable)
  if (!res.ok) throw new Error(`ref fetch failed: HTTP ${res.status} for ${String(src).slice(0, 60)}`)
  const blob = await res.blob()
  let mime = blob.type || 'image/jpeg'
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(mime)) {
    mime = 'image/jpeg'
  }
  const b64 = bufToBase64(new Uint8Array(await blob.arrayBuffer()))
  if (!b64 || b64.length < 100) throw new Error(`ref resolved to empty/invalid bytes (${b64.length}b)`)  
  return { type: 'inline_base64', content_base64: b64, mime_type: mime }
}

async function toInlineAudio(src) {
  const res = await fetch(src)
  const blob = await res.blob()
  const mime = blob.type || ''
  if (mime !== 'audio/mpeg' && mime !== 'audio/wav') {
    throw new Error(`Unsupported audio mime for ElevenLabs (need audio/mpeg or audio/wav, got ${mime || 'unknown'})`)
  }
  return { type: 'inline_base64', content_base64: bufToBase64(new Uint8Array(await blob.arrayBuffer())), mime_type: mime }
}

// Convert refs in parallel; failures skip that ref rather than killing the job
async function convertImages(srcs) {
  return (await Promise.all(
    srcs.filter(Boolean).map(async src => {
      try { return await toInlineImage(src) }
      catch (e) { console.warn('[EL] ref image conversion failed, skipping:', e.message); return null }
    })
  )).filter(Boolean)
}

// ── API helpers ──────────────────────────────────────────────────────────────
async function flowsPost(kind, body) {
  // Conditioning audit: log images[0] type/length/preview immediately before dispatch.
  // A text-only hallucination dispatch (empty/missing images) is caught here.
  if (kind === 'image') {
    const im0 = body?.images?.[0]
    if (im0?.content_base64) {
      console.log(`[EL] images[0] OK: type=${im0.type} mime=${im0.mime_type} b64len=${im0.content_base64.length} preview=${im0.content_base64.slice(0, 32)}...`)
    } else {
      console.warn(`[EL] ⚠️ images[0] MISSING/EMPTY (images.length=${body?.images?.length ?? 0}) — dispatch will be text-only!`, new Error('stack').stack?.split('\n')[2])
    }
  }
  const res = await fetch(`${FLOWS_BASE}/${kind}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = { raw: text } }
  if (!res.ok) {
    const msg = data?.detail?.message || data?.detail?.[0]?.msg || data?.error?.message || text.slice(0, 300)
    throw new Error(`ElevenLabs API ${res.status}: ${msg}`)
  }
  return data
}

async function flowsGet(kind, id) {
  const res = await fetch(`${FLOWS_BASE}/${kind}/${id}`)
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = { raw: text } }
  if (!res.ok) {
    const msg = data?.detail?.message || data?.error?.message || text.slice(0, 300)
    throw new Error(`ElevenLabs API ${res.status}: ${msg}`)
  }
  return data
}

// ── Polling primitives ───────────────────────────────────────────────────────
// Both flows kinds share the same terminal shape: pending|generating → in-flight;
// completed → content_url; failed → error_message (not charged).
async function pollGenerations(kind, jobIds, total, onProgress, onPartialResults, isCancelled, onResult) {
  const pending = new Set(jobIds)
  const urls = []

  for (let round = 0; round < 270 && pending.size > 0 && urls.length < total; round++) {
    if (isCancelled?.()) throw new Error('CANCELLED')
    if (round > 0) await new Promise(r => setTimeout(r, 3000))
    if (isCancelled?.()) throw new Error('CANCELLED')

    for (const id of [...pending]) {
      if (isCancelled?.()) throw new Error('CANCELLED')
      try {
        const data = await flowsGet(kind, id)
        const status = (data?.status || '').toLowerCase()

        if (status === 'completed' && data?.content_url) {
          pending.delete(id)
          // Persist to server disk immediately — signed CDN URLs expire;
          // state/*.json only ever sees permanent /media/ endpoints
          const localUrl = await cacheMediaLocal(data.content_url)
          if (!urls.includes(localUrl)) {
            urls.push(localUrl)
            onResult?.(localUrl)
            onProgress?.(Math.min(22 + (urls.length / total) * 73, 95))
            onPartialResults?.(urls.slice(0, total))
          }
        } else if (status === 'failed') {
          pending.delete(id)
          console.warn(`[EL] generation ${id} failed:`, data?.failure_reason, data?.error_message)
        }
      } catch (e) {
        if (e.message === 'CANCELLED') throw e
        console.warn(`[EL] poll error:`, id, e.message)
      }
    }
  }

  return urls
}

// Cache a signed CDN content_url to local disk (media/) and return the permanent
// local URL. Falls back to the remote URL if the cache endpoint is unreachable —
// persistence is best-effort at this layer, never a hard failure.
async function cacheMediaLocal(url) {
  if (!url || !/^https?:/.test(url)) return url // already local (data:, /media/)
  try {
    const r = await fetch('/api/media/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
    if (r.ok) {
      const d = await r.json()
      if (d.localUrl) return d.localUrl
    }
  } catch (e) {
    console.warn('[EL] media cache failed, using remote URL:', e.message)
  }
  return url
}

// HF-compatible signature: pollAllJobs(jobIds, total, onProgress, _staleTolerance, isCancelled, onPartialResults)
export async function pollAllJobs(jobIds, total, onProgress, _staleTolerance = 8, isCancelled = null, onPartialResults = null) {
  // Legacy Higgsfield job ids won't exist on ElevenLabs — poll errors are caught
  // per-id and the loop expires, so stale resume entries fail gracefully.
  const urls = await pollGenerations('image', jobIds, total, onProgress, onPartialResults, isCancelled)
  if (urls.length > 0) { onProgress?.(100); return urls.slice(0, total) }
  if (jobIds.length === 0) throw new Error('No job IDs to poll')
  throw new Error('Generation timed out — no results from ElevenLabs')
}

// ── Video generation (Veo 3.1) ───────────────────────────────────────────────
export async function generateVideo({
  prompt,
  aspectRatio = '9:16',
  duration = 8,
  count = 1,
  referenceImages = [],
  audioRef = null,
  startFrameUrl = null,
  model = 'seedance_2_0',
  resolution = '1080p',
  onProgress,
  onPartialResults,
  isCancelled,
  pendingKey = null,
}) {
  onProgress?.(5)

  const modelId = VIDEO_MODEL_MAP[model] || DEFAULT_VIDEO_MODEL
  const isVeo = modelId.startsWith('veo-')
  const aspect = isVeo
    ? (['9:16', '3:4', '1:1'].includes(aspectRatio) ? '9:16' : '16:9')
    : aspectRatio
  const imgSrcs = (startFrameUrl ? [startFrameUrl, ...referenceImages] : referenceImages).filter(Boolean)
  const converted = await convertImages(imgSrcs)
  onProgress?.(20)

  const res = isVeo
    ? (VEO_RESOLUTIONS.has(resolution) ? resolution : (resolution?.toLowerCase() === '4k' ? '4K' : '1080p'))
    : (resolution || '1080p')
  const durationSecs = isVeo
    ? snapDuration(Math.round(duration), converted.length > 0)
    : Math.min(10, Math.max(4, Math.round(duration)))

  const body = {
    model_id: modelId,
    prompt,
    aspect_ratio: aspect,
    resolution: res,
    duration_secs: durationSecs,
    generate_audio: true,
  }
  if (isVeo) {
    // API ceiling: Veo accepts at most 3 images (422: "List should have at
    // most 3 items"). Priority is fixed by buildRefs ordering: [0] mainImage
    // (subject, mandatory) → [1] wardrobe (reference) → [2] sheet/product
    // (reference). Everything beyond index 2 is dropped.
    const MAX_VEO_REFS = 3
    if (converted.length > MAX_VEO_REFS) {
      console.warn(`[EL] Veo ref clamp: dropping ${converted.length - MAX_VEO_REFS} ref(s) beyond the 3-item API ceiling`)
    }
    body.images = converted.slice(0, MAX_VEO_REFS).map((image, i) =>
      i === 0 ? { image, role: 'subject' } : { image, role: 'reference' })
  } else if (converted.length) {
    body.images = converted.slice(0, 9)
  }

  onProgress?.(28)

  if (audioRef && !isVeo) {
    try {
      const audio = await toInlineAudio(audioRef)
      if (audio) body.audios = [audio]
    } catch (e) {
      console.warn('[EL] audio ref skipped:', e.message)
    }
  } else if (audioRef && isVeo) {
    console.warn('[EL] audioRef not supported by Veo models — dialogue is carried in the prompt text')
  }

  const ids = []
  for (let i = 0; i < count; i++) {
    const data = await flowsPost('video', body)
    if (!data?.id) throw new Error(`No generation id returned: ${JSON.stringify(data).slice(0, 300)}`)
    ids.push(data.id)
    ellog(`launched ${data.id} (${i + 1}/${count})`)
  }
  onProgress?.(35)

  if (pendingKey) savePendingVideo(pendingKey, ids, count)
  try {
    const result = await pollVideoJobs(ids, count, onProgress, onPartialResults, isCancelled)
    onProgress?.(100)
    if (pendingKey) clearPendingVideo(pendingKey)
    return result
  } catch (e) {
    if (pendingKey && e.message !== 'CANCELLED') clearPendingVideo(pendingKey)
    throw e
  }
}

export async function pollVideoJobs(jobIds, total, onProgress, onPartialResults, isCancelled) {
  const urls = await pollGenerations('video', jobIds, total,
    (p) => onProgress?.(Math.min(35 + (p / 100) * 60, 95)), onPartialResults, isCancelled)
  if (urls.length > 0) return { urls: urls.slice(0, total), shareUrls: [] }
  if (jobIds.length && urls.length === 0 && jobIds.every(() => true)) {
    // distinguish total failure vs timeout handled inside pollGenerations by exhaustion
  }
  if (urls.length > 0) return { urls: urls.slice(0, total), shareUrls: [] }
  throw new Error('Video generation failed — no completed outputs from ElevenLabs')
}

export async function resumeVideoJob(jobIds, count, onProgress, onPartialResults, isCancelled) {
  return pollVideoJobs(jobIds, count, onProgress, onPartialResults, isCancelled)
}

// ── Image generation (gpt-image-2 / Gemini image models) ─────────────────────
function imageBody({ prompt, aspectRatio = '9:16', resolution = '4k', model = 'soul_2', images = [] }) {
  const modelId = IMAGE_MODEL_MAP[model] || DEFAULT_IMAGE_MODEL
  const aspect = IMAGE_ASPECTS.has(aspectRatio) ? aspectRatio : '9:16'
  const body = {
    model_id: modelId,
    prompt,
    aspect_ratio: aspect,
    resolution: IMAGE_RESOLUTION_MAP[String(resolution).toLowerCase()] || '2K',
  }
  // `quality` is a GPT-image-only parameter — Gemini variants reject it
  if (!GEMINI_IMAGE_MODELS.has(modelId)) body.quality = 'high'
  if (images.length) body.images = images.slice(0, 14)
  return body
}

// Single image — HF-compatible contract.
// ({prompt, aspectRatio, resolution, referenceImage, outfitImage, onProgress,
//   pendingKey: {influencerId, slot}, onJobIds, isCancelled}) → url | null
export async function generateSingleImage({ prompt, aspectRatio = '16:9', resolution = '4k', referenceImage = null, outfitImage = null, onProgress, pendingKey = null, onJobIds = null, isCancelled = null }) {
  onProgress?.(5)
  const safeOutfit = await cropHeadFromRef(outfitImage) // strips placeholder-model head from uploaded outfit refs
  const images = await convertImages([referenceImage, safeOutfit])
  onProgress?.(15)

  const body = imageBody({ prompt, aspectRatio, resolution, images })
  onProgress?.(20)
  const data = await flowsPost('image', body)
  if (!data?.id) throw new Error(`No generation id returned: ${JSON.stringify(data).slice(0, 300)}`)
  const jobIds = [data.id]

  if (pendingKey) savePendingGen(pendingKey.influencerId, pendingKey.slot, jobIds)
  onJobIds?.(jobIds)
  try {
    const urls = await pollGenerations('image', jobIds, 1, onProgress, null, isCancelled)
    onProgress?.(100)
    return urls[0] ?? null
  } finally {
    if (pendingKey) clearPendingGen(pendingKey.influencerId, pendingKey.slot)
  }
}

// ── Face/style instruction composition (ported from HF module, sanitized for ──
//    ElevenLabs: @image1/@image2 tokens are dead syntax gpt-image-2 cannot parse —
//    replaced with ordered concrete anchors ("first reference image") matching the
//    images[] payload order, plus physicalDesc reinforcement for identity lock)
function buildFaceInstruction(faceNote, hasDesc) {
  if (faceNote)
    return `The first reference image: use specifically "${faceNote}" from it.${hasDesc ? ' Use the text description for all other identity attributes.' : ''}`
  return hasDesc
    ? `The first reference image is a facial geometry reference — match the face proportions (eye spacing, jaw width, nose bridge, face shape) but defer to the text description for skin tone, hair, eye color, and identity. Ignore its clothing, background, and lighting.`
    : `The first reference image is the appearance reference — faithfully recreate this person's face, skin tone, hair, eye color, and overall look exactly as shown.`
}

function buildStyleInstruction(styleNote) {
  if (styleNote)
    return `The second reference image: use specifically "${styleNote}" from it. Do not copy the face or identity of any person in it.`
  return `The second reference image is a visual style reference — do NOT copy the face or identity of any person in it. Match the pose and body positioning, outfit aesthetic (silhouette, layering, fabric, styling), color palette, scene and background, lighting mood, and overall photographic vibe.`
}

function applyStyleNoteOverrides(prompts, styleNote, styleImg) {
  if (!styleNote) return prompts
  const note = styleNote.toLowerCase()

  const wantsPose  = /\bpose\b|posing/.test(note)
  const wantsScene = /alley|location|scene|background|setting|café|cafe|park|rooftop|studio|hallway|corridor|street|outdoor|indoor|beach|forest|city|room|bar|restaurant|environment/.test(note)

  if (!wantsPose && !wantsScene) return prompts

  return prompts.map(p => {
    if (wantsPose)
      p = p.replace(
        /(\n\nPose: )[\s\S]+?(\n\nWardrobe & details:)/,
        `$1Follow ${styleImg} for the pose and body positioning.$2`
      )
    if (wantsScene) {
      p = p.replace(
        /(\n\nScene: )[\s\S]+?(\n\nSubject:)/,
        `$1Follow ${styleImg} for the location, background, and setting.$2`
      )
      p = p.replace(
        /(\n\nLighting: )[\s\S]+?(\n\nCamera & capture:)/,
        `$1Follow ${styleImg} for the lighting conditions and mood.$2`
      )
    }
    return p
  })
}

// Three images (character turnarounds) — HF-compatible contract.
// ({prompts, aspectRatio, model, faceRef, styleRef, physicalDesc, faceRefNote,
//   styleRefNote, onProgress, onPartialResults}) → urls[]
export async function generateThreeImages({ prompts, aspectRatio = '9:16', model = 'gpt_image_2', faceRef = null, styleRef = null, physicalDesc = '', faceRefNote = '', styleRefNote = '', onProgress, onPartialResults }) {
  onProgress?.(5)

  const refs = await convertImages([faceRef, styleRef])
  onProgress?.(15)

  const hasDesc = !!(physicalDesc?.trim())
  const faceNote = faceRefNote?.trim()
  const styleNote = styleRefNote?.trim()

  let refInstruction = ''
  if (faceRef && styleRef) {
    refInstruction = ` ${buildFaceInstruction(faceNote, hasDesc)} ${buildStyleInstruction(styleNote)}`
  } else if (faceRef) {
    refInstruction = ` ${buildFaceInstruction(faceNote, hasDesc)}`
  } else if (styleRef) {
    refInstruction = ` ${buildStyleInstruction(styleNote)} The subject's face and identity come entirely from the text description above.`
  }

  const finalPrompts = styleRef ? applyStyleNoteOverrides(prompts, styleNote, 'the second reference image') : prompts

  const body = imageBody({ prompt: '', aspectRatio, model, images: refs })

  // Stateless REST — launch all three in parallel
  const launches = await Promise.all(finalPrompts.map(async p => {
    const data = await flowsPost('image', { ...body, prompt: p + refInstruction })
    return data?.id
  }))
  onProgress?.(22)
  const jobIds = launches.filter(Boolean)
  if (!jobIds.length) throw new Error('No generation ids returned from ElevenLabs')

  const urls = await pollGenerations('image', jobIds, finalPrompts.length, onProgress, onPartialResults, null)

  if (urls.length === 0) throw new Error('No images were generated — try regenerating')
  if (urls.length < finalPrompts.length) {
    console.warn(`[EL] got ${urls.length}/${finalPrompts.length} — returning partial results`)
  }
  onProgress?.(100)
  return urls.slice(0, prompts.length)
}

// ── Photo Studio batch generation — HF-compatible contract ───────────────────
// ({prompt|prompts, count, aspectRatio, resolution, referenceImage, outfitImage,
//   closeUpImage1, closeUpImage2, propImages, onProgress, onResult, isCancelled,
//   pendingKey: influencerId})
export async function generateNImages({ prompt, count = 1, aspectRatio = '9:16', resolution = '4k', referenceImage = null, outfitImage = null, closeUpImage1 = null, closeUpImage2 = null, propImages = [], onProgress, onResult, isCancelled, pendingKey = null }) {
  onProgress?.(5)

  // De-head uploaded outfit/prop refs (data: URLs) to prevent multi-face
  // attention blending; hosted/generated refs (Gavin's own cards) pass untouched
  const [safeOutfit, ...safeProps] = await Promise.all([
    cropHeadFromRef(outfitImage),
    ...propImages.map(p => cropHeadFromRef(p)),
  ])
  const refSrcs = [
    referenceImage, safeOutfit, closeUpImage1, closeUpImage2, ...safeProps,
  ].filter(Boolean)
  const images = await convertImages(refSrcs)
  onProgress?.(18)

  const body = imageBody({ prompt: '', aspectRatio, resolution, images })
  const prompts = Array.isArray(prompt) ? prompt : Array.from({ length: count }, () => prompt)

  // Stateless REST — launch all in parallel (no shared-session conflicts)
  const launches = await Promise.all(prompts.map(async p => {
    const data = await flowsPost('image', { ...body, prompt: p })
    return data?.id
  }))
  onProgress?.(22)
  const jobIds = launches.filter(Boolean)
  if (!jobIds.length) throw new Error('No generation ids returned from ElevenLabs')

  if (pendingKey) { markPhotoGenSession(); savePendingPhoto(pendingKey, jobIds) }

  let delivered = 0
  const urls = await pollGenerations('image', jobIds, count, onProgress, null, isCancelled,
    url => { delivered++; onResult?.(url) })

  if (delivered > 0 || urls.length > 0) { onProgress?.(100); return }
  throw new Error('Generation timed out — no results from ElevenLabs')
}

// ── Pose preview generation (ported prompt data verbatim from HF module) ─────
const POSE_PREVIEW_DESCS_STANDING = {
  plandid:         'Body angled 25–30 degrees to the camera, weight shifted to back leg, eyes glancing slightly off to the side — relaxed and candid, caught half a second before noticing the camera.',
  candid:          'Mid-laugh at the apex — eyes lit up with genuine joy, head tilted slightly back, one hand raised naturally toward the mouth or chest, body animated and relaxed.',
  'cute-posed':    'Three-quarter turn toward camera, soft warm smile, one hand gently raised near the face or lightly touching the hair, shoulders relaxed and easy, chin slightly tilted down — approachable and poised.',
  walking:         'Mid-stride, weight naturally transferring from one foot to the other, arms swinging relaxed, hair slightly lifted from movement, gaze forward with calm confidence.',
  'mid-turn':      'Body turned 45 degrees away from camera, head turning back over the shoulder with a soft beginning smile, hair sweeping slightly from the turn — caught in the middle of the motion.',
  front:           'Body and head squared directly to the lens, weight shifted onto one hip with the opposite knee slightly bent, arms relaxed at sides, confident direct gaze straight into the camera.',
  'hip-pop':       'Standing, weight fully on one straight leg, the other knee bent causing the hip to drop on that side. One hand on the lower hip, fingers forward, elbow back. A visible gap of air between both arms and the torso. Full body head to toe.',
  triangle:        'Standing at 45 degrees to camera. Near arm raised to hip — elbow bent at 90 degrees, hand resting on hip bone, fingers forward, elbow back — creating a clear triangular gap between arm and body. Far arm relaxed. Gaze slightly downward.',
  'over-shoulder': 'Body turned 50 to 60 degrees away from the camera. Head rotated back over the near shoulder toward the lens — expression of soft surprise, lips gently parted. One hand near the back of the hair, the other mid-swing.',
  'long-line':     'Posture erect from crown to feet. Back foot carries all weight, front leg extended toward camera with knee slightly bent and foot pointed toward the lens. Hips shifted toward the standing leg. Back shoulder dropped down, creating a diagonal from front foot through dropped shoulder. Fingers fully relaxed.',
  'hands-pockets': 'Standing at 30 to 45 degrees to camera. Thumbs hooked into front pockets, shoulders dropped, back leg bearing slightly more weight. Head turned toward camera, chin slightly down and forward.',
  'crossed-arms':  'Standing at 30 degrees to camera. Arms crossed, right forearm resting over left, hands relaxed and not gripping. Elbows at mid-chest height. Chin slightly down and forward, jaw defined. Gaze direct and settled.',
  lean:            'One shoulder resting against a wall or door frame. Body at 60 to 70 degrees to camera, weight fully on wall-side shoulder. Near knee slightly bent, far leg crossed loosely at the ankle. Chin slightly down, gaze direct or into distance.',
}

export async function generatePosePreviews(influencer, onPoseComplete, { stance = 'standing' } = {}) {
  try {
    const gender = influencer.gender === 'Male' ? 'man' : 'woman'
    const physDesc = (influencer.physicalDesc || '').trim()
    const subjectLine = physDesc ? `${gender}, ${physDesc}` : gender
    const POSE_IDS = Object.keys(POSE_PREVIEW_DESCS_STANDING)
    const stancePrefix = stance

    // Convert identity refs once, reuse across all poses
    const refSrcs = [influencer.mainImage, influencer.characterSheetImage].filter(Boolean)
    const images = await convertImages(refSrcs)

    for (const poseId of POSE_IDS) {
      const stancedId = `${stancePrefix}_${poseId}`
      try {
        let prompt
        if (stance === 'sitting') {
          const standingUrl = influencer.posePreviews?.[`standing_${poseId}`] || influencer.posePreviews?.[poseId]
          const poseDesc = POSE_PREVIEW_DESCS_STANDING[poseId]
          prompt = `${subjectLine}. Pure white seamless studio backdrop. Clean flat even studio lighting, no shadows on background. The subject is seated on a white stool or low chair, chest-up framing, closer to camera. Same pose energy as: ${poseDesc} — adapted to a seated position. Photorealistic, 4K.`
          if (standingUrl) prompt += ` Reference for the seated adaptation: ${standingUrl}`
        } else {
          const poseDesc = POSE_PREVIEW_DESCS_STANDING[poseId]
          prompt = `${subjectLine}. Pure white seamless studio backdrop. Clean flat even studio lighting, no shadows on background, no lighting equipment visible. Full body visible head to toe, standing. ${poseDesc} Photorealistic, 4K.`
        }
        const body = imageBody({ prompt, aspectRatio: '9:16', resolution: '2k', images })
        const data = await flowsPost('image', body)
        if (!data?.id) continue
        // Poll this pose in the background; deliver as each completes
        pollGenerations('image', [data.id], 1, null, null, null, url => onPoseComplete(stancedId, url))
          .catch(e => console.warn(`[EL] pose preview poll failed (${stancedId}):`, e.message))
      } catch (e) {
        console.warn(`[EL] pose preview launch failed (${stancedId}):`, e.message)
      }
    }
  } catch (e) {
    console.warn('[EL] generatePosePreviews failed:', e.message)
  }
}
