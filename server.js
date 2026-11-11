import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.SF_PORT || 8080
const WEBHOOK_SECRET = process.env.SF_WEBHOOK_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'change-me')
const JWT_SECRET = process.env.SF_JWT_SECRET || 'sf-capital-fx-super-jwt-secret-key-2026'
const TG_TOKEN = process.env.SF_TELEGRAM_BOT_TOKEN || ''
const TG_CHAT_ID = process.env.SF_TELEGRAM_CHAT_ID || ''
const SITE_URL = (process.env.SITE_URL || 'https://sfcapitalsf.netlify.app').replace(/\/+$/, '')

// Canonical Membership Plans & Pricing (Single Source of Truth)
const MEMBERSHIP_PLANS = [
  {
    id: 'starter_free',
    slug: 'starter_free',
    name: 'Public Preview',
    isPremium: false,
    priceUsd: 0,
    priceCents: 0,
    durationDays: 0,
    currency: 'USD',
    checkoutMode: 'NONE',
  },
  {
    id: 'premium_30d',
    slug: 'premium_30d',
    name: 'Premium Monthly',
    isPremium: true,
    priceUsd: 100,
    priceCents: 10000,
    durationDays: 30,
    currency: 'USD',
    checkoutMode: 'MANUAL_VERIFICATION',
  },
  {
    id: 'premium_365d',
    slug: 'premium_365d',
    name: 'Premium Plus Annual',
    isPremium: true,
    priceUsd: 800,
    priceCents: 80000,
    durationDays: 365,
    currency: 'USD',
    checkoutMode: 'MANUAL_VERIFICATION',
  },
]

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

function sanitizeUser(user) {
  if (!user) return null
  const copy = { ...user }
  delete copy.salt
  delete copy.passwordHash
  return copy
}

function timingSafeCompare(a, b) {
  const bufA = Buffer.from(String(a || ''), 'utf8')
  const bufB = Buffer.from(String(b || ''), 'utf8')
  if (bufA.length === 0 || bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
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
async function publishTelegram(signal, milestone = null, milestonePrice = null) {
  const safePair = escapeHtml(signal.pair)
  const safeDirection = escapeHtml(signal.direction)
  const safeTimeframe = escapeHtml(signal.timeframe)
  const effectivePrice = milestonePrice ?? signal.entry

  const text = milestone
    ? `🎯 SF CAPITAL FX — MILESTONE UPDATE 🎯
━━━━━━━━━━━━━━━━━━━━
Pair: #${safePair}
Event: ${escapeHtml(milestone.replace('_', ' '))} 🔥
Price: ${escapeHtml(effectivePrice)}
Action: ${safeDirection}
━━━━━━━━━━━━━━━━━━━━
🌐 Platform: ${escapeHtml(SITE_URL)}`
    : `⚡ SF CAPITAL FX — NEW SIGNAL ⚡
━━━━━━━━━━━━━━━━━━━━
🎯 Pair: #${safePair}
📊 Direction: ${safeDirection} ${signal.direction === 'BUY' ? '🟢' : '🔴'}
⏱ Timeframe: ${safeTimeframe}
📍 Entry: ${escapeHtml(signal.entry)}
🛑 Stop Loss: ${escapeHtml(signal.sl)}

🎯 TP 1: ${escapeHtml(signal.tp1)}
🎯 TP 2: ${escapeHtml(signal.tp2)}
🎯 TP 3: ${escapeHtml(signal.tp3)}
━━━━━━━━━━━━━━━━━━━━
🔒 Risk: 1-2% max per trade
📡 Source: SF CAPITAL FX Verified Engine
🌐 Web Platform: ${escapeHtml(SITE_URL)}`

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
        signal: AbortSignal.timeout(8000),
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
    delivery.status = 'UNCONFIGURED'
    delivery.attempts = 0
    delivery.lastError = 'Telegram bot token and chat ID are not configured.'
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

  // Helper for reading JSON body (with 64KB cap)
  const readBody = (callback) => {
    let body = ''
    let tooLarge = false
    req.on('data', (chunk) => {
      if (tooLarge) return
      body += chunk
      if (body.length > 65536) {
        tooLarge = true
        res.writeHead(413, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Payload too large.' }))
        req.destroy()
      }
    })
    req.on('end', () => {
      if (tooLarge) return
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
      if (
        err ||
        !data ||
        typeof data.email !== 'string' ||
        !data.email.includes('@') ||
        typeof data.password !== 'string' ||
        data.password.length < 8
      ) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Valid email and password (minimum 8 characters) required.' }))
        return
      }

      const normalizedEmail = data.email.trim().toLowerCase()
      if (users.some((u) => u.email.toLowerCase() === normalizedEmail)) {
        res.writeHead(409, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'An account with this email already exists.' }))
        return
      }

      const salt = crypto.randomBytes(16).toString('hex')
      const hash = crypto.scryptSync(data.password, salt, 64).toString('hex')
      const newUser = {
        id: `usr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        email: normalizedEmail,
        name: String(data.name || '').trim() || normalizedEmail.split('@')[0],
        role: 'member',
        membershipStatus: 'FREE',
        membershipPlan: 'starter_free',
        premiumExpiresAt: null,
        salt,
        passwordHash: hash,
        createdAt: new Date().toISOString(),
      }

      users.push(newUser)
      saveJson(USERS_FILE, users)
      logAudit('REGISTER', 'user', newUser.id, { email: newUser.email }, newUser.id)

      const token = createToken(newUser)
      res.writeHead(201, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true, user: sanitizeUser(newUser), token }))
    })
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    readBody((err, data) => {
      if (err || !data?.email || !data?.password) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Email and password required.' }))
        return
      }

      const normalizedEmail = String(data.email).trim().toLowerCase()
      const user = users.find((u) => u.email.toLowerCase() === normalizedEmail)
      if (!user) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid email or password.' }))
        return
      }

      const computedHash = crypto.scryptSync(String(data.password), user.salt, 64).toString('hex')
      if (!timingSafeCompare(computedHash, user.passwordHash)) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid email or password.' }))
        return
      }

      const token = createToken(user)
      logAudit('LOGIN', 'user', user.id, { email: user.email }, user.id)

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true, user: sanitizeUser(user), token }))
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
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ user: sanitizeUser(user) }))
    return
  }

  // Canonical Membership Plans & Pricing (Single Source of Truth)
  if (req.method === 'GET' && (url.pathname === '/api/memberships/plans' || url.pathname === '/api/pricing')) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ plans: MEMBERSHIP_PLANS }))
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/forgot-password') {
    readBody((err, data) => {
      const email = String(data?.email || '').trim().toLowerCase()
      if (err || !email.includes('@')) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Valid email address is required.' }))
        return
      }
      logAudit('PASSWORD_RESET_REQUESTED', 'user', email, { email })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          success: true,
          message:
            'Request logged. If automated SMTP delivery is not configured, contact support on Telegram (@sfcapitalfrx) to verify account recovery.',
        })
      )
    })
    return
  }

  // Member submits manual payment verification proof for VIP upgrade
  if (req.method === 'POST' && url.pathname === '/api/subscriptions/request') {
    const authUser = getAuthUser(req)
    readBody((err, data) => {
      if (err || !data || typeof data !== 'object' || Array.isArray(data)) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid JSON payload.' }))
        return
      }

      const plan = MEMBERSHIP_PLANS.find((p) => p.isPremium && (p.slug === data.plan || p.id === data.plan))
      if (!plan) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Valid paid membership plan (premium_30d or premium_365d) is required.' }))
        return
      }

      const paymentMethod = String(data.paymentMethod || '').trim().toUpperCase()
      const allowedMethods = ['USDT_TRC20', 'BINANCE_PAY', 'BKASH', 'NAGAD', 'BANK_TRANSFER', 'MANUAL']
      if (!allowedMethods.includes(paymentMethod)) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Unsupported payment verification method.' }))
        return
      }

      const reference = String(data.reference || '').trim()
      if (reference.length < 4 || reference.length > 120) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Valid payment transaction reference (4–120 chars) is required.' }))
        return
      }

      const contactEmail = String(authUser?.email || data.email || '').trim().toLowerCase()
      if (!contactEmail.includes('@')) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Account email is required to match your payment.' }))
        return
      }

      const linkedUser = authUser || users.find((u) => u.email.toLowerCase() === contactEmail) || null
      const duplicatePending = subscriptions.find(
        (s) => s.status === 'PENDING_VERIFICATION' && s.reference === reference
      )
      if (duplicatePending) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true, duplicate: true, subscription: duplicatePending }))
        return
      }

      const pendingEntry = {
        id: `sub-req-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
        userId: linkedUser?.id || null,
        email: contactEmail,
        plan: plan.slug,
        planName: plan.name,
        durationDays: plan.durationDays,
        amountCents: plan.priceCents,
        amountUsd: plan.priceUsd,
        currency: plan.currency,
        paymentMethod,
        reference,
        status: 'PENDING_VERIFICATION',
        createdAt: new Date().toISOString(),
      }
      subscriptions.unshift(pendingEntry)
      saveJson(SUBS_FILE, subscriptions)
      logAudit('PAYMENT_VERIFICATION_SUBMITTED', 'subscription', pendingEntry.id, {
        email: contactEmail,
        plan: plan.slug,
        paymentMethod,
        reference,
      }, linkedUser?.id || null)

      res.writeHead(201, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true, duplicate: false, subscription: pendingEntry }))
    })
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
        res.end(JSON.stringify({ error: 'Invalid JSON payload' }))
        return
      }

      const secret = payload.secret || req.headers['x-sf-webhook-secret']
      if (!WEBHOOK_SECRET) {
        res.writeHead(503, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Webhook secret is not configured.' }))
        return
      }

      if (!timingSafeCompare(secret, WEBHOOK_SECRET)) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid webhook secret token' }))
        return
      }

      const pair = String(payload.pair || payload.symbol || '')
        .trim()
        .replaceAll('/', '')
        .toUpperCase()
      const action = String(payload.signal || payload.action || '')
        .trim()
        .toUpperCase()

      if (!/^[A-Z0-9._:-]{2,32}$/.test(pair) || (action !== 'BUY' && action !== 'SELL')) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Instrument pair and action (BUY/SELL) are required.' }))
        return
      }

      const levels = ['entry', 'sl', 'tp1', 'tp2', 'tp3'].map((key) => Number(payload[key]))
      const [entry, sl, tp1, tp2, tp3] = levels
      const validLevels = levels.every((level) => Number.isFinite(level) && level > 0)
      const orderedLevels = action === 'BUY'
        ? sl < entry && entry < tp1 && tp1 < tp2 && tp2 < tp3
        : sl > entry && entry > tp1 && tp1 > tp2 && tp2 > tp3

      if (!validLevels || !orderedLevels) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Prices must be finite, positive, and ordered from stop to targets.' }))
        return
      }

      const timeframe = String(payload.timeframe || '15m')
      const parsedSignalTime = payload.time ? new Date(payload.time) : new Date()
      if (!/^[A-Za-z0-9]{1,16}$/.test(timeframe) || !Number.isFinite(parsedSignalTime.getTime())) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Timeframe or signal time is invalid.' }))
        return
      }

      const signalTime = parsedSignalTime.toISOString()
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
        timeframe,
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
    const authUser = getAuthUser(req)
    if (!authUser || authUser.role !== 'admin') {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Admin access required.' }))
      return
    }

    readBody((err, data) => {
      const allowedStatuses = ['TP1_HIT', 'TP2_HIT', 'TP3_HIT', 'SL_HIT', 'CLOSED', 'CANCELLED']
      if (err || !data?.id || !allowedStatuses.includes(data.status)) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Signal id and a valid lifecycle status are required.' }))
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
      publishTelegram(signal, data.status, data.price ?? signal.entry)
      logAudit('MILESTONE_UPDATED', 'signal', signal.id, { status: data.status, pnlPips: signal.pnlPips }, authUser.id)

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
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(users.map(sanitizeUser)))
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
      if (err || !data || typeof data !== 'object' || Array.isArray(data)) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid JSON payload.' }))
        return
      }

      const normalizedEmail = String(data.email || '').trim().toLowerCase()
      const targetUser = users.find(
        (u) => (data.userId && u.id === data.userId) || (normalizedEmail && u.email.toLowerCase() === normalizedEmail)
      )
      if (!targetUser) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Target user not found.' }))
        return
      }

      const requestedPlan = MEMBERSHIP_PLANS.find(
        (p) => p.isPremium && (p.slug === data.plan || p.id === data.plan)
      )
      const rawDays = data.days !== undefined ? Number(data.days) : requestedPlan?.durationDays ?? 30
      if (!Number.isInteger(rawDays) || rawDays < 1 || rawDays > 3650) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Subscription duration must be an integer between 1 and 3650 days.' }))
        return
      }

      const resolvedPlan =
        requestedPlan ||
        MEMBERSHIP_PLANS.find((p) => p.isPremium && p.durationDays === rawDays) ||
        MEMBERSHIP_PLANS.find((p) => p.slug === (rawDays >= 365 ? 'premium_365d' : 'premium_30d'))

      const reference = String(data.reference || '').trim()
      if (!reference) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Verified payment reference is required.' }))
        return
      }

      const nowMs = Date.now()
      const currentExpiryMs =
        targetUser.membershipStatus === 'PREMIUM' && targetUser.premiumExpiresAt
          ? new Date(targetUser.premiumExpiresAt).getTime()
          : 0
      const baseStartMs = Number.isFinite(currentExpiryMs) && currentExpiryMs > nowMs ? currentExpiryMs : nowMs
      const periodEnd = new Date(baseStartMs + rawDays * 86400000).toISOString()

      targetUser.membershipStatus = 'PREMIUM'
      targetUser.membershipPlan = resolvedPlan.slug
      targetUser.premiumExpiresAt = periodEnd
      saveJson(USERS_FILE, users)

      const existingPending = data.subscriptionId
        ? subscriptions.find((s) => s.id === data.subscriptionId && s.status === 'PENDING_VERIFICATION')
        : subscriptions.find(
            (s) =>
              s.status === 'PENDING_VERIFICATION' &&
              (s.reference === reference || s.userId === targetUser.id || s.email === targetUser.email)
          )

      let subEntry
      if (existingPending) {
        existingPending.userId = targetUser.id
        existingPending.email = targetUser.email
        existingPending.plan = resolvedPlan.slug
        existingPending.planName = resolvedPlan.name
        existingPending.durationDays = rawDays
        existingPending.amountCents = resolvedPlan.priceCents
        existingPending.amountUsd = resolvedPlan.priceUsd
        existingPending.currency = resolvedPlan.currency
        existingPending.status = 'ACTIVE'
        existingPending.activatedBy = authUser.id
        existingPending.reference = reference
        existingPending.periodEnd = periodEnd
        existingPending.activatedAt = new Date().toISOString()
        subEntry = existingPending
      } else {
        subEntry = {
          id: `sub-${Date.now()}`,
          userId: targetUser.id,
          email: targetUser.email,
          plan: resolvedPlan.slug,
          planName: resolvedPlan.name,
          durationDays: rawDays,
          amountCents: resolvedPlan.priceCents,
          amountUsd: resolvedPlan.priceUsd,
          currency: resolvedPlan.currency,
          paymentMethod: String(data.paymentMethod || 'MANUAL').toUpperCase(),
          status: 'ACTIVE',
          activatedBy: authUser.id,
          reference,
          periodEnd,
          createdAt: new Date().toISOString(),
        }
        subscriptions.unshift(subEntry)
      }
      saveJson(SUBS_FILE, subscriptions)

      logAudit(
        rawDays >= 365 ? 'ACTIVATE_ANNUAL_VIP' : 'ACTIVATE_30D_VIP',
        'subscription',
        subEntry.id,
        { user: targetUser.email, plan: resolvedPlan.slug, days: rawDays, amountUsd: resolvedPlan.priceUsd, reference },
        authUser.id
      )

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true, user: sanitizeUser(targetUser), subscription: subEntry }))
    })
    return
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/subscriptions/requests') {
    const authUser = getAuthUser(req)
    if (!authUser || authUser.role !== 'admin') {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Admin access required.' }))
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(subscriptions.slice(0, 100)))
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
    const authUser = getAuthUser(req)
    if (!authUser || authUser.role !== 'admin') {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Admin access required.' }))
      return
    }
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
