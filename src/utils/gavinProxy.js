// gavinProxy.js — General-purpose wrapper for OpenClaw Gateway calls from the browser

const GAVIN_MODEL = 'zai/glm-5'

/**
 * Send a chat completion request to the Gavin (OpenClaw Gateway) proxy
 * @param {string} systemPrompt - System message
 * @param {string} userMessage - User message
 * @param {object} opts - { maxTokens, temperature, model }
 * @returns {Promise<string>} - The assistant's response text
 */
export async function askGavin(systemPrompt, userMessage, opts = {}) {
  const { maxTokens = 1000, temperature = 0.7, model = GAVIN_MODEL } = opts

  const res = await fetch('/api/gavin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: maxTokens,
      temperature,
    }),
  })

  if (!res.ok) {
    const err = await res.text().catch(() => 'Unknown error')
    throw new Error(`Gavin proxy error (${res.status}): ${err}`)
  }

  const data = await res.json()
  return data.choices?.[0]?.message?.content || ''
}
