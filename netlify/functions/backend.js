// Proxy authenticated application APIs to the durable backend.

export const handler = async (event) => {
  const backendUrl = process.env.BACKEND_API_URL?.replace(/\/+$/, '')
  if (!backendUrl) {
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ error: 'Application backend is not configured.' }),
    }
  }

  const path = (event.path || '').replace(/^\/.netlify\/functions\/backend/, '')
  const apiPath = path.startsWith('/api/') ? path : `/api/${path.replace(/^\/+/, '')}`
  if (apiPath === '/api/events') {
    return {
      statusCode: 501,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Event streaming is not available through this serverless proxy.' }),
    }
  }

  try {
    const headers = Object.fromEntries(
      Object.entries(event.headers || {}).filter(([name]) =>
        ['authorization', 'content-type', 'x-sf-webhook-secret'].includes(name.toLowerCase())
      )
    )
    const body = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64').toString('utf8')
      : event.body
    const response = await fetch(`${backendUrl}${apiPath}${event.rawQuery ? `?${event.rawQuery}` : ''}`, {
      method: event.httpMethod || 'GET',
      headers,
      ...(['GET', 'HEAD'].includes(event.httpMethod) || body === undefined ? {} : { body }),
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
      body: JSON.stringify({ error: 'Application backend is unavailable.' }),
    }
  }
}