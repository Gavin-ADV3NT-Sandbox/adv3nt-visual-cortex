#!/usr/bin/env node
// test-bridge.js — Proof of concept: read a saved profile from state/ and build a generation-ready prompt

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STATE_DIR = path.join(__dirname, 'state')

function loadProfile(id) {
  const filePath = path.join(STATE_DIR, `${id}.json`)
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Profile not found: ${id}`)
    console.log(`\nAvailable profiles:`)
    const files = fs.readdirSync(STATE_DIR).filter(f => f.endsWith('.json'))
    if (files.length === 0) console.log('  (none — save a profile from the UI first)')
    files.forEach(f => console.log(`  - ${f.replace('.json', '')}`))
    process.exit(1)
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}

function buildBondPrompt(inf) {
  const { name, physicalDesc, clothingStyle, backstory, niche, introExtrovert, wardrobeSlots, vibeWords } = inf

  const vibe = Array.isArray(vibeWords) && vibeWords.length ? vibeWords.join(', ') : (clothingStyle || 'Street')
  const wardrobe = Array.isArray(wardrobeSlots) && wardrobeSlots.length
    ? wardrobeSlots.map(w => w.name).join(', ')
    : (clothingStyle || 'casual streetwear')

  const personality = typeof introExtrovert === 'number'
    ? (introExtrovert > 65 ? 'extroverted, high-energy' : introExtrovert < 35 ? 'introverted, mysterious' : 'balanced, approachable')
    : 'balanced'

  return `
╔══════════════════════════════════════════════════════════════════╗
║  ADV3NT VISUAL CORTEX — BOND-STYLE GENERATION PROMPT              ║
╚══════════════════════════════════════════════════════════════════╝

👤 AGENT PROFILE: ${name || 'Unknown'}
═══════════════════════════════════════════════════════════════════

Physical Description:
  ${physicalDesc || 'Not specified'}

Wardrobe Arsenal:
  ${wardrobe}

Vibe Words:
  ${vibe}

Personality Profile:
  ${personality} (${introExtrovert || '?'}/100 intro-extrovert)

Niche:
  ${niche || 'General'}

Backstory:
  ${backstory || 'Not specified'}

═══════════════════════════════════════════════════════════════════

🎯 READY-TO-GENERATE PROMPT:

Candid iPhone photo of ${name || 'the subject'}, ${physicalDesc || 'as described'}, wearing ${wardrobe}. ${personality} energy — caught mid-action, not posing. Natural found light, real location, zero professional setup. Shot on iPhone 15 Pro, 24mm lens. Photorealistic, no retouching. 9:16 vertical.

═══════════════════════════════════════════════════════════════════

✅ Profile successfully ingested. Agent ${name || 'Unknown'} is ready for autonomous generation.
`
}

// Main
const args = process.argv.slice(2)
const profileId = args[0]

if (!profileId) {
  console.log('\nUsage: node test-bridge.js [profile-id]\n')
  console.log('Available profiles:')
  try {
    const files = fs.readdirSync(STATE_DIR).filter(f => f.endsWith('.json'))
    if (files.length === 0) console.log('  (none — save a profile from the UI first)')
    files.forEach(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(STATE_DIR, f), 'utf-8'))
        console.log(`  ${f.replace('.json', '')} → ${data.name || 'Unnamed'} (${data.physicalDesc?.slice(0, 40) || 'no desc'})`)
      } catch {
        console.log(`  ${f.replace('.json', '')} → (parse error)`)
      }
    })
  } catch { console.log('  (state directory does not exist yet)') }
  process.exit(0)
}

console.log('\n🔍 Loading profile from state directory...')
const profile = loadProfile(profileId)
console.log(`✅ Profile loaded: ${profile.name || profileId}`)
console.log(buildBondPrompt(profile))
