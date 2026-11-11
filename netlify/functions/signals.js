// Netlify Serverless Function: persistent backend signal feed
// Endpoint: GET /api/signals
import { forwardRequest, getBackendUrl, jsonResponse, pickHeaders } from '../lib/proxy.js'

export const handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'Method Not Allowed' }, { Allow: 'GET' })
  }

  const backendUrl = getBackendUrl()
  if (!backendUrl) {
    return jsonResponse(503, { error: 'Signal backend is not configured.' })
  }

  const headers = pickHeaders(event.headers, ['authorization'])
  return forwardRequest(
    `${backendUrl}/api/signals`,
    { headers },
    'Signal backend is unavailable.'
  )
}
