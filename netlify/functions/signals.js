// Netlify Serverless Function: persistent backend signal feed
// Endpoint: GET /api/signals

export const handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json', Allow: 'GET' },
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    }
  }

  const backendUrl = process.env.BACKEND_API_URL?.replace(/\/+$/, '')
  if (!backendUrl) {
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ error: 'Signal backend is not configured.' }),
    }
  }

  try {
    const authorization = Object.entries(event.headers || {}).find(
      ([name]) => name.toLowerCase() === 'authorization'
    )?.[1]
    const response = await fetch(`${backendUrl}/api/signals`, {
      headers: authorization ? { Authorization: authorization } : {},
    })

    return {
      statusCode: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/json',
        'Cache-Control': 'no-store',
      },
      body: await response.text(),
    }
  } catch {
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ error: 'Signal backend is unavailable.' }),
    }
  }
}

