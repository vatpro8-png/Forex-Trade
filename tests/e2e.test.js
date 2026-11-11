// SF CAPITAL FX — Comprehensive E2E Verification Test Suite
// Run via: node tests/e2e.test.js

const BASE_URL = 'http://127.0.0.1:8080'

let testsPassed = 0
let testsFailed = 0

async function test(name, fn) {
  try {
    process.stdout.write(`Testing: ${name}... `)
    await fn()
    console.log('✓ PASSED')
    testsPassed++
  } catch (err) {
    console.log('✗ FAILED')
    console.error(`  Error: ${err.message}`)
    testsFailed++
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed')
}

async function runTests() {
  console.log('\n======================================================')
  console.log('🎯 SF CAPITAL FX — End-to-End Automated Validation')
  console.log('======================================================\n')

  let adminToken = ''
  let memberToken = ''
  let memberUserId = ''
  let createdSignalId = ''

  // 1. Health Check
  await test('GET /health returns 200 OK and service status', async () => {
    const res = await fetch(`${BASE_URL}/health`)
    assert(res.status === 200, `Expected status 200, got ${res.status}`)
    const data = await res.json()
    assert(data.status === 'ok', `Expected status 'ok', got ${data.status}`)
    assert(data.service === 'sf-capital-fx', `Expected service 'sf-capital-fx', got ${data.service}`)
  })

  // 2. Admin Login
  await test('POST /api/auth/login validates admin credentials', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@sfcapitalfx.com',
        password: 'AdminSecurePass2026!',
      }),
    })
    assert(res.status === 200, `Expected status 200, got ${res.status}`)
    const data = await res.json()
    assert(data.success === true, 'Login should succeed')
    assert(data.token, 'Token should be returned')
    assert(data.user.role === 'admin', 'User should have admin role')
    assert(data.user.membershipStatus === 'PREMIUM', 'Admin should have PREMIUM status')
    adminToken = data.token
  })

  // 3. User Registration (Free Starter)
  await test('POST /api/auth/register registers new user with FREE tier', async () => {
    const testEmail = `trader_${Date.now()}@example.com`
    const res = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: 'TraderSecretPassword123!',
        name: 'Alex Trader',
      }),
    })
    assert(res.status === 201, `Expected status 201, got ${res.status}`)
    const data = await res.json()
    assert(data.success === true, 'Registration should succeed')
    assert(data.user.membershipStatus === 'FREE', 'New user must default to FREE')
    assert(data.token, 'Token should be returned')
    memberToken = data.token
    memberUserId = data.user.id
  })

  // 4. Server-Side Signal Masking for Free Member
  await test('GET /api/signals enforces server-side masking for FREE user', async () => {
    const res = await fetch(`${BASE_URL}/api/signals`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    })
    assert(res.status === 200, `Expected status 200, got ${res.status}`)
    const signals = await res.json()
    assert(Array.isArray(signals) && signals.length > 0, 'Signals array expected')

    const premiumSignal = signals.find((s) => s.isPremiumOnly)
    if (premiumSignal) {
      assert(premiumSignal.entry === null, 'Premium signal entry must be masked as null')
      assert(premiumSignal.sl === null, 'Premium signal SL must be masked as null')
      assert(premiumSignal.tp1 === null, 'Premium signal TP1 must be masked as null')
      assert(premiumSignal.isLocked === true, 'Premium signal should have isLocked flag')
    }

    const freeSignal = signals.find((s) => !s.isPremiumOnly)
    if (freeSignal) {
      assert(freeSignal.entry !== null, 'Free signal entry must be visible')
      assert(freeSignal.tp2 === null, 'Free signal TP2 swing target must be masked')
      assert(freeSignal.tp3 === null, 'Free signal TP3 swing target must be masked')
    }
  })

  // 5. Canonical Pricing & Admin Subscription Activation
  await test('GET /api/memberships/plans returns canonical USD pricing', async () => {
    const res = await fetch(`${BASE_URL}/api/memberships/plans`)
    assert(res.status === 200, `Expected status 200, got ${res.status}`)
    const data = await res.json()
    assert(Array.isArray(data.plans), 'plans array expected')
    const monthly = data.plans.find((p) => p.slug === 'premium_30d')
    const annual = data.plans.find((p) => p.slug === 'premium_365d')
    assert(monthly && monthly.priceUsd === 100 && monthly.durationDays === 30, 'Monthly plan must be $100 / 30d')
    assert(annual && annual.priceUsd === 800 && annual.durationDays === 365, 'Annual plan must be $800 / 365d')
  })

  await test('POST /api/admin/subscriptions/activate rejects invalid duration and empty reference', async () => {
    const badDays = await fetch(`${BASE_URL}/api/admin/subscriptions/activate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ userId: memberUserId, days: -5, reference: 'REF' }),
    })
    assert(badDays.status === 400, `Expected status 400 for negative days, got ${badDays.status}`)

    const missingRef = await fetch(`${BASE_URL}/api/admin/subscriptions/activate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ userId: memberUserId, days: 30, reference: '   ' }),
    })
    assert(missingRef.status === 400, `Expected status 400 for empty reference, got ${missingRef.status}`)
  })

  await test('POST /api/admin/subscriptions/activate grants 30-Day VIP without leaking secrets', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/subscriptions/activate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        userId: memberUserId,
        days: 30,
        reference: 'TEST_MANUAL_RECEIPT_100_USDT',
      }),
    })
    assert(res.status === 200, `Expected status 200, got ${res.status}`)
    const data = await res.json()
    assert(data.success === true, 'Activation should succeed')
    assert(data.user.membershipStatus === 'PREMIUM', 'User should now be PREMIUM')
    assert(data.user.passwordHash === undefined && data.user.salt === undefined, 'Credentials must not be leaked')
    assert(data.subscription.amountUsd === 100 && data.subscription.currency === 'USD', 'Subscription amount must be $100 USD')
  })

  // 6. Server-Side Unmasking for Upgraded Premium Member
  await test('GET /api/signals reveals complete unmasked levels for PREMIUM member', async () => {
    const res = await fetch(`${BASE_URL}/api/signals`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    })
    assert(res.status === 200, `Expected status 200, got ${res.status}`)
    const signals = await res.json()

    const premiumSignal = signals.find((s) => s.isPremiumOnly)
    if (premiumSignal) {
      assert(premiumSignal.entry !== null, 'Premium signal entry must now be unmasked')
      assert(premiumSignal.sl !== null, 'Premium signal SL must now be unmasked')
      assert(premiumSignal.tp1 !== null, 'Premium signal TP1 must now be unmasked')
      assert(premiumSignal.tp2 !== null, 'Premium signal TP2 must now be unmasked')
      assert(premiumSignal.tp3 !== null, 'Premium signal TP3 must now be unmasked')
    }
  })

  // 7. TradingView Webhook Authentication (Negative Test)
  await test('POST /api/webhooks/tradingview rejects invalid secret with 401', async () => {
    const res = await fetch(`${BASE_URL}/api/webhooks/tradingview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: 'invalid-attacker-secret',
        pair: 'XAUUSD',
        signal: 'BUY',
        entry: 2685.5,
        sl: 2672.0,
        tp1: 2695.0,
      }),
    })
    assert(res.status === 401, `Expected status 401, got ${res.status}`)
  })

  await test('POST /api/webhooks/tradingview rejects invalid directional price levels', async () => {
    const res = await fetch(`${BASE_URL}/api/webhooks/tradingview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: 'change-me',
        pair: 'XAUUSD',
        signal: 'BUY',
        entry: 2688,
        sl: 2690,
        tp1: 2698,
        tp2: 2710,
        tp3: 2725,
      }),
    })
    assert(res.status === 400, `Expected status 400, got ${res.status}`)
  })

  // 8. TradingView Webhook Valid Ingestion (including slash pair normalization)
  await test('POST /api/webhooks/tradingview ingests valid alert and returns 201 Created', async () => {
    const timestamp = new Date().toISOString()
    const res = await fetch(`${BASE_URL}/api/webhooks/tradingview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: 'change-me',
        pair: 'XAU/USD',
        signal: 'BUY',
        timeframe: '15m',
        entry: 2688.0,
        sl: 2675.0,
        tp1: 2698.0,
        tp2: 2710.0,
        tp3: 2725.0,
        time: timestamp,
      }),
    })
    assert(res.status === 201, `Expected status 201, got ${res.status}`)
    const data = await res.json()
    assert(data.accepted === true, 'Signal must be accepted')
    assert(data.duplicate === false, 'New signal must not be duplicate')
    assert(data.signal.pair === 'XAUUSD', 'Slash pair should normalize to XAUUSD')
    assert(data.id, 'Idempotent ID should be assigned')
    createdSignalId = data.id
  })

  // 9. Webhook Idempotency (Duplicate Detection)
  await test('POST /api/webhooks/tradingview detects duplicate alert idempotently', async () => {
    const res = await fetch(`${BASE_URL}/api/webhooks/tradingview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: 'change-me',
        pair: 'XAUUSD',
        signal: 'BUY',
        timeframe: '15m',
        entry: 2688.0,
        sl: 2675.0,
        tp1: 2698.0,
        tp2: 2710.0,
        tp3: 2725.0,
      }),
    })
    assert(res.status === 200, `Expected status 200 for duplicate, got ${res.status}`)
    const data = await res.json()
    assert(data.duplicate === true, 'Expected duplicate flag true')
  })

  // 10. Milestone Progression
  await test('POST /api/signals/milestone rejects requests without an admin token', async () => {
    const res = await fetch(`${BASE_URL}/api/signals/milestone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: createdSignalId, status: 'TP1_HIT', price: 2698.0 }),
    })
    assert(res.status === 403, `Expected status 403, got ${res.status}`)
  })

  await test('POST /api/signals/milestone advances signal lifecycle to TP1_HIT', async () => {
    const res = await fetch(`${BASE_URL}/api/signals/milestone`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        id: createdSignalId,
        status: 'TP1_HIT',
        price: 2698.0,
      }),
    })
    assert(res.status === 200, `Expected status 200, got ${res.status}`)
    const data = await res.json()
    assert(data.signal.status === 'TP1_HIT', 'Signal status should be TP1_HIT')
    assert(data.signal.milestones.some((m) => m.milestone === 'TP1_HIT'), 'Milestone record must exist')
  })

  // 11. Performance Statistics
  await test('GET /api/performance delivers server-calculated analytics', async () => {
    const res = await fetch(`${BASE_URL}/api/performance`)
    assert(res.status === 200, `Expected status 200, got ${res.status}`)
    const data = await res.json()
    assert(typeof data.total_trades === 'number', 'total_trades must be number')
    assert(typeof data.win_rate === 'number', 'win_rate must be number')
    assert(typeof data.total_profit === 'number', 'total_profit must be number')
    assert(typeof data.total_loss === 'number', 'total_loss must be number')
  })

  // 12. Telegram Outbox & Audit Logs
  await test('GET /api/admin/telegram/deliveries rejects requests without an admin token', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/telegram/deliveries`)
    assert(res.status === 403, `Expected status 403, got ${res.status}`)
  })

  await test('GET /api/admin/telegram/deliveries logs outbox dispatch entries', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/telegram/deliveries`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    assert(res.status === 200, `Expected status 200, got ${res.status}`)
    const deliveries = await res.json()
    assert(Array.isArray(deliveries) && deliveries.length > 0, 'Deliveries array expected')
    assert(
      ['SENT', 'PENDING', 'UNCONFIGURED'].includes(deliveries[0].status),
      'Valid delivery status expected'
    )
  })

  console.log('\n======================================================')
  console.log(`Results: ${testsPassed} passed, ${testsFailed} failed`)
  console.log('======================================================\n')

  if (testsFailed > 0) {
    process.exit(1)
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err)
  process.exit(1)
})

