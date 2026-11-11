import React, { useState, useEffect, useMemo } from 'react'
import type { MembershipPlan, Signal, User, SignalStatus } from './model/types'
import { MARKETS } from './model/symbols'
import { INITIAL_SIGNALS } from './data/mockSignals'
import { MEMBERSHIP_PLANS } from './model/pricing'
import { formatDate, formatPrice, formatPips, parseOptionalNumber, copyToClipboard } from './model/format'
import { TradingChart } from './components/TradingChart'
import { AdminConsole } from './components/AdminConsole'

interface PaperOrder {
  id: string
  pair: string
  direction: 'BUY' | 'SELL'
  entryRef: number
  riskUsd: number
  time: string
}

const RISK_PRESETS = [25, 50, 100, 200]

export const App: React.FC = () => {
  const [signals, setSignals] = useState<Signal[]>(INITIAL_SIGNALS)
  const [plans, setPlans] = useState<MembershipPlan[]>(MEMBERSHIP_PLANS)
  const [selectedMarket, setSelectedMarket] = useState<string>('XAUUSD')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'CLOSED' | 'VIP'>('ALL')
  const demoBalance = 10000.0
  const maxRiskPerTrade = Math.max(1, Math.floor(demoBalance * 0.02))
  const [tradeAmount, setTradeAmount] = useState<number>(100)
  const [livePrice, setLivePrice] = useState<number>(MARKETS[0].price)
  const [paperOrders, setPaperOrders] = useState<PaperOrder[]>([])
  const webhookUrl = `${window.location.origin}/api/webhooks/tradingview`

  const [user, setUser] = useState<User | null>(null)
  const [selectedVipPlan, setSelectedVipPlan] = useState<MembershipPlan>(MEMBERSHIP_PLANS[1])
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

  const currentMarket = useMemo(() => {
    return MARKETS.find((m) => m.symbol === selectedMarket) || MARKETS[0]
  }, [selectedMarket])

  useEffect(() => {
    setLivePrice(currentMarket.price)
  }, [currentMarket])

  // Fetch canonical pricing from backend if reachable
  useEffect(() => {
    let active = true
    fetch('/api/memberships/plans')
      .then(async (res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !Array.isArray(data?.plans) || data.plans.length === 0) return
        setPlans((prev) =>
          prev.map((localPlan) => {
            const serverPlan = data.plans.find((p: any) => p.slug === localPlan.slug)
            return serverPlan
              ? {
                  ...localPlan,
                  name: serverPlan.name || localPlan.name,
                  priceUsd: Number.isFinite(Number(serverPlan.priceUsd)) ? Number(serverPlan.priceUsd) : localPlan.priceUsd,
                  priceCents: Number.isFinite(Number(serverPlan.priceCents)) ? Number(serverPlan.priceCents) : localPlan.priceCents,
                  durationDays: Number.isFinite(Number(serverPlan.durationDays)) ? Number(serverPlan.durationDays) : localPlan.durationDays,
                }
              : localPlan
          })
        )
      })
      .catch(() => null)

    return () => {
      active = false
    }
  }, [])

  // Fetch live signals from API (preserving null server masks!)
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
            entry: parseOptionalNumber(item.entry),
            sl: parseOptionalNumber(item.sl),
            tp1: parseOptionalNumber(item.tp1),
            tp2: parseOptionalNumber(item.tp2),
            tp3: parseOptionalNumber(item.tp3),
            time: item.time || new Date().toISOString(),
            status: (item.status as SignalStatus) || 'ACTIVE',
            timeframe: item.timeframe || '15m',
            source: item.source || 'TradingView',
            isPremiumOnly: Boolean(item.isPremiumOnly),
            isLocked: Boolean(item.isLocked),
            isPartial: Boolean(item.isPartial),
            pnlPips: parseOptionalNumber(item.pnlPips),
            milestones: Array.isArray(item.milestones) ? item.milestones : undefined,
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

  // Featured accessible signal for the selected market chart
  const activeSignal = useMemo(() => {
    const hasPremiumAccess = user?.membershipStatus === 'PREMIUM' || user?.role === 'admin'
    const accessibleSignals = signals.filter(
      (signal) => !signal.isLocked && (!signal.isPremiumOnly || hasPremiumAccess)
    )
    return (
      accessibleSignals.find(
        (s) => s.pair === currentMarket.symbol && (s.status === 'ACTIVE' || s.status.includes('TP'))
      ) ||
      accessibleSignals.find((s) => s.pair === currentMarket.symbol) ||
      null
    )
  }, [signals, currentMarket, user])

  const tp1RiskMultiple =
    activeSignal &&
    activeSignal.entry !== null &&
    activeSignal.sl !== null &&
    activeSignal.tp1 !== null &&
    activeSignal.entry !== activeSignal.sl
      ? Math.abs(activeSignal.tp1 - activeSignal.entry) / Math.abs(activeSignal.entry - activeSignal.sl)
      : null

  // Filtered signals for the matrix
  const filteredSignals = useMemo(() => {
    return signals.filter((s) => {
      if (statusFilter === 'ACTIVE') return s.status === 'ACTIVE' || s.status.includes('TP')
      if (statusFilter === 'CLOSED') return s.status === 'CLOSED' || s.status === 'SL_HIT' || s.status === 'CANCELLED'
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

  // Paper simulation only; no live broker order is placed
  const handleExecuteTrade = (direction: 'BUY' | 'SELL') => {
    const order: PaperOrder = {
      id: `sim-${Date.now().toString().slice(-5)}`,
      pair: currentMarket.symbol,
      direction,
      entryRef: Number(livePrice.toFixed(currentMarket.digits)),
      riskUsd: tradeAmount,
      time: new Date().toLocaleTimeString('en-US', { hour12: false }),
    }
    setPaperOrders((prev) => [order, ...prev].slice(0, 4))
    showToast(`${direction} paper ticket logged (${currentMarket.symbol} @ $${tradeAmount} risk); no broker connected.`)
  }

  const handleFocusSignalOnChart = (pair: string) => {
    if (MARKETS.some((m) => m.symbol === pair)) {
      setSelectedMarket(pair)
      document.getElementById('terminal-chart')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else {
      showToast(`No interactive chart template for ${pair}.`)
    }
  }

  // Copy signal safely respecting masked targets
  const handleCopy = async (s: Signal) => {
    const isCardLocked = s.isLocked || (s.isPremiumOnly && user?.membershipStatus !== 'PREMIUM' && user?.role !== 'admin')
    if (isCardLocked) {
      showToast('Sign in with an active VIP membership to copy premium signal levels.')
      return
    }
    const text = `⚡ SF CAPITAL FX SIGNAL ⚡
Pair: #${s.pair}
Action: ${s.direction}
Timeframe: ${s.timeframe}
Entry: ${s.entry ?? 'VIP'}
Stop Loss: ${s.sl ?? 'VIP'}
TP1: ${s.tp1 ?? 'VIP'} | TP2: ${s.tp2 ?? 'VIP'} | TP3: ${s.tp3 ?? 'VIP'}
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

  const openPlanModal = (plan: MembershipPlan) => {
    setSelectedVipPlan(plan)
    setActiveModal('vip')
  }

  const getProgressPercent = (status: SignalStatus) => {
    if (status === 'TP3_HIT' || status === 'CLOSED') return 100
    if (status === 'TP2_HIT') return 66
    if (status === 'TP1_HIT') return 33
    if (status === 'SL_HIT' || status === 'CANCELLED') return 0
    return 12
  }

  return (
    <div className="po-platform">
      <div className={`po-toast ${toastMessage ? 'show' : ''}`} role="status">
        <span>{toastMessage}</span>
      </div>

      {/* Top Ticker Tape Ribbon */}
      <div className="po-top-ribbon">
        <div className="po-ribbon-left">
          <div className="po-live-pulse-badge">
            <span className="po-pulse-dot"></span>
            <span>REFERENCE MARKET DATA</span>
          </div>
          {MARKETS.map((m) => (
            <button
              key={m.symbol}
              type="button"
              className="po-ticker-item"
              onClick={() => setSelectedMarket(m.symbol)}
            >
              <span className="po-ticker-sym">{m.symbol}</span>
              <span className="po-ticker-price">{m.price.toFixed(m.digits)}</span>
              <span className={`po-ticker-change ${m.change24h >= 0 ? 'up' : 'down'}`}>
                {m.change24h >= 0 ? '+' : ''}
                {m.change24h}%
              </span>
            </button>
          ))}
        </div>
        <div className="po-ribbon-right">
          <a href="#signals" className="po-ribbon-link">Signals</a>
          <span>·</span>
          <a href="#performance" className="po-ribbon-link">Analytics</a>
          <span>·</span>
          <a href="#pricing" className="po-ribbon-link">Plans</a>
          <span>·</span>
          <a
            href="https://t.me/sfcapitalfrx"
            target="_blank"
            rel="noopener noreferrer"
            className="po-ribbon-link"
          >
            <span>📱 @sfcapitalfrx</span>
          </a>
          <span>·</span>
          <span>API: {isLiveConnected ? 'Connected' : 'Sample feed'}</span>
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
            <span className="po-brand-tag">STRUCTURED SIGNAL TERMINAL</span>
          </div>
        </div>

        {/* Header Asset Selector */}
        <div className="po-header-assets">
          {MARKETS.map((m) => (
            <button
              key={m.symbol}
              type="button"
              className={`po-asset-pill ${selectedMarket === m.symbol ? 'active' : ''}`}
              onClick={() => setSelectedMarket(m.symbol)}
            >
              <span>{m.symbol}</span>
              <span className="po-payout-badge">{m.category}</span>
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

          <button
            type="button"
            className="po-btn-vip-gold"
            onClick={() => openPlanModal(plans.find((p) => p.slug === 'premium_30d') || plans[1])}
          >
            👑 VIP PLANS
          </button>

          {user?.role === 'admin' && (
            <button
              type="button"
              className="po-btn-icon"
              onClick={() => setActiveModal('admin')}
              title="Open Admin Console"
              aria-label="Open Admin Console"
            >
              ⚙
            </button>
          )}

          <button
            type="button"
            className={`po-user-pill ${user ? 'signed-in' : ''}`}
            onClick={() => setActiveModal('auth')}
          >
            <span>👤</span>
            <span>
              {user
                ? `${user.membershipStatus === 'PREMIUM' ? 'VIP' : 'FREE'}${user.role === 'admin' ? ' · ADMIN' : ''}`
                : 'Sign In'}
            </span>
          </button>
        </div>
      </header>

      {/* MAIN TRADING ARENA (POCKET OPTION SPLIT TERMINAL) */}
      <main className="po-workspace">
        <TradingChart
          market={currentMarket}
          signal={activeSignal}
          currentPrice={livePrice}
          onPriceChange={(price) => setLivePrice(price)}
        />

        {/* Right: Paper Simulator & Featured Signal Panel */}
        <aside className="po-order-panel">
          <div className="po-panel-header">
            <span className="po-panel-title">PAPER TRADE SIMULATOR</span>
            <span className="po-winrate-chip">NO BROKER</span>
          </div>

          {/* Risk Budget Input + Quick Presets */}
          <div className="po-input-group">
            <div className="po-input-label">
              <span>Risk Budget · Demo (Max 2%)</span>
              <span>USD</span>
            </div>
            <div className="po-input-box">
              <button
                type="button"
                className="po-btn-step"
                onClick={() => setTradeAmount((amount) => Math.max(25, amount - 25))}
                aria-label="Decrease risk amount"
              >
                -
              </button>
              <span>${tradeAmount}</span>
              <button
                type="button"
                className="po-btn-step"
                onClick={() => setTradeAmount((amount) => Math.min(maxRiskPerTrade, amount + 25))}
                aria-label="Increase risk amount"
              >
                +
              </button>
            </div>
            <div className="po-preset-pills">
              {RISK_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`po-preset-btn ${tradeAmount === preset ? 'active' : ''}`}
                  onClick={() => setTradeAmount(preset)}
                >
                  ${preset}
                </button>
              ))}
            </div>
          </div>

          {/* Illustrative Target Return Calculation */}
          <div className="po-payout-box">
            <span className="po-payout-label">Illustrative TP1 reward:</span>
            <span className="po-payout-val">
              {tp1RiskMultiple === null ? 'N/A' : `+$${(tradeAmount * tp1RiskMultiple).toFixed(2)}`}
            </span>
          </div>

          {/* High-Impact Simulate Buy / Sell Buttons */}
          <div className="po-action-buttons">
            <button
              type="button"
              className="po-btn-trade call"
              onClick={() => handleExecuteTrade('BUY')}
            >
              <div className="po-trade-copy">
                <span className="po-trade-title">SIMULATE BUY</span>
                <span className="po-trade-subtitle">Paper only · @ {livePrice.toFixed(currentMarket.digits)}</span>
              </div>
              <span className="po-trade-icon">▲</span>
            </button>

            <button
              type="button"
              className="po-btn-trade put"
              onClick={() => handleExecuteTrade('SELL')}
            >
              <div className="po-trade-copy">
                <span className="po-trade-title">SIMULATE SELL</span>
                <span className="po-trade-subtitle">Paper only · @ {livePrice.toFixed(currentMarket.digits)}</span>
              </div>
              <span className="po-trade-icon">▼</span>
            </button>
          </div>

          {/* Active Signal Card for selected market */}
          {activeSignal ? (
            <div className="po-signal-preview-box">
              <div className="po-preview-header">
                <span className="po-preview-pair">
                  #{activeSignal.pair} · {activeSignal.timeframe}
                </span>
                <span className={`po-status-pill ${activeSignal.status.toLowerCase()}`}>
                  {activeSignal.status}
                </span>
              </div>

              <div className="po-targets-list">
                <div className="po-target-row">
                  <span>Entry: {formatPrice(activeSignal.entry, currentMarket.digits)}</span>
                  <span style={{ color: activeSignal.direction === 'BUY' ? '#00e676' : '#ff3358', fontWeight: 800 }}>
                    {activeSignal.direction}
                  </span>
                </div>
                <div className="po-target-row">
                  <span>Stop Loss: {formatPrice(activeSignal.sl, currentMarket.digits)}</span>
                  <span style={{ color: '#ff3358' }}>SL</span>
                </div>
                <div
                  className={`po-target-row ${
                    activeSignal.status.includes('TP') || activeSignal.status === 'CLOSED' ? 'hit' : ''
                  }`}
                >
                  <span>Target 1: {formatPrice(activeSignal.tp1, currentMarket.digits)}</span>
                  <span>
                    {activeSignal.status.includes('TP') || activeSignal.status === 'CLOSED' ? '✓ HIT' : 'PENDING'}
                  </span>
                </div>
                <div className="po-target-bar-bg">
                  <div
                    className={`po-target-bar-fill ${activeSignal.status === 'SL_HIT' ? 'sl' : ''}`}
                    style={{ width: `${getProgressPercent(activeSignal.status)}%` }}
                  />
                </div>
              </div>

              <button
                type="button"
                className="po-btn-copy-signal"
                onClick={() => void handleCopy(activeSignal)}
              >
                📋 Copy Signal Payload
              </button>
            </div>
          ) : (
            <div className="po-signal-preview-box" style={{ textAlign: 'center', color: '#8e9fab', fontSize: 12 }}>
              <span>
                No unlocked active setup for {currentMarket.symbol}. Sign in with VIP or pick another pair below.
              </span>
            </div>
          )}

          {/* Compact Recent Paper Simulations Log */}
          {paperOrders.length > 0 && (
            <div className="po-paper-log">
              <div className="po-paper-log-head">
                <span>RECENT PAPER TICKETS</span>
                <span>NO BROKER</span>
              </div>
              {paperOrders.map((order) => (
                <div key={order.id} className="po-paper-log-row">
                  <span>
                    <strong className={order.direction === 'BUY' ? 'bull' : 'bear'}>{order.direction}</strong>{' '}
                    {order.pair}
                  </span>
                  <span>@ {order.entryRef}</span>
                  <span>${order.riskUsd} · {order.time}</span>
                </div>
              ))}
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
              <span className="po-section-subtext">
                {isLiveConnected
                  ? 'Connected to live backend · refreshes every 25s'
                  : 'Offline fallback · showing illustrative sample setups'}
              </span>
            </div>
          </div>

          <div className="po-filter-tabs">
            {(['ALL', 'ACTIVE', 'CLOSED', 'VIP'] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                className={`po-filter-btn ${statusFilter === filter ? 'active' : ''}`}
                onClick={() => setStatusFilter(filter)}
              >
                {filter === 'ALL' ? 'All Setups' : filter === 'ACTIVE' ? 'Active' : filter === 'CLOSED' ? 'Closed' : 'VIP Only'}
              </button>
            ))}
          </div>
        </div>

        <div className="po-signals-grid">
          {filteredSignals.map((s) => {
            const hasPremiumAccess = user?.membershipStatus === 'PREMIUM' || user?.role === 'admin'
            const isLocked = Boolean(s.isLocked || (s.isPremiumOnly && !hasPremiumAccess))
            const marketDigits = MARKETS.find((m) => m.symbol === s.pair)?.digits ?? 2
            const pipsDisplay = formatPips(s.pnlPips)
            const tp1Hit = s.status.includes('TP1') || s.status.includes('TP2') || s.status.includes('TP3') || s.status === 'CLOSED'
            const tp2Hit = s.status.includes('TP2') || s.status.includes('TP3') || s.status === 'CLOSED'
            const tp3Hit = s.status.includes('TP3')
            const monthlyPlan = plans.find((p) => p.slug === 'premium_30d') || plans[1]

            return (
              <div key={s.id} className={`po-signal-card ${isLocked ? 'po-locked-card' : ''}`}>
                {isLocked && (
                  <div className="po-locked-overlay">
                    <span className="po-locked-crown">👑</span>
                    <span className="po-locked-title">VIP SIGNAL LOCKED</span>
                    <span className="po-locked-sub">
                      Reserved for verified Premium members (${monthlyPlan.priceUsd} / {monthlyPlan.durationDays} days).
                    </span>
                    <button
                      type="button"
                      className="po-btn-unlock-vip"
                      onClick={() => openPlanModal(monthlyPlan)}
                    >
                      Unlock VIP · ${monthlyPlan.priceUsd} / 30d
                    </button>
                  </div>
                )}

                <div className="po-card-top">
                  <div className="po-card-pair-block">
                    <span className="po-card-pair">{s.pair}</span>
                    <span className="po-card-tf">{s.timeframe}</span>
                    <span className={`po-status-pill ${s.status.toLowerCase()}`}>{s.status}</span>
                  </div>
                  <span className={`po-card-badge-direction ${s.direction.toLowerCase()}`}>
                    {s.direction === 'BUY' ? '▲ BUY' : '▼ SELL'}
                  </span>
                </div>

                {/* Full 5-Level Price Matrix */}
                <div className="po-card-prices five-col">
                  <div className="po-price-col">
                    <span className="po-price-label">ENTRY</span>
                    <span className="po-price-number">{formatPrice(s.entry, marketDigits)}</span>
                  </div>
                  <div className="po-price-col">
                    <span className="po-price-label">SL</span>
                    <span className="po-price-number sl">{formatPrice(s.sl, marketDigits)}</span>
                  </div>
                  <div className="po-price-col">
                    <span className="po-price-label">TP1</span>
                    <span className="po-price-number tp1">{formatPrice(s.tp1, marketDigits)}</span>
                  </div>
                  <div className="po-price-col">
                    <span className="po-price-label">TP2</span>
                    <span className={`po-price-number ${s.tp2 === null ? 'vip' : 'tp1'}`}>
                      {formatPrice(s.tp2, marketDigits, 'VIP')}
                    </span>
                  </div>
                  <div className="po-price-col">
                    <span className="po-price-label">TP3</span>
                    <span className={`po-price-number ${s.tp3 === null ? 'vip' : 'tp3'}`}>
                      {formatPrice(s.tp3, marketDigits, 'VIP')}
                    </span>
                  </div>
                </div>

                {/* Milestones Progress Track */}
                <div className="po-card-milestones">
                  <div className="po-milestone-track">
                    <div
                      className={`po-milestone-track-fill ${s.status === 'SL_HIT' ? 'sl' : ''}`}
                      style={{ width: `${getProgressPercent(s.status)}%` }}
                    />
                  </div>
                  <div className="po-milestone-node">
                    <div className="po-node-dot hit">✓</div>
                    <span className="po-node-text hit">ENTRY</span>
                  </div>
                  <div className="po-milestone-node">
                    <div className={`po-node-dot ${s.status === 'SL_HIT' ? 'sl' : tp1Hit ? 'hit' : 'active'}`}>
                      {s.status === 'SL_HIT' ? '!' : tp1Hit ? '✓' : '1'}
                    </div>
                    <span className={`po-node-text ${tp1Hit ? 'hit' : ''}`}>
                      {s.status === 'SL_HIT' ? 'SL' : 'TP1'}
                    </span>
                  </div>
                  <div className="po-milestone-node">
                    <div className={`po-node-dot ${tp2Hit ? 'hit' : ''}`}>
                      {tp2Hit ? '✓' : '2'}
                    </div>
                    <span className={`po-node-text ${tp2Hit ? 'hit' : ''}`}>TP2</span>
                  </div>
                  <div className="po-milestone-node">
                    <div className={`po-node-dot ${tp3Hit ? 'hit' : ''}`}>
                      {tp3Hit ? '✓' : '3'}
                    </div>
                    <span className={`po-node-text ${tp3Hit ? 'hit' : ''}`}>TP3</span>
                  </div>
                </div>

                {/* Card Footer */}
                <div className="po-card-footer">
                  <span>{formatDate(s.time)}</span>
                  <span className={`po-card-pnl ${pipsDisplay.tone}`}>{pipsDisplay.text}</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      className="po-card-action-btn"
                      onClick={() => handleFocusSignalOnChart(s.pair)}
                      title="Inspect on Chart"
                    >
                      CHART
                    </button>
                    <button
                      type="button"
                      className="po-card-action-btn"
                      onClick={() => void handleCopy(s)}
                      title="Copy Signal"
                    >
                      COPY
                    </button>
                  </div>
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
          <span className="po-section-subtext">
            Calculated dynamically from closed signals in the active feed; historical figures are not independently audited.
          </span>
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
              <span className="po-stat-label">NET CLOSED PIPS</span>
              <span className="po-stat-icon">📈</span>
            </div>
            <span className="po-stat-value cyan">
              {stats.totalPips > 0 ? '+' : ''}
              {stats.totalPips.toLocaleString()}
            </span>
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
              <span className="po-stat-icon">🗂</span>
            </div>
            <span className="po-stat-value">{stats.totalTrades}</span>
            <span className="po-stat-foot">In the currently loaded feed</span>
          </div>
        </div>
      </section>

      {/* VIP MEMBERSHIP PLANS */}
      <section className="po-pricing-section" id="pricing">
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <h2 className="po-section-heading" style={{ fontSize: 26 }}>Membership Plans & Pricing</h2>
          <span className="po-section-subtext">
            Standard rates: $100 / 30 days (Premium Monthly) and $800 / 365 days (Premium Plus Annual). Online card checkout is disabled; access unlocks after manual payment verification.
          </span>
        </div>

        <div className="po-pricing-grid">
          {plans.map((plan) => (
            <div
              key={plan.slug}
              className={`po-plan-card ${plan.slug === 'premium_30d' ? 'featured' : ''}`}
            >
              {plan.badge && (
                <span className={`po-plan-badge ${plan.slug === 'premium_365d' ? 'gold' : ''}`}>
                  {plan.badge}
                </span>
              )}
              <h3 className="po-plan-name">{plan.name}</h3>
              <div className="po-plan-price">
                ${plan.priceUsd}{' '}
                <span>
                  {plan.durationDays === 0 ? '/ public preview' : `/ ${plan.durationDays} days`}
                </span>
              </div>
              <p className="po-plan-tagline">{plan.tagline}</p>
              <ul className="po-plan-features">
                {plan.features.map((feat) => (
                  <li key={feat}>
                    <span className="check">✓</span> {feat}
                  </li>
                ))}
              </ul>
              {plan.checkoutMode === 'NONE' ? (
                <button
                  type="button"
                  className="po-btn-plan"
                  onClick={() => showToast('Public Preview active: VIP setups remain masked until payment verification.')}
                >
                  Public Preview Only
                </button>
              ) : (
                <button
                  type="button"
                  className={`po-btn-plan ${plan.slug === 'premium_30d' ? 'primary' : ''}`}
                  onClick={() => openPlanModal(plan)}
                >
                  Choose {plan.name} · ${plan.priceUsd}
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* TRADINGVIEW & TELEGRAM INTEGRATION DOCK */}
      <section className="po-integration-dock">
        <div className="po-dock-grid">
          <div className="po-dock-card">
            <div className="po-dock-header">
              <div className="po-dock-title">
                <span>⚡ TradingView Webhook Endpoint</span>
              </div>
              <span className={`po-dock-badge tv ${isLiveConnected ? 'connected' : ''}`}>
                {isLiveConnected ? 'BACKEND CONNECTED' : 'BACKEND UNCONFIGURED'}
              </span>
            </div>
            <p style={{ fontSize: 12, color: '#8e9fab', margin: 0 }}>
              Alerts are stored and distributed only when <code>BACKEND_API_URL</code> and <code>SF_WEBHOOK_SECRET</code> are configured.
            </p>
            <div className="po-code-box">
              <code>{webhookUrl}</code>
              <button
                type="button"
                className="po-card-action-btn"
                onClick={() => {
                  void copyToClipboard(webhookUrl)
                  showToast('✓ Webhook URL copied!')
                }}
              >
                COPY
              </button>
            </div>
          </div>

          <div className="po-dock-card">
            <div className="po-dock-header">
              <div className="po-dock-title">
                <span>📱 Telegram VIP Bot & Channel</span>
              </div>
              <span className="po-dock-badge tg">CONFIGURATION-DEPENDENT</span>
            </div>
            <p style={{ fontSize: 12, color: '#8e9fab', margin: 0 }}>
              Telegram delivery requires <code>SF_TELEGRAM_BOT_TOKEN</code> and <code>SF_TELEGRAM_CHAT_ID</code> on the backend.
            </p>
            <div className="po-code-box">
              <code>Channel: @sfcapitalfrx · Bot: @SFCapitalFxbot</code>
              <a
                href="https://t.me/sfcapitalfrx"
                target="_blank"
                rel="noopener noreferrer"
                className="po-card-action-btn"
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
          <strong>SF CAPITAL FX</strong> · Educational Signal Platform © 2026. Trading involves risk; signals are not investment advice.
        </div>
        <div className="po-footer-links">
          <a href="#signals">Signals</a>
          <a href="#performance">Analytics</a>
          <a href="#pricing">Pricing</a>
          <a href="https://t.me/sfcapitalfrx" target="_blank" rel="noopener noreferrer">Telegram</a>
          <a href="https://web.facebook.com/profile.php?id=61594920310389" target="_blank" rel="noopener noreferrer">Facebook</a>
          <a href="https://www.youtube.com/@SFCAPITALFX" target="_blank" rel="noopener noreferrer">YouTube</a>
        </div>
      </footer>

      {/* AUTH MODAL */}
      {activeModal === 'auth' && (
        <div className="po-modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="po-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <button className="po-modal-close" onClick={() => setActiveModal(null)}>✕</button>
            <h3 className="po-modal-title">Trader Account</h3>
            {user ? (
              <>
                <p className="po-modal-desc">
                  Signed in as <strong>{user.email}</strong> · Role: <strong>{user.role.toUpperCase()}</strong> · Tier:{' '}
                  <strong>{user.membershipStatus}</strong>
                  {user.premiumExpiresAt ? ` (until ${formatDate(user.premiumExpiresAt)})` : ''}.
                </p>
                {user.role === 'admin' && (
                  <button
                    type="button"
                    className="po-btn-submit"
                    style={{ marginBottom: 8 }}
                    onClick={() => setActiveModal('admin')}
                  >
                    ⚙ Open Admin Operations Console
                  </button>
                )}
                <button type="button" className="po-btn-plan" onClick={handleLogout}>
                  Sign out
                </button>
              </>
            ) : (
              <>
                <p className="po-modal-desc">Sign in or create an account to access membership-gated signals.</p>
                <div className="po-filter-tabs auth-tabs" role="tablist" aria-label="Account access" style={{ marginBottom: 16 }}>
                  <button
                    type="button"
                    className={`po-filter-btn ${authMode === 'login' ? 'active' : ''}`}
                    onClick={() => {
                      setAuthMode('login')
                      setAuthError(null)
                    }}
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    className={`po-filter-btn ${authMode === 'register' ? 'active' : ''}`}
                    onClick={() => {
                      setAuthMode('register')
                      setAuthError(null)
                    }}
                  >
                    Create account
                  </button>
                </div>
                <form onSubmit={handleAuthSubmit}>
                  {authMode === 'register' && (
                    <div className="po-form-group">
                      <label className="po-form-label" htmlFor="auth-name">Full Name</label>
                      <input
                        id="auth-name"
                        type="text"
                        className="po-form-input"
                        autoComplete="name"
                        value={authName}
                        onChange={(e) => setAuthName(e.target.value)}
                      />
                    </div>
                  )}
                  <div className="po-form-group">
                    <label className="po-form-label" htmlFor="auth-email">Email Address</label>
                    <input
                      id="auth-email"
                      type="email"
                      className="po-form-input"
                      autoComplete="email"
                      required
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                    />
                  </div>
                  <div className="po-form-group">
                    <label className="po-form-label" htmlFor="auth-password">Password</label>
                    <input
                      id="auth-password"
                      type="password"
                      className="po-form-input"
                      autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                      minLength={8}
                      required
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                    />
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

      {/* VIP MEMBERSHIP VERIFICATION MODAL */}
      {activeModal === 'vip' && (
        <div className="po-modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="po-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <button className="po-modal-close" onClick={() => setActiveModal(null)}>✕</button>
            <h3 className="po-modal-title">
              👑 {selectedVipPlan.name} · ${selectedVipPlan.priceUsd} / {selectedVipPlan.durationDays} days
            </h3>
            <p className="po-modal-desc">
              Online checkout is not enabled. Membership requires payment verification through an official SF CAPITAL FX channel before an admin activates your account.
            </p>

            {/* Quick Plan Switcher inside Modal */}
            <div className="po-filter-tabs" style={{ marginBottom: 16 }}>
              {plans
                .filter((p) => p.isPremium)
                .map((plan) => (
                  <button
                    key={plan.slug}
                    type="button"
                    className={`po-filter-btn ${selectedVipPlan.slug === plan.slug ? 'active' : ''}`}
                    onClick={() => setSelectedVipPlan(plan)}
                  >
                    {plan.name} (${plan.priceUsd})
                  </button>
                ))}
            </div>

            <div className="po-vip-summary-box">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontWeight: 700, color: '#fff' }}>
                  {selectedVipPlan.name} ({selectedVipPlan.durationDays}-day access)
                </span>
                <span style={{ color: '#00e676', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
                  ${selectedVipPlan.priceUsd}.00 {selectedVipPlan.currency}
                </span>
              </div>
              <ol className="po-vip-steps">
                <li>1. Contact our official Telegram or social channel to request current payment details.</li>
                <li>2. Send payment and share your receipt & registered SF CAPITAL FX account email.</li>
                <li>3. Admin verifies payment and activates {selectedVipPlan.durationDays}-day VIP access in the console.</li>
              </ol>
            </div>

            <div className="po-vip-channels">
              <a className="po-btn-submit" href="https://t.me/sfcapitalfrx" target="_blank" rel="noopener noreferrer">
                Contact on Telegram (@sfcapitalfrx) ↗
              </a>
              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                <a
                  className="po-btn-plan"
                  style={{ textAlign: 'center' }}
                  href="https://web.facebook.com/profile.php?id=61594920310389"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Facebook ↗
                </a>
                <a
                  className="po-btn-plan"
                  style={{ textAlign: 'center' }}
                  href="https://www.youtube.com/@SFCAPITALFX"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  YouTube ↗
                </a>
              </div>
            </div>
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
