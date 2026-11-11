// Shared upstream proxy utilities for Netlify serverless functions.

export function getBackendUrl() {
  return process.env.BACKEND_API_URL?.trim().replace(/\/+$/, '') || ''
}

export function jsonResponse(statusCode, payload, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
    body: JSON.stringify(payload),
  }
}

export function decodeEventBody(event) {
  if (event.body === undefined || event.body === null) return undefined
  return event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body
}

export function pickHeaders(headers, allowedNames) {
  const allowed = new Set(allowedNames.map((n) => n.toLowerCase()))
  return Object.fromEntries(
    Object.entries(headers || {}).filter(([name]) => allowed.has(name.toLowerCase()))
  )
}

export async function forwardRequest(targetUrl, init, unavailableMessage) {
  try {
    const response = await fetch(targetUrl, {
      ...init,
      signal: AbortSignal.timeout(8000),
    })

    return {
      statusCode: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/json',
        'Cache-Control': 'no-store',
      },
      body: await response.text(),
    }
  } catch (error) {
    const isTimeout = error?.name === 'TimeoutError' || error?.name === 'AbortError'
    return jsonResponse(isTimeout ? 504 : 502, {
      error: isTimeout ? 'Backend request timed out.' : unavailableMessage,
    })
  }
}
