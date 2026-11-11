// Netlify Serverless Function: TradingView Webhook Intake & Telegram Fan-Out
// Endpoint: POST /api/webhooks/tradingview (via netlify.toml redirect)

import { timingSafeEqual } from 'node:crypto'

const matchesSecret = (received, configured) => {
  if (typeof received !== 'string' || !received || received.length !== configured.length) return false
  return timingSafeEqual(Buffer.from(received), Buffer.from(configured))
}

export const handler = async (event) => {
  // Only accept POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json', 'Allow': 'POST' },
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    }
  }

  try {
    const configuredSecret = process.env.SF_WEBHOOK_SECRET
    if (!configuredSecret || configuredSecret === 'change-me') {
      return {
        statusCode: 503,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Webhook secret is not configured.' }),
      }
    }

    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64').toString('utf8')
      : event.body || '{}'
    const payload = JSON.parse(rawBody)
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Webhook payload must be a JSON object.' }),
      }
    }

    const secretHeader = Object.entries(event.headers || {}).find(
      ([name]) => name.toLowerCase() === 'x-sf-webhook-secret'
    )?.[1]
    const receivedSecret = payload.secret || secretHeader

    if (!matchesSecret(receivedSecret, configuredSecret)) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid webhook secret token' }),
      }
    }

    const pair = (payload.pair || payload.symbol || '').toUpperCase()
    const action = (payload.signal || payload.action || '').toUpperCase()

    if (!/^[A-Z0-9._:-]{3,30}$/.test(pair) || (action !== 'BUY' && action !== 'SELL')) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Pair and signal (BUY/SELL) are required.' }),
      }
    }

    const prices = ['entry', 'sl', 'tp1', 'tp2', 'tp3'].map((key) => Number(payload[key]))
    const [entry, sl, tp1, tp2, tp3] = prices
    const orderedLevels = action === 'BUY'
      ? sl < entry && entry < tp1 && tp1 < tp2 && tp2 < tp3
      : sl > entry && entry > tp1 && tp1 > tp2 && tp2 > tp3

    if (prices.some((price) => !Number.isFinite(price) || price <= 0) || !orderedLevels) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Entry, stop loss, and targets must be positive finite prices in directional order.' }),
      }
    }

    const backendUrl = process.env.BACKEND_API_URL
    if (!backendUrl) {
      return {
        statusCode: 503,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Signals backend is not configured.' }),
      }
    }

    const target = new URL('/api/webhooks/tradingview', backendUrl)
    if (!['http:', 'https:'].includes(target.protocol)) throw new Error('Unsupported backend protocol')

    const backendHeaders = { 'Content-Type': 'application/json' }
    if (secretHeader) backendHeaders['x-sf-webhook-secret'] = secretHeader
    const response = await fetch(target, {
      method: 'POST',
      headers: backendHeaders,
      body: rawBody,
    })

    return {
      statusCode: response.status,
      headers: { 'Content-Type': response.headers.get('content-type') || 'application/json' },
      body: await response.text(),
    }
  } catch (err) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message || 'Malformed payload' }),
    }
  }
}

