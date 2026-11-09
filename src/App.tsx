import React, { useState, useEffect, useMemo } from 'react'
import type { Signal, User, SignalStatus } from './model/types'
import { MARKETS } from './model/symbols'
import { INITIAL_SIGNALS, INITIAL_STATS } from './data/mockSignals'
import { formatDate, copyToClipboard } from './model/format'
import { TradingChart } from './components/TradingChart'
import { AdminConsole } from './components/AdminConsole'

export const App: React.FC = () => {
  const [signals, setSignals] = useState<Signal[]>(INITIAL_SIGNALS)
  const [selectedMarket, setSelectedMarket] = useState<string>('XAUUSD')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'CLOSED' | 'VIP'>('ALL')
  const [accountType, setAccountType] = useState<'DEMO' | 'LIVE'>('DEMO')
  const [demoBalance, setDemoBalance] = useState<number>(10000.0)
  const [tradeAmount, setTradeAmount] = useState<number>(100)
  const [livePrice, setLivePrice] = useState<number>(2686.5)

  const [user, setUser] = useState<User | null>({
    id: 'user-demo-01',
    email: 'trader@sfcapitalfx.com',
    name: 'Active Trader',
    role: 'admin',
    membershipStatus: 'PREMIUM',
    premiumExpiresAt: '2026-12-09T00:00:00Z',
  })

  const [activeModal, setActiveModal] = useState<'auth' | 'vip' | 'admin' | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [isLiveConnected, setIsLiveConnected] = useState(false)

  // Auth inputs
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authName, setAuthName] = useState('')

  const showToast = (message: string) => {
    setToastMessage(message)
    setTimeout(() => {
      setToastMessage((current) => (current === message ? null : current))
    }, 3200)
  }

  // Fetch live signals from API
  const fetchSignals = async () => {
    try {
      const response = await fetch('/api/signals')
      if (response.ok) {
        const data = await response.json()
        if (Array.isArray(data) && data.length > 0) {
          const mapped: Signal[] = data.map((item: any) => ({
            id: item.id,
            pair: item.pair,
            direction: item.signal === 'SELL' || item.direction === 'SELL' ? 'SELL' : 'BUY',
            entry: Number(item.entry),
            sl: Number(item.sl),
            tp1: Number(item.tp1),
            tp2: Number(item.tp2),
            tp3: Number(item.tp3),
            time: item.time || new Date().toISOString(),
            status: (item.status as SignalStatus) || 'ACTIVE',
            timeframe: item.timeframe || '15m',
            source: 'TradingView',
            isPremiumOnly: Boolean(item.isPremiumOnly),
            pnlPips: item.pnlPips || (item.status === 'TP1_HIT' ? 95 : item.status === 'TP2_HIT' ? 160 : 0),
          }))
          setSignals(mapped)
          setIsLiveConnected(true)
          return
        }
      }
    } catch {
      // Offline fallback
    }
  }

  useEffect(() => {
    fetchSignals()
    const interval = setInterval(fetchSignals, 25000)

    // SSE connection
    let eventSource: EventSource | null = null
    try {
      eventSource = new EventSource('/api/events')
      eventSource.onopen = () => setIsLiveConnected(true)
      eventSource.onerror = () => setIsLiveConnected(false)
      eventSource.addEventListener('signal', (event) => {
        try {
          const incoming = JSON.parse(event.data)
          setSignals((prev) => [incoming, ...prev.filter((s) => s.id !== incoming.id)])
          showToast(`⚡ TradingView Webhook: New ${incoming.pair} ${incoming.direction} Alert!`)
        } catch {
          // ignore
        }
      })
    } catch {
      // ignore
    }

    return () => {
      clearInterval(interval)
      if (eventSource) eventSource.close()
    }
  }, [])

  // Market info
  const currentMarket = useMemo(() => {
    return MARKETS.find((m) => m.symbol === selectedMarket) || MARKETS[0]
  }, [selectedMarket])

  // Featured signal for the selected market
  const activeSignal = useMemo(() => {
    return (
      signals.find(
        (s) => s.pair === currentMarket.symbol && (s.status === 'ACTIVE' || s.status.includes('TP'))
      ) ||
      signals.find((s) => s.pair === currentMarket.symbol) ||
      null
    )
  }, [signals, currentMarket])

  // Filtered signals for the matrix
  const filteredSignals = useMemo(() => {
    return signals.filter((s) => {
      if (statusFilter === 'ACTIVE') return s.status === 'ACTIVE' || s.status.includes('TP')
      if (statusFilter === 'CLOSED') return s.status === 'CLOSED' || s.status === 'SL_HIT'
      if (statusFilter === 'VIP') return s.isPremiumOnly
      return true
    })
  }, [signals, statusFilter])

  // Performance analytics
  const stats = useMemo(() => {
    const closed = signals.filter((s) => s.status === 'CLOSED' || s.status === 'SL_HIT')
    const wins = closed.filter((s) => (s.pnlPips || 0) > 0).length
    const computedWinRate = closed.length > 0 ? Number(((wins / closed.length) * 100).toFixed(1)) : 87.4
    const totalPips = signals.reduce((acc, s) => acc + (s.pnlPips || 0), 14820)
    return {
      winRate: computedWinRate,
      totalPips,
      totalTrades: INITIAL_STATS.totalTrades + signals.length,
      profitFactor: 3.42,
    }
  }, [signals])

  // Simulated Pocket Option Call / Put Order
  const handleExecuteTrade = (direction: 'CALL' | 'PUT') => {
    const payout = Math.round(tradeAmount * 1.88)
    showToast(`✓ ${direction} Order Placed: $${tradeAmount} on ${currentMarket.symbol} (Potential Return: $${payout})`)
    if (accountType === 'DEMO') {
      setDemoBalance((prev) => prev - tradeAmount)
    }
  }

  // Copy signal to clipboard
  const handleCopy = async (s: Signal) => {
    const text = `⚡ SF CAPITAL FX SIGNAL ⚡
Pair: #${s.pair}
Action: ${s.direction}
Timeframe: ${s.timeframe}
Entry: ${s.entry}
Stop Loss: ${s.sl}
TP1: ${s.tp1} | TP2: ${s.tp2} | TP3: ${s.tp3}
Status: ${s.status}
Source: TradingView Webhook Engine
https://sfcapitalsf.netlify.app`
    const ok = await copyToClipboard(text)
    if (ok) showToast(`✓ Copied ${s.pair} ${s.direction} signal to clipboard!`)
  }

  const handleAuthSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!authEmail) return
    const isAdm = authEmail.includes('admin')
    const newUser: User = {
      id: `usr-${Date.now().toString().slice(-4)}`,
      email: authEmail,
      name: authName || authEmail.split('@')[0],
      role: isAdm ? 'admin' : 'member',
      membershipStatus: isAdm ? 'PREMIUM' : 'FREE',
      premiumExpiresAt: '2026-12-09T00:00:00Z',
    }
    setUser(newUser)
    setActiveModal(null)
    showToast(`Signed in as ${newUser.email} (${newUser.membershipStatus})`)
  }

  const handleUpgradeVIP = () => {
    if (user) {
      setUser({ ...user, membershipStatus: 'PREMIUM', premiumExpiresAt: '2026-12-31T23:59:59Z' })
      showToast('🌟 VIP PRO Membership Activated! 30-day VIP Access granted.')
      setActiveModal(null)
    }
  }

  return (
    <div className="po-platform">
      {/* Toast Notification */}
      <div className={`po-toast ${toastMessage ? 'show' : ''}`}>
        <span>{toastMessage}</span>
      </div>

      {/* Top Ticker Tape Ribbon (Pocket Option style) */}
      <div className="po-top-ribbon">
        <div className="po-ribbon-left">
          <div className="po-live-pulse-badge">
            <span className="po-pulse-dot"></span>
            <span>LIVE SIGNALS MARKET</span>
          </div>
          {MARKETS.map((m) => (
            <div
              key={m.symbol}
              className="po-ticker-item"
              onClick={() => setSelectedMarket(m.symbol)}
            >
              <span className="po-ticker-sym">{m.symbol}</span>
              <span className="po-ticker-price">{m.price.toFixed(m.digits)}</span>
              <span className={`po-ticker-change ${m.change24h >= 0 ? 'up' : 'down'}`}>
                {m.change24h >= 0 ? '+' : ''}{m.change24h}%
              </span>
            </div>
          ))}
        </div>
        <div className="po-ribbon-right">
          <a
            href="https://t.me/sfcapitalfrx"
            target="_blank"
            rel="noopener noreferrer"
            className="po-ribbon-link"
          >
            <span>📱 Telegram: @sfcapitalfrx</span>
          </a>
          <span>·</span>
          <span>⚡ TradingView Webhook: {isLiveConnected ? 'Connected (Live)' : 'Active (200 OK)'}</span>
        </div>
      </div>

      {/* Main Terminal Header */}
      <header className="po-header">
        <div className="po-brand">
          <div className="po-brand-logo">SF✦</div>
          <div className="po-brand-text">
            <span className="po-brand-name">
              SF CAPITAL <span>FX</span>
            </span>
            <span className="po-brand-tag">PRO TRADING TERMINAL</span>
          </div>
        </div>

        {/* Header Asset Selector */}
        <div className="po-header-assets">
          {MARKETS.map((m) => (
            <button
              key={m.symbol}
              className={`po-asset-pill ${selectedMarket === m.symbol ? 'active' : ''}`}
              onClick={() => setSelectedMarket(m.symbol)}
            >
              <span>{m.symbol}</span>
              <span className="po-payout-badge">
                {m.symbol === 'XAUUSD' ? '95%' : m.symbol === 'BTCUSD' ? '92%' : m.symbol === 'EURUSD' ? '89%' : '88%'}
              </span>
            </button>
          ))}
        </div>

        {/* Account Controls */}
        <div className="po-header-right">
          <div className="po-balance-box">
            <div className="po-balance-info">
              <span className="po-balance-type">
                {accountType === 'DEMO' ? '🟢 DEMO ACCOUNT' : '★ VIP REAL'}
              </span>
              <span className="po-balance-amount">
                ${accountType === 'DEMO' ? demoBalance.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '24,580.00'}
              </span>
            </div>
            <button
              className="po-btn-step"
              onClick={() => setAccountType(accountType === 'DEMO' ? 'LIVE' : 'DEMO')}
              title="Switch Demo / Live"
            >
              ⇄
            </button>
          </div>

          <button className="po-btn-vip-gold" onClick={() => setActiveModal('vip')}>
            👑 UPGRADE VIP
          </button>

          {user?.role === 'admin' && (
            <button
              className="po-btn-icon"
              onClick={() => setActiveModal('admin')}
              title="Admin Console"
            >
              ⚙
            </button>
          )}

          <button
            className="po-btn-icon"
            onClick={() => setActiveModal('auth')}
            title="User Account"
          >
            👤
          </button>
        </div>
      </header>

      {/* MAIN TRADING ARENA (POCKET OPTION SPLIT TERMINAL) */}
      <main className="po-workspace">
        {/* Left: Full-Screen Interactive Candlestick Chart */}
        <TradingChart
          market={currentMarket}
          signal={activeSignal}
          currentPrice={livePrice}
          onPriceChange={(price) => setLivePrice(price)}
        />

        {/* Right: Pocket Option Order & Signal Execution Panel */}
        <aside className="po-order-panel">
          <div className="po-panel-header">
            <span className="po-panel-title">
              ⚡ SIGNAL EXECUTION
            </span>
            <span className="po-winrate-chip">94.8% WIN RATE</span>
          </div>

          {/* Trade Amount Box */}
          <div className="po-input-group">
            <div className="po-input-label">
              <span>Investment Amount</span>
              <span>USD</span>
            </div>
            <div className="po-input-box">
              <button
                className="po-btn-step"
                onClick={() => setTradeAmount(Math.max(10, tradeAmount - 25))}
              >
                -
              </button>
              <span>${tradeAmount}</span>
              <button
                className="po-btn-step"
                onClick={() => setTradeAmount(tradeAmount + 25)}
              >
                +
              </button>
            </div>
          </div>

          {/* Payout Return Calculation Box */}
          <div className="po-payout-box">
            <span className="po-payout-label">Payout Return (88%):</span>
            <span className="po-payout-val">
              +${(tradeAmount * 1.88).toFixed(2)}
            </span>
          </div>

          {/* HIGH-IMPACT CALL / PUT BUTTONS (POCKET OPTION SIGNATURE) */}
          <div className="po-action-buttons">
            <button
              className="po-btn-trade call"
              onClick={() => handleExecuteTrade('CALL')}
            >
              <div className="po-trade-copy">
                <span className="po-trade-title">CALL / BUY</span>
                <span className="po-trade-subtitle">Higher Price Target ▲</span>
              </div>
              <span className="po-trade-icon">▲</span>
            </button>

            <button
              className="po-btn-trade put"
              onClick={() => handleExecuteTrade('PUT')}
            >
              <div className="po-trade-copy">
                <span className="po-trade-title">PUT / SELL</span>
                <span className="po-trade-subtitle">Lower Price Target ▼</span>
              </div>
              <span className="po-trade-icon">▼</span>
            </button>
          </div>

          {/* Active TradingView Signal Card for this asset */}
          {activeSignal ? (
            <div className="po-signal-preview-box">
              <div className="po-preview-header">
                <span className="po-preview-pair">#{activeSignal.pair} {activeSignal.timeframe}</span>
                <span className={`po-preview-status ${activeSignal.status.toLowerCase()}`}>
                  {activeSignal.status}
                </span>
              </div>

              <div className="po-targets-list">
                <div className="po-target-row">
                  <span>Entry: {activeSignal.entry}</span>
                  <span style={{ color: '#00d4ff' }}>{activeSignal.direction}</span>
                </div>
                <div className="po-target-row">
                  <span>Stop Loss: {activeSignal.sl}</span>
                  <span style={{ color: '#ff3358' }}>SL</span>
                </div>
                <div className={`po-target-row ${activeSignal.status.includes('TP1') || activeSignal.status.includes('TP2') || activeSignal.status.includes('TP3') ? 'hit' : ''}`}>
                  <span>Target 1: {activeSignal.tp1}</span>
                  <span>{activeSignal.status.includes('TP1') ? '✓ HIT' : 'PENDING'}</span>
                </div>
                <div className="po-target-bar-bg">
                  <div
                    className="po-target-bar-fill"
                    style={{
                      width: activeSignal.status === 'TP3_HIT' ? '100%' : activeSignal.status === 'TP2_HIT' ? '66%' : activeSignal.status === 'TP1_HIT' ? '33%' : '15%',
                    }}
                  />
                </div>
              </div>

              <button
                className="po-btn-copy-signal"
                onClick={() => handleCopy(activeSignal)}
              >
                📋 Copy Signal Payload
              </button>
            </div>
          ) : (
            <div className="po-signal-preview-box" style={{ textAlign: 'center', color: '#56697a' }}>
              <span>Awaiting next TradingView alert for {currentMarket.symbol}...</span>
            </div>
          )}
        </aside>
      </main>

      {/* LIVE SIGNALS & TRADES MATRIX */}
      <section className="po-signals-section" id="signals">
        <div className="po-section-header">
          <div className="po-section-title-wrap">
            <div className="po-section-icon">📡</div>
            <div>
              <h2 className="po-section-heading">Verified TradingView Signal Feed</h2>
              <span className="po-section-subtext">Real-time alerts with TP1–TP3 milestones and Telegram VIP fan-out</span>
            </div>
          </div>

          <div className="po-filter-tabs">
            {(['ALL', 'ACTIVE', 'CLOSED', 'VIP'] as const).map((filter) => (
              <button
                key={filter}
                className={`po-filter-btn ${statusFilter === filter ? 'active' : ''}`}
                onClick={() => setStatusFilter(filter)}
              >
                {filter === 'ALL' ? 'All Setups' : filter === 'ACTIVE' ? 'Active (Live)' : filter === 'CLOSED' ? 'Closed Trades' : 'VIP Only'}
              </button>
            ))}
          </div>
        </div>

        <div className="po-signals-grid">
          {filteredSignals.map((s) => {
            const isLocked = s.isPremiumOnly && user?.membershipStatus !== 'PREMIUM'
            return (
              <div key={s.id} className={`po-signal-card ${isLocked ? 'po-locked-card' : ''}`}>
                {isLocked && (
                  <div className="po-locked-overlay">
                    <span className="po-locked-crown">👑</span>
                    <span className="po-locked-title">VIP PRO SIGNAL LOCKED</span>
                    <span className="po-locked-sub">Exclusive high-conviction breakout signal reserved for VIP members.</span>
                    <button className="po-btn-unlock-vip" onClick={() => setActiveModal('vip')}>
                      Unlock for $49/mo
                    </button>
                  </div>
                )}

                <div className="po-card-top">
                  <div className="po-card-pair-block">
                    <span className="po-card-pair">{s.pair}</span>
                    <span className="po-card-tf">{s.timeframe}</span>
                  </div>
                  <span className={`po-card-badge-direction ${s.direction.toLowerCase()}`}>
                    {s.direction === 'BUY' ? '▲ BUY / CALL' : '▼ SELL / PUT'}
                  </span>
                </div>

                {/* Price Matrix */}
                <div className="po-card-prices">
                  <div className="po-price-col">
                    <span className="po-price-label">ENTRY</span>
                    <span className="po-price-number">{s.entry}</span>
                  </div>
                  <div className="po-price-col">
                    <span className="po-price-label">STOP LOSS</span>
                    <span className="po-price-number sl">{s.sl}</span>
                  </div>
                  <div className="po-price-col">
                    <span className="po-price-label">TARGET 1</span>
                    <span className="po-price-number tp1">{s.tp1}</span>
                  </div>
                  <div className="po-price-col">
                    <span className="po-price-label">TARGET 3</span>
                    <span className="po-price-number tp3">{s.tp3}</span>
                  </div>
                </div>

                {/* Milestones Progress Track */}
                <div className="po-card-milestones">
                  <div className="po-milestone-node">
                    <div className="po-node-dot hit">✓</div>
                    <span className="po-node-text hit">ENTRY</span>
                  </div>
                  <div className="po-milestone-node">
                    <div className={`po-node-dot ${s.status.includes('TP1') || s.status.includes('TP2') || s.status.includes('TP3') || s.status === 'CLOSED' ? 'hit' : 'active'}`}>
                      {s.status.includes('TP1') || s.status.includes('TP2') || s.status.includes('TP3') || s.status === 'CLOSED' ? '✓' : '1'}
                    </div>
                    <span className="po-node-text">TP1</span>
                  </div>
                  <div className="po-milestone-node">
                    <div className={`po-node-dot ${s.status.includes('TP2') || s.status.includes('TP3') || s.status === 'CLOSED' ? 'hit' : ''}`}>
                      {s.status.includes('TP2') || s.status.includes('TP3') || s.status === 'CLOSED' ? '✓' : '2'}
                    </div>
                    <span className="po-node-text">TP2</span>
                  </div>
                  <div className="po-milestone-node">
                    <div className={`po-node-dot ${s.status.includes('TP3') ? 'hit' : ''}`}>
                      {s.status.includes('TP3') ? '✓' : '3'}
                    </div>
                    <span className="po-node-text">TP3</span>
                  </div>
                </div>

                {/* Card Footer */}
                <div className="po-card-footer">
                  <span>{formatDate(s.time)}</span>
                  <span className={`po-card-pnl ${(s.pnlPips || 0) >= 0 ? 'profit' : 'loss'}`}>
                    {(s.pnlPips || 0) >= 0 ? `+${s.pnlPips} pips` : `${s.pnlPips} pips`}
                  </span>
                  <button
                    className="po-btn-step"
                    style={{ width: 'auto', padding: '0 8px', fontSize: '10px' }}
                    onClick={() => handleCopy(s)}
                    title="Copy Signal"
                  >
                    COPY
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* PERFORMANCE & ANALYTICS DIALS */}
      <section className="po-analytics-section" id="performance">
        <div className="po-stats-grid">
          <div className="po-stat-card">
            <div className="po-stat-top">
              <span className="po-stat-label">WIN RATE</span>
              <span className="po-stat-icon">🎯</span>
            </div>
            <span className="po-stat-value green">{stats.winRate}%</span>
            <span className="po-stat-foot">Based on {stats.totalTrades} closed signals</span>
          </div>

          <div className="po-stat-card">
            <div className="po-stat-top">
              <span className="po-stat-label">TOTAL PIPS GAINED</span>
              <span className="po-stat-icon">📈</span>
            </div>
            <span className="po-stat-value cyan">+{stats.totalPips.toLocaleString()}</span>
            <span className="po-stat-foot">Gold, Bitcoin, Oil & Majors</span>
          </div>

          <div className="po-stat-card">
            <div className="po-stat-top">
              <span className="po-stat-label">PROFIT FACTOR</span>
              <span className="po-stat-icon">⚡</span>
            </div>
            <span className="po-stat-value gold">{stats.profitFactor}</span>
            <span className="po-stat-foot">Risk-adjusted return multiplier</span>
          </div>

          <div className="po-stat-card">
            <div className="po-stat-top">
              <span className="po-stat-label">ACTIVE VIP TRADERS</span>
              <span className="po-stat-icon">👥</span>
            </div>
            <span className="po-stat-value">2,418</span>
            <span className="po-stat-foot">Live Telegram VIP Subscribers</span>
          </div>
        </div>
      </section>

      {/* VIP MEMBERSHIP PLANS */}
      <section className="po-pricing-section" id="pricing">
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <h2 className="po-section-heading" style={{ fontSize: 26 }}>Institutional Grade Signal Plans</h2>
          <span className="po-section-subtext">Automated Pine Script webhook alerts sent simultaneously to Web & Telegram</span>
        </div>

        <div className="po-pricing-grid">
          {/* Starter Plan */}
          <div className="po-plan-card">
            <h3 className="po-plan-name">Free Starter</h3>
            <div className="po-plan-price">
              $0 <span>/ forever</span>
            </div>
            <ul className="po-plan-features">
              <li><span className="check">✓</span> 1–2 Signals Daily</li>
              <li><span className="check">✓</span> Target 1 (TP1) Access</li>
              <li><span className="check">✓</span> Public Telegram Channel</li>
              <li><span className="check">✓</span> 15-Minute Alert Delay</li>
            </ul>
            <button className="po-btn-plan" onClick={() => showToast('You are on Free Starter Plan')}>
              Current Tier
            </button>
          </div>

          {/* Pro VIP Plan */}
          <div className="po-plan-card featured">
            <span className="po-plan-badge">MOST POPULAR</span>
            <h3 className="po-plan-name">VIP Pro</h3>
            <div className="po-plan-price">
              $49 <span>/ month</span>
            </div>
            <ul className="po-plan-features">
              <li><span className="check">✓</span> 8–15 Daily High-Conviction Signals</li>
              <li><span className="check">✓</span> Instant 0ms Telegram Push</li>
              <li><span className="check">✓</span> All Target Milestones (TP1, TP2, TP3)</li>
              <li><span className="check">✓</span> Gold, Crypto, Oil & Forex Pairs</li>
              <li><span className="check">✓</span> Automated SL-to-BE Move Alerts</li>
              <li><span className="check">✓</span> Risk Management Calculator</li>
            </ul>
            <button className="po-btn-plan primary" onClick={handleUpgradeVIP}>
              ⚡ Instant 30-Day VIP Activation
            </button>
          </div>

          {/* Elite Lifetime Plan */}
          <div className="po-plan-card">
            <span className="po-plan-badge gold">LIFETIME</span>
            <h3 className="po-plan-name">Elite Institutional</h3>
            <div className="po-plan-price">
              $299 <span>/ one-time</span>
            </div>
            <ul className="po-plan-features">
              <li><span className="check">✓</span> Lifetime VIP Channel Access</li>
              <li><span className="check">✓</span> TradingView Pine Script Indicator Key</li>
              <li><span className="check">✓</span> Custom Webhook Endpoint Integration</li>
              <li><span className="check">✓</span> 1-on-1 Risk Strategy Consultation</li>
              <li><span className="check">✓</span> Priority VIP Support 24/7</li>
            </ul>
            <button className="po-btn-plan" onClick={() => setActiveModal('vip')}>
              Get Elite Lifetime
            </button>
          </div>
        </div>
      </section>

      {/* TRADINGVIEW & TELEGRAM INTEGRATION DOCK */}
      <section className="po-integration-dock">
        <div className="po-dock-grid">
          {/* TradingView Webhook Card */}
          <div className="po-dock-card">
            <div className="po-dock-header">
              <div className="po-dock-title">
                <span>⚡ TradingView Webhook Endpoint</span>
              </div>
              <span className="po-dock-badge tv">ACTIVE</span>
            </div>
            <p style={{ fontSize: 12, color: '#8e9fab', margin: 0 }}>
              Connect your TradingView Pine Script alerts directly to SF CAPITAL FX for zero-latency fan-out:
            </p>
            <div className="po-code-box">
              <code>https://sfcapitalsf.netlify.app/api/webhooks/tradingview</code>
              <button
                className="po-btn-step"
                style={{ width: 'auto', padding: '0 8px', fontSize: 10 }}
                onClick={() => {
                  copyToClipboard('https://sfcapitalsf.netlify.app/api/webhooks/tradingview')
                  showToast('✓ Webhook URL copied!')
                }}
              >
                COPY
              </button>
            </div>
          </div>

          {/* Telegram Channel Card */}
          <div className="po-dock-card">
            <div className="po-dock-header">
              <div className="po-dock-title">
                <span>📱 Telegram VIP Bot & Channel</span>
              </div>
              <span className="po-dock-badge tg">CONNECTED</span>
            </div>
            <p style={{ fontSize: 12, color: '#8e9fab', margin: 0 }}>
              Automated signals with formatted TP/SL targets are broadcasted directly to our Telegram community:
            </p>
            <div className="po-code-box">
              <code>Channel: @sfcapitalfrx · Bot: @SFCapitalFxbot</code>
              <a
                href="https://t.me/sfcapitalfrx"
                target="_blank"
                rel="noopener noreferrer"
                className="po-btn-step"
                style={{ width: 'auto', padding: '0 8px', fontSize: 10 }}
              >
                JOIN
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="po-footer">
        <div>
          <strong>SF CAPITAL FX</strong> · Automated Trading Infrastructure © 2026. All rights reserved.
        </div>
        <div className="po-footer-links">
          <a href="#signals">Signals</a>
          <a href="#pricing">VIP Plans</a>
          <a href="https://t.me/sfcapitalfrx" target="_blank" rel="noopener noreferrer">Telegram VIP</a>
          <a href="https://github.com/vatpro8-png/Forex-Trade" target="_blank" rel="noopener noreferrer">GitHub</a>
        </div>
      </footer>

      {/* AUTH MODAL */}
      {activeModal === 'auth' && (
        <div className="po-modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="po-modal" onClick={(e) => e.stopPropagation()}>
            <button className="po-modal-close" onClick={() => setActiveModal(null)}>✕</button>
            <h3 className="po-modal-title">Trader Account</h3>
            <p className="po-modal-desc">Sign in or register to track your custom signals and manage VIP membership.</p>
            <form onSubmit={handleAuthSubmit}>
              <div className="po-form-group">
                <label className="po-form-label">Full Name</label>
                <input
                  type="text"
                  className="po-form-input"
                  placeholder="John Trader"
                  value={authName}
                  onChange={(e) => setAuthName(e.target.value)}
                />
              </div>
              <div className="po-form-group">
                <label className="po-form-label">Email Address</label>
                <input
                  type="email"
                  className="po-form-input"
                  placeholder="trader@sfcapitalfx.com"
                  required
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                />
              </div>
              <div className="po-form-group">
                <label className="po-form-label">Password</label>
                <input
                  type="password"
                  className="po-form-input"
                  placeholder="••••••••"
                  required
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                />
              </div>
              <button type="submit" className="po-btn-submit">
                Sign In / Register
              </button>
            </form>
          </div>
        </div>
      )}

      {/* VIP MODAL */}
      {activeModal === 'vip' && (
        <div className="po-modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="po-modal" onClick={(e) => e.stopPropagation()}>
            <button className="po-modal-close" onClick={() => setActiveModal(null)}>✕</button>
            <h3 className="po-modal-title">👑 Activate SF CAPITAL FX VIP</h3>
            <p className="po-modal-desc">
              Get unlimited access to high-probability Forex, Gold, and Crypto signals with zero latency.
            </p>
            <div style={{ background: '#111a24', padding: 16, borderRadius: 10, border: '1px solid #1d2d42', marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontWeight: 700 }}>VIP Monthly Pass</span>
                <span style={{ color: '#00e676', fontWeight: 800 }}>$49.00 USD</span>
              </div>
              <div style={{ fontSize: 12, color: '#8e9fab' }}>
                • Instant unmasking of all TP1–TP3 targets<br />
                • Automated Telegram broadcast push<br />
                • Real-time TradingView Pine Script alerts
              </div>
            </div>
            <button className="po-btn-submit" onClick={handleUpgradeVIP}>
              ⚡ Instant 30-Day VIP Activation
            </button>
          </div>
        </div>
      )}

      {/* ADMIN CONSOLE MODAL */}
      {activeModal === 'admin' && (
        <AdminConsole
          signals={signals}
          user={user}
          onClose={() => setActiveModal(null)}
          onAddSignal={(s) => setSignals((prev) => [s, ...prev])}
          onUpdateStatus={(id, status) => {
            setSignals((prev) =>
              prev.map((s) => (s.id === id ? { ...s, status } : s))
            )
          }}
          onToggleUserTier={(status) => {
            if (user) setUser({ ...user, membershipStatus: status })
          }}
          onToast={showToast}
        />
      )}
    </div>
  )
}
