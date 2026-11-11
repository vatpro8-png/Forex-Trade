import React, { useState, useEffect, useMemo } from 'react'
import type { Signal, User, SignalStatus } from './model/types'
import { MARKETS } from './model/symbols'
import { INITIAL_SIGNALS } from './data/mockSignals'
import { formatDate, copyToClipboard } from './model/format'
import { TradingChart } from './components/TradingChart'
import { AdminConsole } from './components/AdminConsole'

export const App: React.FC = () => {
  const [signals, setSignals] = useState<Signal[]>(INITIAL_SIGNALS)
  const [selectedMarket, setSelectedMarket] = useState<string>('XAUUSD')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'CLOSED' | 'VIP'>('ALL')
  const demoBalance = 10000.0
  const [tradeAmount, setTradeAmount] = useState<number>(100)
  const [livePrice, setLivePrice] = useState<number>(2686.5)
  const webhookUrl = `${window.location.origin}/api/webhooks/tradingview`

  const [user, setUser] = useState<User | null>(null)

  const [activeModal, setActiveModal] = useState<'auth' | 'vip' | 'admin' | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [isLiveConnected, setIsLiveConnected] = useState(false)

  // Auth inputs
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authName, setAuthName] = useState('')
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [authError, setAuthError] = useState<string | null>(null)
  const [isAuthenticating, setIsAuthenticating] = useState(false)

  const showToast = (message: string) => {
    setToastMessage(message)
    setTimeout(() => {
      setToastMessage((current) => (current === message ? null : current))
    }, 3200)
  }

  // Fetch live signals from API
  const fetchSignals = async () => {
    try {
      const token = localStorage.getItem('sf-session-token')
      const response = await fetch('/api/signals', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
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
            pnlPips: Number.isFinite(Number(item.pnlPips)) ? Number(item.pnlPips) : undefined,
          }))
          setSignals(mapped)
          setIsLiveConnected(true)
          return
        }
      }
      setIsLiveConnected(false)
    } catch {
      setIsLiveConnected(false)
    }
  }

  useEffect(() => {
    const token = localStorage.getItem('sf-session-token')
    if (!token) return

    let isCurrent = true
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        if (!response.ok) throw new Error('Session expired')
        return response.json()
      })
      .then((data) => {
        if (isCurrent) setUser(data.user)
      })
      .catch(() => {
        localStorage.removeItem('sf-session-token')
      })

    return () => {
      isCurrent = false
    }
  }, [])

  useEffect(() => {
    fetchSignals()
    const interval = setInterval(fetchSignals, 25000)
    return () => {
      clearInterval(interval)
    }
  }, [])

  // Market info
  const currentMarket = useMemo(() => {
    return MARKETS.find((m) => m.symbol === selectedMarket) || MARKETS[0]
  }, [selectedMarket])

  // Featured signal for the selected market
  const activeSignal = useMemo(() => {
    const accessibleSignals = signals.filter(
      (signal) => !signal.isPremiumOnly || user?.membershipStatus === 'PREMIUM' || user?.role === 'admin'
    )
    return (
      accessibleSignals.find(
        (s) => s.pair === currentMarket.symbol && (s.status === 'ACTIVE' || s.status.includes('TP'))
      ) ||
      accessibleSignals.find((s) => s.pair === currentMarket.symbol) ||
      null
    )
  }, [signals, currentMarket, user])

  const tp1RiskMultiple = activeSignal && activeSignal.entry !== activeSignal.sl
    ? Math.abs(activeSignal.tp1 - activeSignal.entry) / Math.abs(activeSignal.entry - activeSignal.sl)
    : null

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
    const winningSignals = closed.filter((s) => (s.pnlPips || 0) > 0)
    const losingSignals = closed.filter((s) => (s.pnlPips || 0) < 0)
    const grossProfit = winningSignals.reduce((total, s) => total + (s.pnlPips || 0), 0)
    const grossLoss = losingSignals.reduce((total, s) => total + Math.abs(s.pnlPips || 0), 0)
    return {
      winRate: closed.length ? Number(((winningSignals.length / closed.length) * 100).toFixed(1)) : null,
      totalPips: closed.reduce((total, s) => total + (s.pnlPips || 0), 0),
      totalTrades: closed.length,
      profitFactor: grossLoss ? Number((grossProfit / grossLoss).toFixed(2)) : null,
    }
  }, [signals])

  // The interface has no connected broker; this action never places a real order.
  const handleExecuteTrade = (direction: 'BUY' | 'SELL') => {
    showToast(`${direction} paper simulation only for ${currentMarket.symbol}; no broker is connected.`)
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
${window.location.origin}`
    const ok = await copyToClipboard(text)
    if (ok) showToast(`✓ Copied ${s.pair} ${s.direction} signal to clipboard!`)
  }

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError(null)
    setIsAuthenticating(true)
    try {
      const response = await fetch(`/api/auth/${authMode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: authEmail,
          password: authPassword,
          ...(authMode === 'register' && authName ? { name: authName } : {}),
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to authenticate.')
      localStorage.setItem('sf-session-token', data.token)
      setUser(data.user)
      void fetchSignals()
      setAuthPassword('')
      setActiveModal(null)
      showToast(`Signed in as ${data.user.email}`)
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to authenticate.')
    } finally {
      setIsAuthenticating(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('sf-session-token')
    setUser(null)
    void fetchSignals()
    setActiveModal(null)
    showToast('Signed out')
  }

  return (
    <div className="po-platform">
      <div className={`po-toast ${toastMessage ? 'show' : ''}`}>
        <span>{toastMessage}</span>
      </div>

      {/* Top Ticker Tape Ribbon (Pocket Option style) */}
      <div className="po-top-ribbon">
        <div className="po-ribbon-left">
          <div className="po-live-pulse-badge">
            <span className="po-pulse-dot"></span>
            <span>REFERENCE MARKET DATA</span>
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
          <span>Signal API: {isLiveConnected ? 'Connected · 25s refresh' : 'Offline · sample feed'}</span>
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
                {m.category}
              </span>
            </button>
          ))}
        </div>

        {/* Account Controls */}
        <div className="po-header-right">
          <div className="po-balance-box">
            <div className="po-balance-info">
              <span className="po-balance-type">DEMO SIMULATION</span>
              <span className="po-balance-amount">
                ${demoBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>
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
              PAPER TRADE SIMULATOR
            </span>
            <span className="po-winrate-chip">NO BROKER</span>
          </div>

          {/* Trade Amount Box */}
          <div className="po-input-group">
            <div className="po-input-label">
              <span>Risk Budget · Demo</span>
              <span>USD</span>
            </div>
            <div className="po-input-box">
              <button
                className="po-btn-step"
                onClick={() => setTradeAmount((amount) => Math.max(1, amount - 25))}
              >
                -
              </button>
              <span>${tradeAmount}</span>
              <button
                className="po-btn-step"
                onClick={() => setTradeAmount((amount) => Math.min(Math.max(1, Math.floor(demoBalance * 0.02)), amount + 25))}
              >
                +
              </button>
            </div>
          </div>

          {/* Payout Return Calculation Box */}
          <div className="po-payout-box">
            <span className="po-payout-label">Illustrative TP1 reward:</span>
            <span className="po-payout-val">
              {tp1RiskMultiple === null ? 'N/A' : `+$${(tradeAmount * tp1RiskMultiple).toFixed(2)}`}
            </span>
          </div>

          {/* HIGH-IMPACT CALL / PUT BUTTONS (POCKET OPTION SIGNATURE) */}
          <div className="po-action-buttons">
            <button
              className="po-btn-trade call"
              onClick={() => handleExecuteTrade('BUY')}
            >
              <div className="po-trade-copy">
                <span className="po-trade-title">SIMULATE BUY</span>
                <span className="po-trade-subtitle">Paper only · no order routed</span>
              </div>
              <span className="po-trade-icon">▲</span>
            </button>

            <button
              className="po-btn-trade put"
              onClick={() => handleExecuteTrade('SELL')}
            >
              <div className="po-trade-copy">
                <span className="po-trade-title">SIMULATE SELL</span>
                <span className="po-trade-subtitle">Paper only · no order routed</span>
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
              <h2 className="po-section-heading">TradingView Signal Feed</h2>
              <span className="po-section-subtext">Backend updates poll every 25 seconds; sample records remain visible when offline.</span>
            </div>
          </div>

          <div className="po-filter-tabs">
            {(['ALL', 'ACTIVE', 'CLOSED', 'VIP'] as const).map((filter) => (
              <button
                key={filter}
                className={`po-filter-btn ${statusFilter === filter ? 'active' : ''}`}
                onClick={() => setStatusFilter(filter)}
              >
                {filter === 'ALL' ? 'All Setups' : filter === 'ACTIVE' ? 'Active' : filter === 'CLOSED' ? 'Closed Trades' : 'VIP Only'}
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
        <div className="po-section-header">
          <h2 className="po-section-heading">Signal Record Analytics</h2>
          <span className="po-section-subtext">Calculated from closed records currently loaded; results are not independently audited.</span>
        </div>
        <div className="po-stats-grid">
          <div className="po-stat-card">
            <div className="po-stat-top">
              <span className="po-stat-label">WIN RATE</span>
              <span className="po-stat-icon">🎯</span>
            </div>
            <span className="po-stat-value green">{stats.winRate === null ? 'N/A' : `${stats.winRate}%`}</span>
            <span className="po-stat-foot">Based on {stats.totalTrades} closed signals</span>
          </div>

          <div className="po-stat-card">
            <div className="po-stat-top">
              <span className="po-stat-label">TOTAL PIPS GAINED</span>
              <span className="po-stat-icon">📈</span>
            </div>
            <span className="po-stat-value cyan">{stats.totalPips > 0 ? '+' : ''}{stats.totalPips.toLocaleString()}</span>
            <span className="po-stat-foot">Closed signal records only</span>
          </div>

          <div className="po-stat-card">
            <div className="po-stat-top">
              <span className="po-stat-label">PROFIT FACTOR</span>
              <span className="po-stat-icon">⚡</span>
            </div>
            <span className="po-stat-value gold">{stats.profitFactor === null ? 'N/A' : stats.profitFactor}</span>
            <span className="po-stat-foot">Gross pips won ÷ gross pips lost</span>
          </div>

          <div className="po-stat-card">
            <div className="po-stat-top">
              <span className="po-stat-label">CLOSED RECORDS</span>
              <span className="po-stat-icon">👥</span>
            </div>
            <span className="po-stat-value">{stats.totalTrades}</span>
            <span className="po-stat-foot">In the currently loaded feed</span>
          </div>
        </div>
      </section>

      {/* VIP MEMBERSHIP PLANS */}
      <section className="po-pricing-section" id="pricing">
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <h2 className="po-section-heading" style={{ fontSize: 26 }}>Membership Plans</h2>
          <span className="po-section-subtext">Published rates are shown for reference. Online checkout is not configured; VIP access is activated after manual payment verification.</span>
        </div>

        <div className="po-pricing-grid">
          {/* Starter Plan */}
          <div className="po-plan-card">
            <h3 className="po-plan-name">Free Starter</h3>
            <div className="po-plan-price">
              $0 <span>/ forever</span>
            </div>
            <ul className="po-plan-features">
              <li><span className="check">✓</span> Selected public signals</li>
              <li><span className="check">✓</span> TP1 access</li>
              <li><span className="check">✓</span> Signal feed access</li>
            </ul>
            <button className="po-btn-plan" onClick={() => showToast('You are on Free Starter Plan')}>
              Current Tier
            </button>
          </div>

          {/* Pro VIP Plan */}
          <div className="po-plan-card featured">
            <h3 className="po-plan-name">VIP Pro</h3>
            <div className="po-plan-price">
              $49 <span>/ 30 days</span>
            </div>
            <ul className="po-plan-features">
              <li><span className="check">✓</span> Full TP1–TP3 signal levels</li>
              <li><span className="check">✓</span> Premium signal access</li>
              <li><span className="check">✓</span> Telegram delivery when configured</li>
              <li><span className="check">✓</span> 30-day access after verification</li>
            </ul>
            <button className="po-btn-plan primary" onClick={() => setActiveModal('vip')}>
              Membership details
            </button>
          </div>

          {/* Custom Plan */}
          <div className="po-plan-card">
            <h3 className="po-plan-name">Custom</h3>
            <div className="po-plan-price">
              Quote <span>before payment</span>
            </div>
            <ul className="po-plan-features">
              <li><span className="check">✓</span> Scope and delivery agreed in advance</li>
              <li><span className="check">✓</span> Written quote before payment</li>
              <li><span className="check">✓</span> No lifetime promise</li>
            </ul>
            <button className="po-btn-plan" onClick={() => setActiveModal('vip')}>
              Contact for a quote
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
              <span className={`po-dock-badge tv ${isLiveConnected ? 'connected' : ''}`}>{isLiveConnected ? 'API REACHABLE' : 'NOT CONNECTED'}</span>
            </div>
            <p style={{ fontSize: 12, color: '#8e9fab', margin: 0 }}>
              Alerts are stored and distributed only when a persistent backend is configured and reachable.
            </p>
            <div className="po-code-box">
              <code>{webhookUrl}</code>
              <button
                className="po-btn-step"
                style={{ width: 'auto', padding: '0 8px', fontSize: 10 }}
                onClick={() => {
                  copyToClipboard(webhookUrl)
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
              <span className="po-dock-badge tg">CONFIGURATION-DEPENDENT</span>
            </div>
            <p style={{ fontSize: 12, color: '#8e9fab', margin: 0 }}>
              Telegram delivery requires SF_TELEGRAM_BOT_TOKEN and SF_TELEGRAM_CHAT_ID on the backend.
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
            {user ? (
              <>
                <p className="po-modal-desc">Signed in as {user.email}. Membership: {user.membershipStatus}.</p>
                <button className="po-btn-submit" onClick={handleLogout}>Sign out</button>
              </>
            ) : (
              <>
                <p className="po-modal-desc">Sign in or create an account to access membership-gated signals.</p>
                <div className="po-filter-tabs auth-tabs" role="tablist" aria-label="Account access">
                  <button type="button" className={`po-filter-btn ${authMode === 'login' ? 'active' : ''}`} onClick={() => { setAuthMode('login'); setAuthError(null) }}>Sign in</button>
                  <button type="button" className={`po-filter-btn ${authMode === 'register' ? 'active' : ''}`} onClick={() => { setAuthMode('register'); setAuthError(null) }}>Create account</button>
                </div>
                <form onSubmit={handleAuthSubmit}>
                  {authMode === 'register' && (
                    <div className="po-form-group">
                      <label className="po-form-label" htmlFor="auth-name">Full Name</label>
                      <input id="auth-name" type="text" className="po-form-input" autoComplete="name" value={authName} onChange={(e) => setAuthName(e.target.value)} />
                    </div>
                  )}
                  <div className="po-form-group">
                    <label className="po-form-label" htmlFor="auth-email">Email Address</label>
                    <input id="auth-email" type="email" className="po-form-input" autoComplete="email" required value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} />
                  </div>
                  <div className="po-form-group">
                    <label className="po-form-label" htmlFor="auth-password">Password</label>
                    <input id="auth-password" type="password" className="po-form-input" autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} minLength={8} required value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} />
                  </div>
                  {authError && <p className="po-form-error" role="alert">{authError}</p>}
                  <button type="submit" className="po-btn-submit" disabled={isAuthenticating}>
                    {isAuthenticating ? 'Please wait…' : authMode === 'login' ? 'Sign in' : 'Create account'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {/* VIP MODAL */}
      {activeModal === 'vip' && (
        <div className="po-modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="po-modal" onClick={(e) => e.stopPropagation()}>
            <button className="po-modal-close" onClick={() => setActiveModal(null)}>✕</button>
            <h3 className="po-modal-title">VIP Pro · $49 / 30 days</h3>
            <p className="po-modal-desc">
              Checkout is not available on this site. Contact the Telegram channel for current payment instructions; VIP access is enabled only after manual verification.
            </p>
            <div style={{ background: '#111a24', padding: 16, borderRadius: 10, border: '1px solid #1d2d42', marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontWeight: 700 }}>VIP Pro · 30-day access</span>
                <span style={{ color: '#00e676', fontWeight: 800 }}>$49.00 USD</span>
              </div>
              <div style={{ fontSize: 12, color: '#8e9fab' }}>
                • Full TP1–TP3 levels after activation<br />
                • Telegram delivery when configured<br />
                • No automatic renewal or payment capture here
              </div>
            </div>
            <a className="po-btn-submit" href="https://t.me/sfcapitalfrx" target="_blank" rel="noopener noreferrer">
              Open Telegram channel
            </a>
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
          onUpdateSignal={(updatedSignal) => {
            setSignals((prev) => prev.map((signal) => (signal.id === updatedSignal.id ? updatedSignal : signal)))
          }}
          onToast={showToast}
        />
      )}
    </div>
  )
}
