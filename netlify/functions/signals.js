// Netlify Serverless Function: Signals API proxy
// Endpoint: GET /api/signals

export const handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json', Allow: 'GET' },
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    }
  }

  const backendUrl = process.env.BACKEND_API_URL
  if (!backendUrl) {
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ error: 'Signals backend is not configured.' }),
    }
  }

  try {
    const target = new URL('/api/signals', backendUrl)
    if (!['http:', 'https:'].includes(target.protocol)) throw new Error('Unsupported backend protocol')

    const headers = {}
    if (event.headers?.authorization) headers.Authorization = event.headers.authorization
    const response = await fetch(target, { headers })

    return {
      statusCode: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/json',
        'Cache-Control': 'no-store',
      },
      body: await response.text(),
    }
  } catch (error) {
    console.error('Signals backend request failed:', error.message)
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ error: 'Signals backend is unavailable.' }),
    }
  }
}
