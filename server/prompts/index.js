// server/prompts/index.js
// ESM entry — delegates to bridge.cjs which does the ESM→CJS transformation
import { createRequire } from 'module'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

const bridge = require('./bridge.cjs')

export default bridge
export const {
  // systemPrompt.js
  getBackstoryContext,
  HIGGSFIELD_SYSTEM,
  buildPromptInput,
  buildDirectPrompt,
  buildThreeVariationPrompts,
  // photoStudioPrompt.js
  LOCATIONS,
  TIMES,
  POSES_FEMALE_STANDING,
  POSES_MALE_STANDING,
  POSES,
  getPoses,
  VIBES,
  EXPRESSIONS,
  PROP_SUGGESTIONS,
  ASPECTS,
  OUTFIT_PRESETS_FEMALE,
  OUTFIT_PRESETS_MALE,
  OUTFIT_PRESETS,
  getOutfitPresets,
  getOutfitPrompt,
  buildPhotoStudioPrompt,
  randomParams,
  // charSheetPrompt.js
  buildInfluencerSheetPrompt,
  buildCharSheetPrompt,
  buildCharSheetPromptWithClaude,
  // Inline ports from Influencers.jsx
  buildCloseUpPrompt,
  buildCharacterSheetPrompt,
} = bridge
