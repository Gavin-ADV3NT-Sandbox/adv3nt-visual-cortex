const ADV3NT_KEY = 'adv3nt_api_key'

const SYSTEM = `You are a visual prompt assistant for an AI influencer image generator.
Given a character's backstory and physical description, extract two things:

1. styleSignal — a comma-separated list of 2–4 wardrobe style tags from this fixed set ONLY: minimalist, editorial, street, bohemian, glam, sport, y2k, dark, clean, cottagecore, old-money, coastal, preppy, casual, earthy, natural, functional, polished, structured, bold. Pick tags that reflect the person's authentic daily life, not their aspirations.

2. sceneNiche — one word from: fashion, beauty, lifestyle, fitness, travel, tech, gaming, entertainment. Pick the one that best matches where this person actually spends their time.

Respond with a JSON object only — no explanation, no markdown:
{"styleSignal":"tag1, tag2","sceneNiche":"lifestyle"}`

export async function analyzeBackstory(backstory, physicalDesc) {
  const apiKey = localStorage.getItem(ADV3NT_KEY)
  if (!apiKey) { console.log('[ADV3NT] no API key in localStorage — skipping backstory analysis'); return null }
  if (!backstory?.trim()) { console.log('[ADV3NT] no backstory — skipping'); return null }

  console.log('[ADV3NT] analyzing backstory...')
  const userMsg = `Backstory: ${backstory.trim()}\nPhysical description: ${physicalDesc?.trim() || 'not specified'}`

  try {
    const res = await fetch('/api/gavin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        max_tokens: 150,
        system: SYSTEM,
        messages: [{ role: 'user', content: userMsg }],
      }),
    })

    if (!res.ok) {
      console.error('[ADV3NT] HTTP error', res.status, await res.text().catch(() => ''))
      return null
    }

    const data = await res.json()
    if (data.error) {
      console.error('[ADV3NT] API error:', data.error)
      return null
    }

    const text = data.content?.[0]?.text?.trim() || data.choices?.[0]?.message?.content?.trim()
    if (!text) { console.error('[ADV3NT] empty response'); return null }

    const jsonText = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
    const parsed = JSON.parse(jsonText)
    if (!parsed.sceneNiche) { console.error('[ADV3NT] missing sceneNiche in response:', parsed); return null }

    console.log('[ADV3NT] success:', parsed)
    return {
      sceneNiche: parsed.sceneNiche,
      tags: (parsed.styleSignal || '').split(',').map(s => s.trim()).filter(Boolean),
    }
  } catch (e) {
    console.error('[ADV3NT] exception:', e)
    return null
  }
}
