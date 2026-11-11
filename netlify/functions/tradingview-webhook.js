// Netlify Serverless Function: forward TradingView alerts to the durable API
// Endpoint: POST /api/webhooks/tradingview (via netlify.toml redirect)

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json', Allow: 'POST' },
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    }
  }

  const backendUrl = process.env.BACKEND_API_URL?.replace(/\/+$/, '')
  if (!backendUrl) {
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Signal backend is not configured.' }),
    }
  }

  try {
    const secretHeader = Object.entries(event.headers || {}).find(
      ([name]) => name.toLowerCase() === 'x-sf-webhook-secret'
    )?.[1]
    const body = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64').toString('utf8')
      : event.body || '{}'
    JSON.parse(body)

    const response = await fetch(`${backendUrl}/api/webhooks/tradingview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(secretHeader ? { 'X-SF-Webhook-Secret': secretHeader } : {}),
      },
      body,
    })

    return {
      statusCode: response.status,
      headers: { 'Content-Type': response.headers.get('content-type') || 'application/json' },
      body: await response.text(),
    }
  } catch (error) {
    return {
      statusCode: error instanceof SyntaxError ? 400 : 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: error instanceof SyntaxError ? 'Malformed JSON payload.' : 'Signal backend is unavailable.',
      }),
    }
  }
}

