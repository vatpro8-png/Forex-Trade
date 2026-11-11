// Proxy authenticated application APIs to the durable backend.
import {
  decodeEventBody,
  forwardRequest,
  getBackendUrl,
  jsonResponse,
  pickHeaders,
} from '../lib/proxy.js'

export const handler = async (event) => {
  const backendUrl = getBackendUrl()
  if (!backendUrl) {
    return jsonResponse(503, { error: 'Application backend is not configured.' })
  }

  const path = (event.path || '').replace(/^\/.netlify\/functions\/backend/, '')
  const apiPath = path.startsWith('/api/') ? path : `/api/${path.replace(/^\/+/, '')}`
  if (apiPath === '/api/events') {
    return jsonResponse(501, {
      error: 'Event streaming is not available through this serverless proxy.',
    })
  }

  const headers = pickHeaders(event.headers, [
    'authorization',
    'content-type',
    'x-sf-webhook-secret',
  ])
  const body = decodeEventBody(event)
  const method = event.httpMethod || 'GET'
  const query = event.rawQuery ? `?${event.rawQuery}` : ''

  return forwardRequest(
    `${backendUrl}${apiPath}${query}`,
    {
      method,
      headers,
      ...(['GET', 'HEAD'].includes(method) || body === undefined ? {} : { body }),
    },
    'Application backend is unavailable.'
  )
}
