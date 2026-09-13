// server/prompts/index.js
// Bridge: allows server-side Node.js to use the ES module prompt builders
// This reads the original source files and makes their exports available as CommonJS

const fs = require('fs')
const path = require('path')
const Module = require('module')

/**
 * Load an ES module file as if it were CommonJS.
 * Strips `export` keywords and appends `module.exports = { ... }`.
 */
function loadESMAsCJS(filePath) {
  const source = fs.readFileSync(filePath, 'utf-8')

  // Collect exported names before transforming
  const funcNames = [...source.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].map(m => m[1])
  const constNames = [...source.matchAll(/export\s+const\s+(\w+)/g)].map(m => m[1])
  const exportNames = [...funcNames, ...constNames]

  // Transform ESM syntax to CJS
  let transformed = source
    .replace(/export\s+async\s+function\s+(\w+)/g, 'async function $1')
    .replace(/export\s+function\s+(\w+)/g, 'function $1')
    .replace(/export\s+const\s+(\w+)/g, 'const $1')
    .replace(/export\s+\{[^}]+\}\s*;?/g, '')

  // Append module.exports with all collected names
  if (exportNames.length) {
    transformed += '\nmodule.exports = { ' + exportNames.join(', ') + ' }\n'
  }

  const mod = new Module(filePath, module)
  mod.paths = Module._nodeModulePaths(path.dirname(filePath))
  mod.filename = filePath
  mod._compile(transformed, filePath)
  return mod.exports
}

// ── Resolve source paths ──────────────────────────────────────
const SRC_UTILS = path.join(__dirname, '..', '..', 'src', 'utils')

const systemPromptPath = path.join(SRC_UTILS, 'systemPrompt.js')
const photoStudioPath  = path.join(SRC_UTILS, 'photoStudioPrompt.js')
const charSheetPath    = path.join(SRC_UTILS, 'charSheetPrompt.js')

// ── Load modules ──────────────────────────────────────────────
const systemPrompt  = loadESMAsCJS(systemPromptPath)
const photoStudio   = loadESMAsCJS(photoStudioPath)
const charSheet     = loadESMAsCJS(charSheetPath)

// ── Inline prompt builders from Influencers.jsx ───────────────

/**
 * Close-up studio headshot prompt.
 * Ported from src/pages/Influencers.jsx → buildCloseUpPrompt()
 */
function buildCloseUpPrompt(inf) {
  const phys = inf.physicalDesc ? `The subject: ${inf.physicalDesc}. ` : ''
  return `Professional studio headshot. Subject facing directly forward, eyes looking straight into the camera lens. Framed from shoulders up — head, neck, and upper chest visible. Clean seamless pure white backdrop, soft gradient toward very light grey at edges, no texture, no cast shadows on background.

${phys}Soft diffused studio lighting: two large softboxes at 45-degree angles producing soft, even, shadow-free illumination across the face. Subtle catchlights visible in both eyes. No harsh under-nose or chin shadows. Skin tone reproduced accurately — natural pore texture, subtle imperfections visible, zero retouching.

Replicate every physical detail from the reference image exactly: facial bone structure, unique facial features and natural asymmetries, precise skin tone, freckles, moles, iris color and detail, eyebrow shape, lip shape, hair color, texture and natural fall. The subject must be unmistakably the same individual.

Subject standing straight, head completely level, facing dead-on into the camera — no tilt, no turn, no pose. Eyes looking directly into the lens. Neutral expression, mouth relaxed and closed. No modelling, no attitude, no special pose whatsoever. Identical to a casting reference or identity card photo.

Shot on Phase One IQ4 150MP, 85mm portrait lens, f/2.8, studio strobe. Photorealistic, ultra-sharp facial detail, RAW photograph quality. Studio identity reference portrait.`
}

/**
 * Character turnaround sheet prompt.
 * Ported from src/pages/Influencers.jsx → buildCharacterSheetPrompt()
 */
function buildCharacterSheetPrompt(inf) {
  const phys = inf.physicalDesc ? `The character: ${inf.physicalDesc}. ` : ''
  const style = inf.clothingStyle ? `Outfit: ${inf.clothingStyle}. ` : ''
  return `Professional full-body character turnaround sheet. Pure white background, no background elements whatsoever. Soft neutral studio lighting, perfectly flat and even across all four panels — no shadows, no color cast, no vignette.

${phys}${style}

Single row of four equally sized full-body shots from head to toe, each with a small label in clean sans-serif capitals printed above the figure:
Panel 1 — "FRONT VIEW": character facing directly forward, arms relaxed at sides, feet together.
Panel 2 — "SIDE VIEW": character in perfect left profile, arms at sides.
Panel 3 — "BACK VIEW": character facing directly away, arms relaxed.
Panel 4 — "THREE-QUARTER VIEW": character at 45-degree angle facing forward-right.

Replicate every single physical detail identically across all four panels: exact facial structure and bone structure, unique facial features and natural asymmetries, precise skin tone, real pore texture, natural blemishes, freckles, moles, birthmarks, natural moisture and skin sheen, realistic catchlights in the eyes, exact iris color and detail, exact hair color and texture and styling. Zero beauty retouching — raw skin imperfections must be visible. Same outfit, same proportions, same scale in every panel.

Shot on Hasselblad X2D 100C, photorealistic, ultra-sharp micro detail, RAW photograph quality. Character design sheet, model sheet, orthographic turnaround reference.`
}

// ── Exports ───────────────────────────────────────────────────
module.exports = {
  // From systemPrompt.js
  ...systemPrompt,

  // From photoStudioPrompt.js
  ...photoStudio,

  // From charSheetPrompt.js (buildInfluencerSheetPrompt etc.)
  ...charSheet,

  // Inline ports from Influencers.jsx
  buildCloseUpPrompt,
  buildCharacterSheetPrompt,
}
