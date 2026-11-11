// Netlify Serverless Function: forward TradingView alerts to the durable API
// Endpoint: POST /api/webhooks/tradingview (via netlify.toml redirect)
import {
  decodeEventBody,
  forwardRequest,
  getBackendUrl,
  jsonResponse,
  pickHeaders,
} from '../lib/proxy.js'

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method Not Allowed' }, { Allow: 'POST' })
  }

  const backendUrl = getBackendUrl()
  if (!backendUrl) {
    return jsonResponse(503, { error: 'Signal backend is not configured.' })
  }

  const body = decodeEventBody(event) || '{}'
  let parsed
  try {
    parsed = JSON.parse(body)
  } catch {
    return jsonResponse(400, { error: 'Malformed JSON payload.' })
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return jsonResponse(400, { error: 'Webhook payload must be a JSON object.' })
  }

  const forwardedHeaders = pickHeaders(event.headers, ['x-sf-webhook-secret'])
  return forwardRequest(
    `${backendUrl}/api/webhooks/tradingview`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...forwardedHeaders,
      },
      body,
    },
    'Signal backend is unavailable.'
  )
}
