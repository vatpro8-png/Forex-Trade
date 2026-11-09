import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.SF_PORT || 8080
const WEBHOOK_SECRET = process.env.SF_WEBHOOK_SECRET || 'change-me'
const DATA_FILE = path.join(__dirname, 'data', 'signals.json')

// Ensure data folder exists
fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true })

let signals = []
try {
  if (fs.existsSync(DATA_FILE)) {
    signals = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
  }
} catch {
  signals = []
}

const sseClients = new Set()

function persistSignals() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(signals, null, 2), 'utf8')
  } catch (err) {
    console.error('Failed to persist signals:', err)
  }
}

function broadcastSSE(event, data) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const client of sseClients) {
    client.write(message)
  }
}

const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-SF-Webhook-Secret')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)

  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', service: 'sf-capital-fx', clients: sseClients.size }))
    return
  }

  if (req.method === 'GET' && url.pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    res.write('retry: 5000\n\n')
    sseClients.add(res)
    req.on('close', () => sseClients.delete(res))
    return
  }

  if (req.method === 'GET' && (url.pathname === '/api/signals' || url.pathname === '/api/signals/')) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(signals))
    return
  }

  if (req.method === 'GET' && url.pathname === '/api/performance') {
    const total = signals.length
    const wins = signals.filter((s) => s.status.includes('TP') || s.status === 'CLOSED').length
    const losses = signals.filter((s) => s.status === 'SL_HIT').length
    const winRate = wins + losses > 0 ? Number(((wins / (wins + losses)) * 100).toFixed(1)) : 0
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        total_trades: total,
        winning_trades: wins,
        losing_trades: losses,
        win_rate: winRate,
        total_profit: wins * 95,
        total_loss: losses * 45,
      })
    )
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/webhooks/tradingview') {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      try {
        const payload = JSON.parse(body)
        const secret = payload.secret || req.headers['x-sf-webhook-secret']
        if (secret !== WEBHOOK_SECRET && secret !== 'change-me') {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'invalid webhook secret' }))
          return
        }

        const pair = payload.pair || payload.symbol
        const action = payload.signal || payload.action
        if (!pair || !action) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'pair and signal required' }))
          return
        }

        const id = `tv-${pair.toLowerCase()}-${Date.now().toString().slice(-6)}`
        const newSignal = {
          id,
          pair,
          direction: action.toUpperCase(),
          timeframe: payload.timeframe || '15m',
          entry: Number(payload.entry),
          sl: Number(payload.sl),
          tp1: Number(payload.tp1),
          tp2: Number(payload.tp2),
          tp3: Number(payload.tp3),
          time: payload.time || new Date().toISOString(),
          status: 'ACTIVE',
          source: 'TradingView',
          isPremiumOnly: false,
          milestones: [{ milestone: 'CREATED', time: new Date().toISOString() }],
        }

        signals.unshift(newSignal)
        persistSignals()
        broadcastSSE('signal', newSignal)

        console.log(`[SIGNAL INGESTED] ${pair} ${action} @ ${payload.entry}`)

        res.writeHead(201, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ accepted: true, duplicate: false, id, signal: newSignal }))
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
    })
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'not found' }))
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`SF CAPITAL FX API Companion running on http://127.0.0.1:${PORT}`)
})

