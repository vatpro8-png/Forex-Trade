import React, { useState, useEffect, useMemo } from 'react'
import type { MembershipPlan, Signal, User, SignalStatus } from './model/types'
import { MARKETS } from './model/symbols'
import { INITIAL_SIGNALS } from './data/mockSignals'
import { MEMBERSHIP_PLANS } from './model/pricing'
import { formatDate, formatPrice, formatPips, parseOptionalNumber, copyToClipboard } from './model/format'
import { TradingChart } from './components/TradingChart'
import { AdminConsole } from './components/AdminConsole'
import { SidebarNav } from './components/SidebarNav'
import { AuthModal } from './components/AuthModal'
import { VipModal } from './components/VipModal'

interface PaperPosition {
  id: string
  pair: string
  direction: 'BUY' | 'SELL'
  entryPrice: number
  stakeUsd: number
  durationLabel: string
  digits: number
  openedAt: string
  status: 'OPEN' | 'CLOSED'
  closePrice?: number
  realizedPnl?: number
  fromSignalId?: string
}

const RISK_PRESETS = [25, 50, 100, 200]
const DURATIONS = ['1m', '5m', '15m', '1h']

export const App: React.FC = () => {
  const [signals, setSignals] = useState<Signal[]>(INITIAL_SIGNALS)
  const [plans, setPlans] = useState<MembershipPlan[]>(MEMBERSHIP_PLANS)
  const [selectedMarket, setSelectedMarket] = useState<string>('XAUUSD')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'CLOSED' | 'VIP'>('ALL')
  const [positionsTab, setPositionsTab] = useState<'OPEN' | 'CLOSED'>('OPEN')
  const [activeNavSection, setActiveNavSection] = useState<string>('terminal-chart')

  const [demoBalance, setDemoBalance] = useState<number>(10000.0)
  const maxRiskPerTrade = Math.max(1, Math.floor(demoBalance * 0.02))
  const [tradeAmount, setTradeAmount] = useState<number>(100)
  const [tradeDuration, setTradeDuration] = useState<string>('15m')
  const [livePrices, setLivePrices] = useState<Record<string, number>>(() =>
    Object.fromEntries(MARKETS.map((m) => [m.symbol, m.price]))
  )
  const [paperPositions, setPaperPositions] = useState<PaperPosition[]>([])
  const webhookUrl = `${window.location.origin}/api/webhooks/tradingview`

  const [user, setUser] = useState<User | null>(null)
  const [selectedVipPlan, setSelectedVipPlan] = useState<MembershipPlan>(MEMBERSHIP_PLANS[1])
  const [activeModal, setActiveModal] = useState<'auth' | 'vip' | 'admin' | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [isLiveConnected, setIsLiveConnected] = useState(false)

  const showToast = (message: string) => {
    setToastMessage(message)
    setTimeout(() => {
      setToastMessage((current) => (current === message ? null : current))
    }, 3400)
  }

  const currentMarket = useMemo(() => {
    return MARKETS.find((m) => m.symbol === selectedMarket) || MARKETS[0]
  }, [selectedMarket])

  const currentLivePrice = livePrices[currentMarket.symbol] ?? currentMarket.price

  // Sync canonical pricing plans from backend if reachable
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

  // Fetch live signals from API (preserving null server masks)
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

  // Featured unlocked signal for selected instrument
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

  // Directional buyer/seller sentiment indicator derived from active signals on the pair
  const sentimentRatio = useMemo(() => {
    const pairSignals = signals.filter((s) => s.pair === currentMarket.symbol)
    if (pairSignals.length === 0) return currentMarket.change24h >= 0 ? 64 : 38
    const buys = pairSignals.filter((s) => s.direction === 'BUY').length
    return Math.min(88, Math.max(18, Math.round((buys / pairSignals.length) * 100)))
  }, [signals, currentMarket])

  const tp1RiskMultiple =
    activeSignal &&
    activeSignal.entry !== null &&
    activeSignal.sl !== null &&
    activeSignal.tp1 !== null &&
    activeSignal.entry !== activeSignal.sl
      ? Math.abs(activeSignal.tp1 - activeSignal.entry) / Math.abs(activeSignal.entry - activeSignal.sl)
      : null

  // Filtered signals for feed grid
  const filteredSignals = useMemo(() => {
    return signals.filter((s) => {
      if (statusFilter === 'ACTIVE') return s.status === 'ACTIVE' || s.status.includes('TP')
      if (statusFilter === 'CLOSED') return s.status === 'CLOSED' || s.status === 'SL_HIT' || s.status === 'CANCELLED'
      if (statusFilter === 'VIP') return s.isPremiumOnly
      return true
    })
  }, [signals, statusFilter])

  // Closed performance analytics
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
      winningTrades: winningSignals.length,
      losingTrades: losingSignals.length,
      profitFactor: grossLoss ? Number((grossProfit / grossLoss).toFixed(2)) : null,
    }
  }, [signals])

  // Open demo position (explicitly demo simulation only; never calls a real broker)
  const handleExecuteTrade = (direction: 'BUY' | 'SELL', pairOverride?: string, fromSignalId?: string) => {
    const pair = pairOverride || currentMarket.symbol
    const mInfo = MARKETS.find((m) => m.symbol === pair) || currentMarket
    const stake = Math.min(tradeAmount, Math.max(1, demoBalance))
    if (demoBalance < 1) {
      showToast('Demo balance depleted — click Reset $10,000 to refill simulation funds.')
      return
    }
    const entryPrice = Number((livePrices[pair] ?? mInfo.price).toFixed(mInfo.digits))
    const newPos: PaperPosition = {
      id: `demo-${Date.now().toString().slice(-6)}`,
      pair,
      direction,
      entryPrice,
      stakeUsd: stake,
      durationLabel: tradeDuration,
      digits: mInfo.digits,
      openedAt: new Date().toLocaleTimeString('en-US', { hour12: false }),
      status: 'OPEN',
      fromSignalId,
    }
    setDemoBalance((prev) => Number((prev - stake).toFixed(2)))
    setPaperPositions((prev) => [newPos, ...prev])
    setPositionsTab('OPEN')
    showToast(`✓ Demo ${direction} opened on ${pair} ($${stake} simulated stake · no broker connected).`)
  }

  const computeFloatingPnl = (pos: PaperPosition) => {
    const current = livePrices[pos.pair] ?? pos.entryPrice
    const pctMove = (current - pos.entryPrice) / pos.entryPrice
    const signedMove = pos.direction === 'BUY' ? pctMove : -pctMove
    // 25x illustrative simulation leverage multiplier, floored at -stakeUsd
    return Number(Math.max(-pos.stakeUsd, pos.stakeUsd * signedMove * 250).toFixed(2))
  }

  const handleClosePosition = (posId: string) => {
    setPaperPositions((prev) =>
      prev.map((p) => {
        if (p.id !== posId || p.status !== 'OPEN') return p
        const pnl = computeFloatingPnl(p)
        const closePrice = livePrices[p.pair] ?? p.entryPrice
        setDemoBalance((bal) => Number((bal + p.stakeUsd + pnl).toFixed(2)))
        showToast(
          `Closed Demo ${p.pair} ${p.direction}: ${pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`}`
        )
        return {
          ...p,
          status: 'CLOSED',
          closePrice: Number(closePrice.toFixed(p.digits)),
          realizedPnl: pnl,
        }
      })
    )
  }

  const handleResetDemo = () => {
    setDemoBalance(10000.0)
    setPaperPositions([])
    showToast('Demo simulation account reset to $10,000.00.')
  }

  const handleScrollToSection = (sectionId: string) => {
    setActiveNavSection(sectionId)
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleFocusSignalOnChart = (pair: string) => {
    if (MARKETS.some((m) => m.symbol === pair)) {
      setSelectedMarket(pair)
      handleScrollToSection('terminal-chart')
    } else {
      showToast(`No interactive chart preset for ${pair}.`)
    }
  }

  const handleCopy = async (s: Signal) => {
    const isCardLocked =
      s.isLocked || (s.isPremiumOnly && user?.membershipStatus !== 'PREMIUM' && user?.role !== 'admin')
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

  const paidPlans = plans.filter((p) => p.isPremium)
  const openPositions = paperPositions.filter((p) => p.status === 'OPEN')
  const closedPositions = paperPositions.filter((p) => p.status === 'CLOSED')

  return (
    <div className="po-shell">
      <div className={`po-toast ${toastMessage ? 'show' : ''}`} role="status">
        <span>{toastMessage}</span>
      </div>

      {/* Left Vertical Pocket Option Sidebar Navigation Rail */}
      <SidebarNav
        activeSection={activeNavSection}
        onSelectSection={handleScrollToSection}
        onOpenVip={() => openPlanModal(paidPlans[0] || plans[1])}
        isAdmin={user?.role === 'admin'}
        onOpenAdmin={() => setActiveModal('admin')}
      />

      <div className="po-platform">
        {/* Top Ticker Tape Ribbon */}
        <div className="po-top-ribbon">
          <div className="po-ribbon-left">
            <div className="po-live-pulse-badge">
              <span className="po-pulse-dot"></span>
              <span>STRUCTURED SIGNALS & TERMINAL</span>
            </div>
            {MARKETS.map((m) => (
              <button
                key={m.symbol}
                type="button"
                className="po-ticker-item"
                onClick={() => setSelectedMarket(m.symbol)}
              >
                <span className="po-ticker-sym">{m.symbol}</span>
                <span className="po-ticker-price">{(livePrices[m.symbol] ?? m.price).toFixed(m.digits)}</span>
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
            <a href="#pricing" className="po-ribbon-link">Buy VIP</a>
            <span>·</span>
            <a
              href="https://t.me/sfcapitalfrx"
              target="_blank"
              rel="noopener noreferrer"
              className="po-ribbon-link"
            >
              📱 @sfcapitalfrx
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
              <span className="po-brand-tag">TRADE SMART · MANAGE RISK</span>
            </div>
          </div>

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

          <div className="po-header-right">
            <div className="po-balance-box">
              <div className="po-balance-info">
                <span className="po-balance-type">DEMO SIMULATION</span>
                <span className="po-balance-amount">
                  ${demoBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <button
                type="button"
                className="po-btn-reset-demo"
                onClick={handleResetDemo}
                title="Reset Demo Balance to $10,000"
              >
                ↻
              </button>
            </div>

            <button
              type="button"
              className="po-btn-vip-gold"
              onClick={() => openPlanModal(paidPlans[0] || plans[1])}
            >
              👑 BUY VIP SIGNALS
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
                  : 'Log In'}
              </span>
            </button>
          </div>
        </header>

        {/* MAIN TRADING ARENA (POCKET OPTION SPLIT TERMINAL) */}
        <main className="po-workspace">
          <TradingChart
            market={currentMarket}
            signal={activeSignal}
            currentPrice={currentLivePrice}
            onPriceChange={(price) =>
              setLivePrices((prev) => ({
                ...prev,
                [currentMarket.symbol]: price,
              }))
            }
          />

          {/* Right: Execution & Signal Companion Panel */}
          <aside className="po-order-panel">
            <div className="po-panel-header">
              <span className="po-panel-title">SIGNAL & DEMO TERMINAL</span>
              <span className="po-winrate-chip">NO BROKER</span>
            </div>

            {/* Duration Selector (Pocket Option style) */}
            <div className="po-input-group">
              <div className="po-input-label">
                <span>Reference Horizon</span>
                <span>TIMEFRAME</span>
              </div>
              <div className="po-preset-pills">
                {DURATIONS.map((dur) => (
                  <button
                    key={dur}
                    type="button"
                    className={`po-preset-btn ${tradeDuration === dur ? 'active' : ''}`}
                    onClick={() => setTradeDuration(dur)}
                  >
                    {dur}
                  </button>
                ))}
              </div>
            </div>

            {/* Risk Stake Box */}
            <div className="po-input-group">
              <div className="po-input-label">
                <span>Risk Stake · Demo (Max 2%)</span>
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
                    onClick={() => setTradeAmount(Math.min(maxRiskPerTrade, preset))}
                  >
                    ${preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Signal Sentiment Gauge */}
            <div className="po-sentiment-wrap">
              <div className="po-sentiment-labels">
                <span className="bull">{sentimentRatio}% BUY BIAS ▲</span>
                <span className="bear">{100 - sentimentRatio}% SELL ▼</span>
              </div>
              <div className="po-sentiment-bar">
                <div className="po-sentiment-fill" style={{ width: `${sentimentRatio}%` }} />
              </div>
            </div>

            {/* Illustrative R:R Return */}
            <div className="po-payout-box">
              <span className="po-payout-label">Signal TP1 R:R Reward:</span>
              <span className="po-payout-val">
                {tp1RiskMultiple === null ? 'N/A' : `+$${(tradeAmount * tp1RiskMultiple).toFixed(2)}`}
              </span>
            </div>

            {/* Giant Neon Call / Put Paper Action Buttons */}
            <div className="po-action-buttons">
              <button
                type="button"
                className="po-btn-trade call"
                onClick={() => handleExecuteTrade('BUY')}
              >
                <div className="po-trade-copy">
                  <span className="po-trade-title">BUY / HIGHER</span>
                  <span className="po-trade-subtitle">Paper demo @ {currentLivePrice.toFixed(currentMarket.digits)}</span>
                </div>
                <span className="po-trade-icon">▲</span>
              </button>

              <button
                type="button"
                className="po-btn-trade put"
                onClick={() => handleExecuteTrade('SELL')}
              >
                <div className="po-trade-copy">
                  <span className="po-trade-title">SELL / LOWER</span>
                  <span className="po-trade-subtitle">Paper demo @ {currentLivePrice.toFixed(currentMarket.digits)}</span>
                </div>
                <span className="po-trade-icon">▼</span>
              </button>
            </div>

            {/* Featured Signal Card inside Execution Panel */}
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

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <button
                    type="button"
                    className="po-btn-copy-signal follow"
                    onClick={() => handleExecuteTrade(activeSignal.direction, activeSignal.pair, activeSignal.id)}
                  >
                    ⚡ Follow in Demo
                  </button>
                  <button
                    type="button"
                    className="po-btn-copy-signal"
                    onClick={() => void handleCopy(activeSignal)}
                  >
                    📋 Copy Signal
                  </button>
                </div>
              </div>
            ) : (
              <div className="po-signal-preview-box" style={{ textAlign: 'center', color: '#8e9fab', fontSize: 12 }}>
                <span>
                  Unlock VIP to view & mirror premium signals on {currentMarket.symbol}.
                </span>
                <button
                  type="button"
                  className="po-btn-unlock-vip"
                  style={{ marginTop: 6 }}
                  onClick={() => openPlanModal(paidPlans[0] || plans[1])}
                >
                  Buy VIP · ${paidPlans[0]?.priceUsd ?? 100}/mo
                </button>
              </div>
            )}
          </aside>
        </main>

        {/* POCKET OPTION BOTTOM POSITIONS DRAWER */}
        <section className="po-positions-drawer" id="paper-positions">
          <div className="po-drawer-header">
            <div className="po-filter-tabs">
              <button
                type="button"
                className={`po-filter-btn ${positionsTab === 'OPEN' ? 'active' : ''}`}
                onClick={() => setPositionsTab('OPEN')}
              >
                Open Demo Positions ({openPositions.length})
              </button>
              <button
                type="button"
                className={`po-filter-btn ${positionsTab === 'CLOSED' ? 'active' : ''}`}
                onClick={() => setPositionsTab('CLOSED')}
              >
                Closed Demo History ({closedPositions.length})
              </button>
            </div>
            <span className="po-drawer-note">
              Paper simulation ledger only · unrealized P&amp;L updates on live reference ticks (no real funds moved)
            </span>
          </div>

          {positionsTab === 'OPEN' ? (
            openPositions.length === 0 ? (
              <div className="po-drawer-empty">
                No active demo positions. Use <strong>BUY / HIGHER</strong>, <strong>SELL / LOWER</strong>, or{' '}
                <strong>Follow in Demo</strong> on any signal to practice risk management.
              </div>
            ) : (
              <div className="po-positions-table">
                {openPositions.map((pos) => {
                  const pnl = computeFloatingPnl(pos)
                  const curr = livePrices[pos.pair] ?? pos.entryPrice
                  return (
                    <div key={pos.id} className="po-position-row">
                      <span>
                        <strong>{pos.pair}</strong>{' '}
                        <span className={`po-card-badge-direction ${pos.direction.toLowerCase()}`}>{pos.direction}</span>
                      </span>
                      <span className="mono">Stake: ${pos.stakeUsd} · {pos.durationLabel}</span>
                      <span className="mono">Entry: {pos.entryPrice.toFixed(pos.digits)}</span>
                      <span className="mono">Live: {curr.toFixed(pos.digits)}</span>
                      <span className={`mono po-pos-pnl ${pnl >= 0 ? 'profit' : 'loss'}`}>
                        {pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`}
                      </span>
                      <button
                        type="button"
                        className="po-card-action-btn"
                        onClick={() => handleClosePosition(pos.id)}
                      >
                        CLOSE DEMO
                      </button>
                    </div>
                  )
                })}
              </div>
            )
          ) : closedPositions.length === 0 ? (
            <div className="po-drawer-empty">No closed demo positions recorded in this session yet.</div>
          ) : (
            <div className="po-positions-table">
              {closedPositions.map((pos) => {
                const pnl = pos.realizedPnl ?? 0
                return (
                  <div key={pos.id} className="po-position-row">
                    <span>
                      <strong>{pos.pair}</strong>{' '}
                      <span className={`po-card-badge-direction ${pos.direction.toLowerCase()}`}>{pos.direction}</span>
                    </span>
                    <span className="mono">Stake: ${pos.stakeUsd} · {pos.openedAt}</span>
                    <span className="mono">Entry: {pos.entryPrice.toFixed(pos.digits)}</span>
                    <span className="mono">Exit: {(pos.closePrice ?? pos.entryPrice).toFixed(pos.digits)}</span>
                    <span className={`mono po-pos-pnl ${pnl >= 0 ? 'profit' : 'loss'}`}>
                      {pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`}
                    </span>
                    <span className="po-status-pill closed">CLOSED</span>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* THE SIGNAL ROOM & MARKETPLACE FEED */}
        <section className="po-signals-section" id="signals">
          <div className="po-section-header">
            <div className="po-section-title-wrap">
              <div className="po-section-icon">📡</div>
              <div>
                <h2 className="po-section-heading">The Signal Room · Live Market Signals</h2>
                <span className="po-section-subtext">
                  {isLiveConnected
                    ? 'Connected to SF CAPITAL API · refreshes every 25s · mirror directly in demo terminal'
                    : 'Offline sample feed · connect BACKEND_API_URL for persistent TradingView alerts'}
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
                  {filter === 'ALL' ? 'All Setups' : filter === 'ACTIVE' ? 'Active' : filter === 'CLOSED' ? 'Closed' : 'VIP Signals'}
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
              const monthlyPlan = paidPlans[0] || plans[1]

              return (
                <div key={s.id} className={`po-signal-card ${isLocked ? 'po-locked-card' : ''}`}>
                  {isLocked && (
                    <div className="po-locked-overlay">
                      <span className="po-locked-crown">👑</span>
                      <span className="po-locked-title">VIP SIGNAL LOCKED</span>
                      <span className="po-locked-sub">
                        Exclusive setup for verified members (${monthlyPlan.priceUsd} / 1 month or $800 / 1 year).
                      </span>
                      <button
                        type="button"
                        className="po-btn-unlock-vip"
                        onClick={() => openPlanModal(monthlyPlan)}
                      >
                        Buy VIP · ${monthlyPlan.priceUsd} / 1 mo
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
                      <div className={`po-node-dot ${tp2Hit ? 'hit' : ''}`}>{tp2Hit ? '✓' : '2'}</div>
                      <span className={`po-node-text ${tp2Hit ? 'hit' : ''}`}>TP2</span>
                    </div>
                    <div className="po-milestone-node">
                      <div className={`po-node-dot ${tp3Hit ? 'hit' : ''}`}>{tp3Hit ? '✓' : '3'}</div>
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
                      >
                        CHART
                      </button>
                      {!isLocked && (
                        <button
                          type="button"
                          className="po-card-action-btn trade"
                          onClick={() => {
                            handleFocusSignalOnChart(s.pair)
                            handleExecuteTrade(s.direction, s.pair, s.id)
                          }}
                        >
                          DEMO TRADE
                        </button>
                      )}
                      <button
                        type="button"
                        className="po-card-action-btn"
                        onClick={() => void handleCopy(s)}
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

        {/* THREE MARKETS. ONE PROCESS (from sfcapitalfx.netlify.app) */}
        <section className="po-markets-section" id="markets">
          <div className="po-section-header">
            <div className="po-section-title-wrap">
              <div className="po-section-icon">🌐</div>
              <div>
                <h2 className="po-section-heading">Three Core Markets. One Disciplined Process.</h2>
                <span className="po-section-subtext">
                  Click any market to load its chart, EMA levels, and live signal watch in the terminal above.
                </span>
              </div>
            </div>
          </div>

          <div className="po-markets-grid">
            {MARKETS.slice(0, 3).map((m, idx) => (
              <div
                key={m.symbol}
                className={`po-market-card ${selectedMarket === m.symbol ? 'selected' : ''}`}
                onClick={() => handleFocusSignalOnChart(m.symbol)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && handleFocusSignalOnChart(m.symbol)}
              >
                <div className="po-market-card-top">
                  <span className={`po-asset-badge ${m.iconClass}`}>{m.iconText}</span>
                  <span className="po-market-num">
                    0{idx + 1} / {m.category.toUpperCase()}
                  </span>
                </div>
                <h3>
                  {m.name} <span>{m.symbol}</span>
                </h3>
                <p>{m.description}</p>
                <div className="po-market-card-foot">
                  <span className="mono">{(livePrices[m.symbol] ?? m.price).toFixed(m.digits)}</span>
                  <span className="po-ribbon-link">Load Chart ↗</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* PERFORMANCE & ANALYTICS */}
        <section className="po-analytics-section" id="performance">
          <div className="po-section-header">
            <h2 className="po-section-heading">Performance, Not Promises</h2>
            <span className="po-section-subtext">
              Calculated from closed records currently loaded in the feed; educational record, not financial advice.
            </span>
          </div>
          <div className="po-stats-grid">
            <div className="po-stat-card">
              <div className="po-stat-top">
                <span className="po-stat-label">WIN RATE</span>
                <span className="po-stat-icon">🎯</span>
              </div>
              <span className="po-stat-value green">{stats.winRate === null ? 'N/A' : `${stats.winRate}%`}</span>
              <span className="po-stat-foot">
                {stats.winningTrades} wins / {stats.losingTrades} losses
              </span>
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
              <span className="po-stat-foot">Verified closed outcomes only</span>
            </div>

            <div className="po-stat-card">
              <div className="po-stat-top">
                <span className="po-stat-label">PROFIT FACTOR</span>
                <span className="po-stat-icon">⚡</span>
              </div>
              <span className="po-stat-value gold">{stats.profitFactor === null ? 'N/A' : stats.profitFactor}</span>
              <span className="po-stat-foot">Gross profit ÷ gross loss</span>
            </div>

            <div className="po-stat-card">
              <div className="po-stat-top">
                <span className="po-stat-label">CLOSED SIGNALS</span>
                <span className="po-stat-icon">🗂</span>
              </div>
              <span className="po-stat-value">{stats.totalTrades}</span>
              <span className="po-stat-foot">Loaded resolved trades</span>
            </div>
          </div>
        </section>

        {/* PAID MEMBERSHIP PLANS (MATCHING sfcapitalfx.netlify.app: $100/mo & $800/yr) */}
        <section className="po-pricing-section" id="pricing">
          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <h2 className="po-section-heading" style={{ fontSize: 26 }}>Paid VIP Signal Memberships</h2>
            <span className="po-section-subtext">
              No free membership plans — choose Premium ($100 / 1 month) or Premium Plus ($800 / 1 year). Unverified logins only preview public setups.
            </span>
          </div>

          <div className="po-pricing-grid two-col">
            {paidPlans.map((plan) => (
              <div
                key={plan.slug}
                className={`po-plan-card ${plan.slug === 'premium_365d' ? 'featured' : ''}`}
              >
                {plan.badge && (
                  <span className={`po-plan-badge ${plan.slug === 'premium_365d' ? 'gold' : ''}`}>
                    {plan.badge}
                  </span>
                )}
                <h3 className="po-plan-name">{plan.name}</h3>
                <div className="po-plan-price">
                  ${plan.priceUsd}{' '}
                  <span>{plan.durationDays === 30 ? '/ 1 month (30 days)' : '/ 1 year (365 days)'}</span>
                </div>
                <p className="po-plan-tagline">{plan.tagline}</p>
                <ul className="po-plan-features">
                  {plan.features.map((feat) => (
                    <li key={feat}>
                      <span className="check">✓</span> {feat}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className={`po-btn-plan ${plan.slug === 'premium_365d' ? 'primary' : ''}`}
                  onClick={() => openPlanModal(plan)}
                >
                  Choose {plan.name} · ${plan.priceUsd} ↗
                </button>
                <small className="po-admin-note" style={{ margin: 0 }}>
                  {plan.durationDays}-day VIP access · manual payment verification (USDT, Binance Pay, bKash, Bank)
                </small>
              </div>
            ))}
          </div>
        </section>

        {/* WHO WE ARE + FREQUENTLY ASKED QUESTIONS (from sfcapitalfx.netlify.app) */}
        <section className="po-about-faq-section" id="about">
          <div className="po-about-faq-grid">
            <div className="po-dock-card">
              <div className="po-admin-eyebrow">WHO WE ARE</div>
              <h2 className="po-section-heading">Built Around Better Decisions</h2>
              <p className="po-section-subtext" style={{ lineHeight: 1.6 }}>
                SF CAPITAL FX combines a Pocket Option-inspired visual trading terminal with TradingView Pine Script webhook automation across Gold (XAUUSD), Bitcoin (BTCUSD), and Crude Oil (USOIL).
              </p>
              <div className="po-principles-list">
                <div>
                  <strong>01 · Structure</strong>
                  <span>Every signal defines Entry, Stop Loss, and TP1–TP3 before execution.</span>
                </div>
                <div>
                  <strong>02 · Transparency</strong>
                  <span>Visible closed outcomes and non-destructive milestone history.</span>
                </div>
                <div>
                  <strong>03 · Risk Awareness</strong>
                  <span>Plan 1–2% maximum risk before considering potential reward.</span>
                </div>
              </div>
            </div>

            <div className="po-dock-card" id="faq">
              <div className="po-admin-eyebrow">GOOD TO KNOW</div>
              <h2 className="po-section-heading">Frequently Asked Questions</h2>
              <div className="po-faq-list">
                <details>
                  <summary>How do signals reach the website &amp; Telegram?</summary>
                  <p>
                    TradingView Pine Script alerts post signed JSON webhooks to <code>/api/webhooks/tradingview</code>, storing the signal cleanly and publishing to the web feed and Telegram VIP channel when configured.
                  </p>
                </details>
                <details>
                  <summary>Does clicking BUY / SELL here place a real broker trade?</summary>
                  <p>
                    No. The integrated terminal runs strictly as an educational demo paper-trade simulator ($10,000 demo balance) so you can practice signals visually. No real money or broker account is connected.
                  </p>
                </details>
                <details>
                  <summary>How do I buy and activate VIP signals?</summary>
                  <p>
                    Choose Premium ($100 / 1 month) or Premium Plus ($800 / 1 year), contact us via Telegram or submit your payment reference (USDT, Binance Pay, bKash, or bank transfer) in the Buy VIP dialog, and an admin activates your account after verification.
                  </p>
                </details>
                <details>
                  <summary>Are signals guaranteed to make profit?</summary>
                  <p>
                    No. Trading involves substantial risk of loss and past results do not guarantee future performance. Signals are provided strictly for informational and educational use.
                  </p>
                </details>
              </div>
            </div>
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
                Alerts persist only when <code>BACKEND_API_URL</code> and <code>SF_WEBHOOK_SECRET</code> are configured.
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
                  <span>📱 Telegram VIP Bot &amp; Official Channels</span>
                </div>
                <span className="po-dock-badge tg">BOT: @SFCapitalFxbot</span>
              </div>
              <p style={{ fontSize: 12, color: '#8e9fab', margin: 0 }}>
                Telegram dispatch requires <code>SF_TELEGRAM_BOT_TOKEN</code> and <code>SF_TELEGRAM_CHAT_ID</code> on the backend.
              </p>
              <div className="po-code-box">
                <code>Channel: @sfcapitalfrx · Group · FB · YT · TikTok</code>
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

        {/* FOOTER WITH ALL OFFICIAL CHANNELS */}
        <footer className="po-footer" id="contact">
          <div>
            <strong>SF CAPITAL FX</strong> · Trade Smart. Manage Risk. © 2026. Signals are educational and not investment advice.
          </div>
          <div className="po-footer-links">
            <a href="#signals">Signals</a>
            <a href="#performance">Performance</a>
            <a href="#pricing">Pricing</a>
            <a href="#about">About</a>
            <a href="https://t.me/sfcapitalfrx" target="_blank" rel="noopener noreferrer">Telegram</a>
            <a href="https://t.me/+X_bXKn7BYNxlZGFl" target="_blank" rel="noopener noreferrer">Public Group</a>
            <a href="https://web.facebook.com/profile.php?id=61594920310389" target="_blank" rel="noopener noreferrer">Facebook</a>
            <a href="https://www.youtube.com/@SFCAPITALFX" target="_blank" rel="noopener noreferrer">YouTube</a>
            <a href="https://www.tiktok.com/@sfcapitalforex" target="_blank" rel="noopener noreferrer">TikTok</a>
          </div>
        </footer>
      </div>

      {/* AUTHENTICATION & PASSWORD RESET MODAL */}
      {activeModal === 'auth' && (
        <AuthModal
          user={user}
          onClose={() => setActiveModal(null)}
          onAuthenticated={(authedUser) => {
            setUser(authedUser)
            void fetchSignals()
          }}
          onLogout={handleLogout}
          onOpenAdmin={() => setActiveModal('admin')}
          onToast={showToast}
        />
      )}

      {/* PAID VIP SIGNAL PURCHASE & VERIFICATION MODAL */}
      {activeModal === 'vip' && (
        <VipModal
          plans={plans}
          initialPlan={selectedVipPlan}
          user={user}
          onClose={() => setActiveModal(null)}
          onToast={showToast}
        />
      )}

      {/* ADMIN OPERATIONS CONSOLE MODAL */}
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
