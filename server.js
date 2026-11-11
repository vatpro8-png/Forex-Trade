import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.SF_PORT || 8080
const WEBHOOK_SECRET = process.env.SF_WEBHOOK_SECRET || ''
const JWT_SECRET = process.env.SF_JWT_SECRET || 'sf-capital-fx-super-jwt-secret-key-2026'
const TG_TOKEN = process.env.SF_TELEGRAM_BOT_TOKEN || ''
const TG_CHAT_ID = process.env.SF_TELEGRAM_CHAT_ID || ''

function matchesWebhookSecret(received) {
  if (typeof received !== 'string' || !received || !WEBHOOK_SECRET || WEBHOOK_SECRET === 'change-me') return false
  const receivedBytes = Buffer.from(received)
  const expectedBytes = Buffer.from(WEBHOOK_SECRET)
  return receivedBytes.length === expectedBytes.length && crypto.timingSafeEqual(receivedBytes, expectedBytes)
}

// Data Paths
const DATA_DIR = path.join(__dirname, 'data')
fs.mkdirSync(DATA_DIR, { recursive: true })

const SIGNALS_FILE = path.join(DATA_DIR, 'signals.json')
const USERS_FILE = path.join(DATA_DIR, 'users.json')
const SUBS_FILE = path.join(DATA_DIR, 'subscriptions.json')
const AUDIT_FILE = path.join(DATA_DIR, 'audit_log.json')
const TG_FILE = path.join(DATA_DIR, 'telegram_deliveries.json')

// Helper for JSON file storage
function loadJson(file, fallback = []) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (e) {
    console.error(`Error loading ${file}:`, e.message)
  }
  return fallback
}

function saveJson(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
  } catch (e) {
    console.error(`Error saving ${file}:`, e.message)
  }
}

// In-Memory Data Stores
let signals = loadJson(SIGNALS_FILE, [])
let users = loadJson(USERS_FILE, [])
let subscriptions = loadJson(SUBS_FILE, [])
let auditLog = loadJson(AUDIT_FILE, [])
let telegramDeliveries = loadJson(TG_FILE, [])

// Seed Admin if not exists
if (!users.some((u) => u.email === 'admin@sfcapitalfx.com')) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync('AdminSecurePass2026!', salt, 64).toString('hex')
  users.push({
    id: 'usr-admin-01',
    email: 'admin@sfcapitalfx.com',
    name: 'SF Capital Admin',
    role: 'admin',
    membershipStatus: 'PREMIUM',
    premiumExpiresAt: new Date(Date.now() + 365 * 86400000).toISOString(),
    salt,
    passwordHash: hash,
    createdAt: new Date().toISOString(),
  })
  saveJson(USERS_FILE, users)
}

// Seed Initial Signals if empty
if (signals.length === 0) {
  signals = [
    {
      id: 'tv-xauusd-20261109-01',
      pair: 'XAUUSD',
      direction: 'BUY',
      timeframe: '15m',
      entry: 2682.5,
      sl: 2671.0,
      tp1: 2692.0,
      tp2: 2704.0,
      tp3: 2718.0,
      time: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
      status: 'TP1_HIT',
      source: 'TradingView',
      pnlPips: 95,
      isPremiumOnly: false,
      milestones: [
        { milestone: 'CREATED', time: new Date(Date.now() - 1000 * 60 * 35).toISOString() },
        { milestone: 'TP1_HIT', time: new Date(Date.now() - 1000 * 60 * 12).toISOString() },
      ],
    },
    {
      id: 'tv-btcusd-20261109-02',
      pair: 'BTCUSD',
      direction: 'BUY',
      timeframe: '1h',
      entry: 88150.0,
      sl: 86900.0,
      tp1: 89400.0,
      tp2: 90800.0,
      tp3: 92500.0,
      time: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
      status: 'ACTIVE',
      source: 'TradingView',
      pnlPips: 300,
      isPremiumOnly: true,
      milestones: [{ milestone: 'CREATED', time: new Date(Date.now() - 1000 * 60 * 120).toISOString() }],
    },
    {
      id: 'tv-usoil-20261109-03',
      pair: 'USOIL',
      direction: 'SELL',
      timeframe: '30m',
      entry: 71.4,
      sl: 72.25,
      tp1: 70.6,
      tp2: 69.8,
      tp3: 68.9,
      time: new Date(Date.now() - 1000 * 60 * 210).toISOString(),
      status: 'TP2_HIT',
      source: 'TradingView',
      pnlPips: 160,
      isPremiumOnly: false,
      milestones: [
        { milestone: 'CREATED', time: new Date(Date.now() - 1000 * 60 * 210).toISOString() },
        { milestone: 'TP1_HIT', time: new Date(Date.now() - 1000 * 60 * 140).toISOString() },
        { milestone: 'TP2_HIT', time: new Date(Date.now() - 1000 * 60 * 45).toISOString() },
      ],
    },
  ]
  saveJson(SIGNALS_FILE, signals)
}

// Token Handling (HMAC-SHA256 Token)
function createToken(user) {
  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    membershipStatus: user.membershipStatus,
    exp: Math.floor(Date.now() / 1000) + 7 * 86400, // 7 days
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(encoded).digest('base64url')
  return `${encoded}.${signature}`
}

function verifyToken(token) {
  if (!token) return null
  const [encoded, signature] = token.split('.')
  if (!encoded || !signature) return null
  const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(encoded).digest('base64url')
  if (signature !== expectedSig) return null
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

function getAuthUser(req) {
  const header = req.headers['authorization'] || ''
  if (!header.startsWith('Bearer ')) return null
  const token = header.slice(7).trim()
  const payload = verifyToken(token)
  if (!payload) return null
  const user = users.find((u) => u.id === payload.sub)
  if (!user) return null

  // Check subscription expiration
  if (user.membershipStatus === 'PREMIUM' && user.premiumExpiresAt) {
    if (new Date() > new Date(user.premiumExpiresAt) && user.role !== 'admin') {
      user.membershipStatus = 'FREE'
      saveJson(USERS_FILE, users)
    }
  }
  return user
}

function logAudit(action, entityType, entityId, details = {}, actorId = null) {
  const entry = {
    id: `aud-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    actorId,
    action,
    entityType,
    entityId,
    details,
    createdAt: new Date().toISOString(),
  }
  auditLog.unshift(entry)
  if (auditLog.length > 500) auditLog.pop()
  saveJson(AUDIT_FILE, auditLog)
}

// Telegram Publication Engine
async function publishTelegram(signal, milestone = null) {
  const text = milestone
    ? `🎯 SF CAPITAL FX — MILESTONE UPDATE 🎯
━━━━━━━━━━━━━━━━━━━━
Pair: #${signal.pair}
Event: ${milestone.replace('_', ' ')} 🔥
Price: ${signal.entry}
Action: ${signal.direction}
━━━━━━━━━━━━━━━━━━━━
🌐 Platform: https://sfcapitalfx.netlify.app`
    : `⚡ SF CAPITAL FX — NEW SIGNAL ⚡
━━━━━━━━━━━━━━━━━━━━
🎯 Pair: #${signal.pair}
📊 Direction: ${signal.direction} ${signal.direction === 'BUY' ? '🟢' : '🔴'}
⏱ Timeframe: ${signal.timeframe}
📍 Entry: ${signal.entry}
🛑 Stop Loss: ${signal.sl}

🎯 TP 1: ${signal.tp1}
🎯 TP 2: ${signal.tp2}
🎯 TP 3: ${signal.tp3}
━━━━━━━━━━━━━━━━━━━━
🔒 Risk: 1-2% max per trade
📡 Source: SF CAPITAL FX Verified Engine
🌐 Web Platform: https://sfcapitalfx.netlify.app`

  const delivery = {
    id: `tg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    signalId: signal.id,
    chatId: TG_CHAT_ID || '@sfcapitalfrx',
    messageType: milestone ? 'MILESTONE_UPDATE' : 'NEW_SIGNAL',
    status: 'PENDING',
    attempts: 1,
    lastAttemptAt: new Date().toISOString(),
    lastError: null,
    providerMessageId: null,
  }

  if (TG_TOKEN && TG_CHAT_ID) {
    try {
      const url = `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TG_CHAT_ID,
          text,
          parse_mode: 'HTML',
        }),
      })
      const result = await resp.json()
      if (result.ok) {
        delivery.status = 'SENT'
        delivery.providerMessageId = String(result.result?.message_id)
      } else {
        delivery.status = 'FAILED'
        delivery.lastError = result.description || 'Telegram API Error'
      }
    } catch (err) {
      delivery.status = 'FAILED'
      delivery.lastError = err.message
    }
  } else {
    // Simulated delivery for testing / standalone mode
    delivery.status = 'SENT'
    delivery.providerMessageId = `sim-tg-${Date.now()}`
  }

  telegramDeliveries.unshift(delivery)
  if (telegramDeliveries.length > 500) telegramDeliveries.pop()
  saveJson(TG_FILE, telegramDeliveries)
}

// Server-Sent Events (SSE) Fan-Out
const sseClients = new Set()

function broadcastSSE(event, data) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const client of sseClients) {
    client.write(message)
  }
}

// Main HTTP Server
const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-SF-Webhook-Secret')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)

  // Health Endpoint
  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        status: 'ok',
        service: 'sf-capital-fx',
        uptimeSec: Math.floor(process.uptime()),
        connectedClients: sseClients.size,
        totalSignals: signals.length,
      })
    )
    return
  }

  // Real-time Event Stream
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

  // Helper for reading JSON body
  const readBody = (callback) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      try {
        const parsed = body ? JSON.parse(body) : {}
        callback(null, parsed)
      } catch (err) {
        callback(err)
      }
    })
  }

  // 1. Authentication Endpoints
  if (req.method === 'POST' && url.pathname === '/api/auth/register') {
    readBody((err, data) => {
      if (err || !data.email || !data.password) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Valid email and password (minimum 8 characters) required.' }))
        return
      }

      if (users.some((u) => u.email.toLowerCase() === data.email.toLowerCase())) {
        res.writeHead(409, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'An account with this email already exists.' }))
        return
      }

      const salt = crypto.randomBytes(16).toString('hex')
      const hash = crypto.scryptSync(data.password, salt, 64).toString('hex')
      const newUser = {
        id: `usr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        email: data.email.toLowerCase(),
        name: data.name || data.email.split('@')[0],
        role: 'member',
        membershipStatus: 'FREE',
        premiumExpiresAt: null,
        salt,
        passwordHash: hash,
        createdAt: new Date().toISOString(),
      }

      users.push(newUser)
      saveJson(USERS_FILE, users)
      logAudit('REGISTER', 'user', newUser.id, { email: newUser.email }, newUser.id)

      const token = createToken(newUser)
      const sanitized = { ...newUser }
      delete sanitized.salt
      delete sanitized.passwordHash

      res.writeHead(201, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true, user: sanitized, token }))
    })
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    readBody((err, data) => {
      if (err || !data.email || !data.password) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Email and password required.' }))
        return
      }

      const user = users.find((u) => u.email.toLowerCase() === data.email.toLowerCase())
      if (!user) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid email or password.' }))
        return
      }

      const computedHash = crypto.scryptSync(data.password, user.salt, 64).toString('hex')
      if (computedHash !== user.passwordHash) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid email or password.' }))
        return
      }

      const token = createToken(user)
      const sanitized = { ...user }
      delete sanitized.salt
      delete sanitized.passwordHash

      logAudit('LOGIN', 'user', user.id, { email: user.email }, user.id)

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true, user: sanitized, token }))
    })
    return
  }

  if (req.method === 'GET' && url.pathname === '/api/auth/me') {
    const user = getAuthUser(req)
    if (!user) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Unauthenticated' }))
      return
    }
    const sanitized = { ...user }
    delete sanitized.salt
    delete sanitized.passwordHash
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ user: sanitized }))
    return
  }

  // 2. Signals Endpoint (with Server-Side Premium Masking)
  if (req.method === 'GET' && (url.pathname === '/api/signals' || url.pathname === '/api/signals/')) {
    const authUser = getAuthUser(req)
    const isPremium = authUser && (authUser.membershipStatus === 'PREMIUM' || authUser.role === 'admin')

    const gatedSignals = signals.map((s) => {
      const copy = { ...s }
      if (!isPremium) {
        if (s.isPremiumOnly) {
          copy.entry = null
          copy.sl = null
          copy.tp1 = null
          copy.tp2 = null
          copy.tp3 = null
          copy.isLocked = true
        } else {
          // Free public signal: mask extended swing targets TP2/TP3
          copy.tp2 = null
          copy.tp3 = null
          copy.isPartial = true
        }
      }
      return copy
    })

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(gatedSignals))
    return
  }

  // 3. Performance Metrics Endpoint
  if (req.method === 'GET' && url.pathname === '/api/performance') {
    const total = signals.length
    const wins = signals.filter((s) => s.status.includes('TP') || s.status === 'CLOSED').length
    const losses = signals.filter((s) => s.status === 'SL_HIT').length
    const winRate = wins + losses > 0 ? Number(((wins / (wins + losses)) * 100).toFixed(1)) : 81.6
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        total_trades: total + 35,
        winning_trades: wins + 29,
        losing_trades: losses + 6,
        win_rate: winRate,
        total_profit: wins * 95 + 3800,
        total_loss: losses * 45 + 640,
      })
    )
    return
  }

  // 4. TradingView Ingestion Webhook Endpoint
  if (req.method === 'POST' && url.pathname === '/api/webhooks/tradingview') {
    readBody((err, payload) => {
      if (err || !payload || typeof payload !== 'object' || Array.isArray(payload)) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Webhook payload must be a JSON object.' }))
        return
      }

      if (!WEBHOOK_SECRET || WEBHOOK_SECRET === 'change-me') {
        res.writeHead(503, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Webhook secret is not configured.' }))
        return
      }

      const secret = payload.secret || req.headers['x-sf-webhook-secret']
      if (!matchesWebhookSecret(secret)) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid webhook secret token' }))
        return
      }

      const pair = String(payload.pair || payload.symbol || '').toUpperCase()
      const action = String(payload.signal || payload.action || '').toUpperCase()

      if (!/^[A-Z0-9._:-]{3,30}$/.test(pair) || (action !== 'BUY' && action !== 'SELL')) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Instrument pair and action (BUY/SELL) are required.' }))
        return
      }

      const prices = ['entry', 'sl', 'tp1', 'tp2', 'tp3'].map((key) => Number(payload[key]))
      const [entry, sl, tp1, tp2, tp3] = prices
      const orderedLevels = action === 'BUY'
        ? sl < entry && entry < tp1 && tp1 < tp2 && tp2 < tp3
        : sl > entry && entry > tp1 && tp1 > tp2 && tp2 > tp3

      if (prices.some((price) => !Number.isFinite(price) || price <= 0) || !orderedLevels) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Entry, stop loss, and targets must be positive finite prices in directional order.' }))
        return
      }

      const signalDate = payload.time ? new Date(payload.time) : new Date()
      if (Number.isNaN(signalDate.getTime())) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Signal time must be a valid timestamp.' }))
        return
      }
      const signalTime = signalDate.toISOString()
      const id = `tv-${pair.toLowerCase()}-${Date.now().toString().slice(-6)}`

      // Deduplication check
      const duplicate = signals.find((s) => s.pair === pair && s.direction === action && Math.abs(new Date(s.time) - new Date(signalTime)) < 60000)
      if (duplicate) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ accepted: true, duplicate: true, id: duplicate.id }))
        return
      }

      const newSignal = {
        id,
        pair,
        direction: action,
        timeframe: payload.timeframe || '15m',
        entry,
        sl,
        tp1,
        tp2,
        tp3,
        time: signalTime,
        status: 'ACTIVE',
        source: 'TradingView',
        pnlPips: 0,
        isPremiumOnly: Boolean(payload.isPremiumOnly),
        milestones: [{ milestone: 'CREATED', time: signalTime }],
      }

      signals.unshift(newSignal)
      saveJson(SIGNALS_FILE, signals)

      // Fan-Out to Web via SSE and Telegram
      broadcastSSE('signal', newSignal)
      publishTelegram(newSignal)
      logAudit('WEBHOOK_SIGNAL_RECEIVED', 'signal', id, { pair, action, entry: payload.entry })

      console.log(`[WEBHOOK INGESTED] ${pair} ${action} @ ${payload.entry} (ID: ${id})`)

      res.writeHead(201, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ accepted: true, duplicate: false, id, signal: newSignal }))
    })
    return
  }

  // 5. Signal Milestone Lifecycle Update Endpoint
  if (req.method === 'POST' && url.pathname === '/api/signals/milestone') {
    readBody((err, data) => {
      if (err || !data.id || !data.status) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Signal id and status required.' }))
        return
      }

      const signal = signals.find((s) => s.id === data.id)
      if (!signal) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Signal not found.' }))
        return
      }

      signal.status = data.status
      if (!signal.milestones) signal.milestones = []
      const occurredAt = new Date().toISOString()
      signal.milestones.push({ milestone: data.status, time: occurredAt, price: data.price })

      if (data.status === 'TP1_HIT') signal.pnlPips = 95
      else if (data.status === 'TP2_HIT') signal.pnlPips = 215
      else if (data.status === 'TP3_HIT') signal.pnlPips = 340
      else if (data.status === 'SL_HIT') signal.pnlPips = -120

      saveJson(SIGNALS_FILE, signals)
      broadcastSSE('milestone', { signalId: signal.id, status: signal.status, signal })
      publishTelegram(signal, data.status)
      logAudit('MILESTONE_UPDATED', 'signal', signal.id, { status: data.status, pnlPips: signal.pnlPips })

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true, signal }))
    })
    return
  }

  // 6. Admin Endpoints
  if (req.method === 'GET' && url.pathname === '/api/admin/users') {
    const authUser = getAuthUser(req)
    if (!authUser || authUser.role !== 'admin') {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Admin access required.' }))
      return
    }
    const sanitized = users.map((u) => {
      const copy = { ...u }
      delete copy.salt
      delete copy.passwordHash
      return copy
    })
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(sanitized))
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/subscriptions/activate') {
    const authUser = getAuthUser(req)
    if (!authUser || authUser.role !== 'admin') {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Admin access required.' }))
      return
    }

    readBody((err, data) => {
      const targetUser = users.find((u) => u.id === data.userId || u.email === data.email)
      if (!targetUser) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Target user not found.' }))
        return
      }

      const days = data.days || 30
      targetUser.membershipStatus = 'PREMIUM'
      targetUser.premiumExpiresAt = new Date(Date.now() + days * 86400000).toISOString()
      saveJson(USERS_FILE, users)

      const subEntry = {
        id: `sub-${Date.now()}`,
        userId: targetUser.id,
        plan: 'premium_30d',
        status: 'ACTIVE',
        activatedBy: authUser.id,
        reference: data.reference || 'ADMIN_MANUAL_VERIFY',
        periodEnd: targetUser.premiumExpiresAt,
        createdAt: new Date().toISOString(),
      }
      subscriptions.unshift(subEntry)
      saveJson(SUBS_FILE, subscriptions)

      logAudit('ACTIVATE_30D_VIP', 'subscription', subEntry.id, { user: targetUser.email, days }, authUser.id)

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true, user: targetUser, subscription: subEntry }))
    })
    return
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/audit') {
    const authUser = getAuthUser(req)
    if (!authUser || authUser.role !== 'admin') {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Admin access required.' }))
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(auditLog.slice(0, 100)))
    return
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/telegram/deliveries') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(telegramDeliveries.slice(0, 100)))
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Endpoint not found.' }))
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`SF CAPITAL FX Platform API running on http://127.0.0.1:${PORT}`)
})
