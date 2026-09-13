// Gavin.js — ADV3NT Engine (OpenClaw Gateway, GLM-5) prompt builders
// Active prompt pipeline for backstoryAnalysis and charSheetPrompt flows

import { buildCharSheetPrompt } from './charSheetPrompt.js'

const GAVIN_MODEL = 'zai/glm-5'

/**
 * Analyze backstory — replaces analyzeBackstory() from backstoryAnalysis.js
 * Returns { sceneNiche, tags[] } or null
 */
export async function analyzeBackstory(backstory, physicalDesc) {
  if (!backstory?.trim()) return null

  const system = `You are a visual prompt assistant for an AI influencer image generator.
Given a character's backstory and physical description, extract two things:

1. styleSignal — a comma-separated list of 2–4 wardrobe style tags from this fixed set ONLY: minimalist, editorial, street, bohemian, glam, sport, y2k, dark, clean, cottagecore, old-money, coastal, preppy, casual, earthy, natural, functional, polished, structured, bold. Pick tags that reflect the person's authentic daily life, not their aspirations.

2. sceneNiche — one word from: fashion, beauty, lifestyle, fitness, travel, tech, gaming, entertainment. Pick the one that best matches where this person actually spends their time.

Respond with a JSON object only — no explanation, no markdown:
{"styleSignal":"tag1, tag2","sceneNiche":"lifestyle"}`

  try {
    const res = await fetch('/api/gavin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: GAVIN_MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: `Backstory: ${backstory.trim()}\nPhysical description: ${physicalDesc?.trim() || 'not specified'}` },
        ],
        max_tokens: 150,
        temperature: 0.3,
      }),
    })

    if (!res.ok) { console.error('[Gavin] analyzeBackstory HTTP error', res.status); return null }
    const data = await res.json()
    const text = data.choices?.[0]?.message?.content?.trim()
    if (!text) return null

    const jsonText = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
    const parsed = JSON.parse(jsonText)
    if (!parsed.sceneNiche) return null

    return {
      sceneNiche: parsed.sceneNiche,
      tags: (parsed.styleSignal || '').split(',').map(s => s.trim()).filter(Boolean),
    }
  } catch (e) {
    console.error('[Gavin] analyzeBackstory exception:', e)
    return null
  }
}

/**
 * Build character sheet prompt with AI analysis — ADV3NT Engine powered
 * Returns a refined prompt string
 */
export async function buildCharSheetPromptWithGavin(images, brand, category) {
  // Note: GLM-5 handles text + image via the Gateway, but for KISS we use text-only analysis
  // The image analysis is handled separately; here we generate the prompt based on brand/category info

  const system = `You are a luxury product expert and photography director. You have deep knowledge of designer brands, product lines, and how they look from every angle. Output JSON only — nothing else.`

  const userPrompt = `Brand: ${brand}${category ? `\nCategory: ${category}` : ''}

Based on your expertise, describe this product type in detail for a character sheet photo shoot.

Output a JSON object with exactly two fields:

"productDesc" — a precise, complete description covering the entire product: exact colors on every surface, materials, all logos and text, construction details, hardware. Be specific and confident.

"angles" — exactly 6 panel descriptions for a professional character sheet, each with specific visual details for that angle.`

  try {
    const res = await fetch('/api/gavin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: GAVIN_MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 2000,
        temperature: 0.4,
      }),
    })

    if (!res.ok) throw new Error(`Gavin analysis failed (${res.status})`)
    const data = await res.json()
    const text = data.choices?.[0]?.message?.content?.trim()
    if (!text) throw new Error('Gavin returned empty response')

    let json = null
    const attempts = [
      () => JSON.parse(text),
      () => JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()),
      () => { const m = text.match(/\{[\s\S]*\}/); if (m) return JSON.parse(m[0]); throw new Error('no JSON found') },
    ]
    for (const attempt of attempts) {
      try { json = attempt(); break } catch {}
    }

    if (!json) throw new Error('Could not parse Gavin response as JSON')

    // Build the final prompt using the same structure as charSheetPrompt.js
    return buildCharSheetPrompt(brand, category, json.productDesc, json.angles || null)
  } catch (e) {
    console.error('[Gavin] charSheetPrompt exception:', e)
    // Fallback to basic prompt without AI analysis
    return buildCharSheetPrompt(brand, category)
  }
}
