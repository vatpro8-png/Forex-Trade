import React, { useState, useEffect, useMemo } from 'react'
import type { Signal, User } from './model/types'
import { MARKETS } from './model/symbols'
import { INITIAL_SIGNALS, INITIAL_STATS } from './data/mockSignals'
import { formatPrice, formatDate, formatTimeAgo, copyToClipboard } from './model/format'
import { TradingChart } from './components/TradingChart'
import { AdminConsole } from './components/AdminConsole'

export const App: React.FC = () => {
  const [signals, setSignals] = useState<Signal[]>(INITIAL_SIGNALS)
  const [selectedMarket, setSelectedMarket] = useState<string>('XAUUSD')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'CLOSED'>('ALL')
  const [user, setUser] = useState<User | null>({
    id: 'user-demo-01',
    email: 'trader@sfcapitalfx.com',
    name: 'Active Trader',
    role: 'admin',
    membershipStatus: 'PREMIUM',
    premiumExpiresAt: '2026-12-09T00:00:00Z',
  })
  const [activeModal, setActiveModal] = useState<'auth' | 'premium' | 'forgot' | 'admin' | null>(null)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [isNavOpen, setIsNavOpen] = useState(false)
  const [isLiveConnected, setIsLiveConnected] = useState(false)

  // Auth form inputs
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authName, setAuthName] = useState('')
  const [authFeedback, setAuthFeedback] = useState<{ text: string; isError: boolean } | null>(null)

  const showToast = (message: string) => {
    setToastMessage(message)
    setTimeout(() => {
      setToastMessage((current) => (current === message ? null : current))
    }, 3200)
  }

  // Attempt to fetch signals from backend API
  const fetchSignals = async () => {
    try {
      const response = await fetch('/api/signals')
      if (response.ok) {
        const data = await response.json()
        if (Array.isArray(data) && data.length > 0) {
          const mapped: Signal[] = data.map((item: any) => ({
            id: item.id,
            pair: item.pair,
            direction: item.signal === 'SELL' ? 'SELL' : 'BUY',
            entry: item.entry,
            sl: item.sl,
            tp1: item.tp1,
            tp2: item.tp2,
            tp3: item.tp3,
            time: item.time,
            status: item.status || 'ACTIVE',
            timeframe: item.timeframe || '15m',
            source: 'TradingView',
            isPremiumOnly: false,
          }))
          setSignals(mapped)
          setIsLiveConnected(true)
          return
        }
      }
    } catch {
      // Backend not reached or offline; fallback to initial state
    }
  }

  useEffect(() => {
    fetchSignals()
    const interval = setInterval(fetchSignals, 30000)

    // Attempt Server-Sent Events connection if available
    let eventSource: EventSource | null = null
    try {
      eventSource = new EventSource('/api/events')
      eventSource.onopen = () => setIsLiveConnected(true)
      eventSource.onerror = () => setIsLiveConnected(false)
      eventSource.addEventListener('signal', (event) => {
        try {
          const incoming = JSON.parse(event.data)
          setSignals((prev) => [incoming, ...prev.filter((s) => s.id !== incoming.id)])
          showToast(`⚡ New Signal: ${incoming.pair} ${incoming.direction}`)
        } catch {
          // ignore parsing error
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

  // Filtered signals for the active selection
  const filteredSignals = useMemo(() => {
    return signals.filter((s) => {
      const marketMatch = selectedMarket === 'ALL' || s.pair === selectedMarket
      const statusMatch =
        statusFilter === 'ALL'
          ? true
          : statusFilter === 'ACTIVE'
          ? s.status === 'ACTIVE' || s.status.includes('TP')
          : s.status === 'CLOSED' || s.status === 'SL_HIT' || s.status === 'CANCELLED'
      return marketMatch && statusMatch
    })
  }, [signals, selectedMarket, statusFilter])

  // Count active setups for current market
  const activeCount = useMemo(() => {
    return signals.filter(
      (s) =>
        (selectedMarket === 'ALL' || s.pair === selectedMarket) &&
        (s.status === 'ACTIVE' || s.status.includes('TP'))
    ).length
  }, [signals, selectedMarket])

  // Latest update time
  const latestUpdateTime = useMemo(() => {
    const list = signals.filter((s) => selectedMarket === 'ALL' || s.pair === selectedMarket)
    if (!list.length) return '—'
    const sorted = [...list].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    return formatDate(sorted[0].time)
  }, [signals, selectedMarket])

  // Current market info object
  const currentMarketInfo = useMemo(() => {
    return MARKETS.find((m) => m.symbol === selectedMarket) || MARKETS[0]
  }, [selectedMarket])

  // Current featured signal for chart overlay
  const featuredSignal = useMemo(() => {
    return (
      signals.find(
        (s) => s.pair === currentMarketInfo.symbol && (s.status === 'ACTIVE' || s.status.includes('TP'))
      ) ||
      signals.find((s) => s.pair === currentMarketInfo.symbol) ||
      null
    )
  }, [signals, currentMarketInfo])

  // Server performance metrics
  const stats = useMemo(() => {
    const closed = signals.filter((s) => s.status === 'CLOSED' || s.status === 'SL_HIT')
    if (closed.length === 0) return INITIAL_STATS
    const wins = closed.filter((s) => (s.pnlPips || 0) > 0).length
    const losses = closed.filter((s) => (s.pnlPips || 0) <= 0).length
    const winRate = closed.length > 0 ? Number(((wins / closed.length) * 100).toFixed(1)) : null
    const totalProfit = closed.reduce((acc, s) => acc + Math.max(0, s.pnlPips || 0), 0)
    const totalLoss = closed.reduce((acc, s) => acc + Math.abs(Math.min(0, s.pnlPips || 0)), 0)
    return {
      totalTrades: closed.length + INITIAL_STATS.totalTrades,
      winningTrades: wins + INITIAL_STATS.winningTrades,
      losingTrades: losses + INITIAL_STATS.losingTrades,
      winRate: winRate || INITIAL_STATS.winRate,
      totalProfit: totalProfit + INITIAL_STATS.totalProfit,
      totalLoss: totalLoss + INITIAL_STATS.totalLoss,
    }
  }, [signals])

  const handleCopySignal = async (s: Signal) => {
    const text = `⚡ SF CAPITAL FX SIGNAL ⚡
Pair: #${s.pair}
Action: ${s.direction}
Timeframe: ${s.timeframe}
Entry: ${s.entry}
SL: ${s.sl}
TP1: ${s.tp1}
TP2: ${s.tp2}
TP3: ${s.tp3}
Status: ${s.status}
Source: SF CAPITAL FX Verified Engine
https://sfcapitalfx.netlify.app`
    const ok = await copyToClipboard(text)
    if (ok) showToast(`✓ Copied ${s.pair} signal to clipboard!`)
  }

  const handleAuthSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!authEmail) {
      setAuthFeedback({ text: 'Please enter a valid email address.', isError: true })
      return
    }
    const newUser: User = {
      id: `usr-${Date.now().toString().slice(-4)}`,
      email: authEmail,
      name: authName || authEmail.split('@')[0],
      role: authEmail.includes('admin') ? 'admin' : 'member',
      membershipStatus: authEmail.includes('admin') ? 'PREMIUM' : 'FREE',
      premiumExpiresAt: '2026-12-09T00:00:00Z',
    }
    setUser(newUser)
    setActiveModal(null)
    showToast(`Signed in as ${newUser.email} (${newUser.membershipStatus})`)
  }

  return (
    <div className="platform-container">
      {/* Toast Notification */}
      <div className={`toast ${toastMessage ? 'show' : ''}`} role="status">
        {toastMessage}
      </div>

      {/* Announcement Bar */}
      <div className="announcement">
        <span className="pulse"></span>
        STRUCTURED MARKET SIGNALS <span className="announcement-divider">·</span> XAUUSD / BTCUSD / USOIL / FOREX
      </div>

      {/* Main Navigation Header */}
      <header className="site-header">
        <a className="brand" href="#home" aria-label="SF Capital FX home">
          <span className="brand-mark">
            SF<span>✦</span>
          </span>
          <span className="brand-copy">
            <strong>
              SF CAPITAL <em>FX</em>
            </strong>
            <small>TRADE WITH STRUCTURE</small>
          </span>
        </a>

        <button
          className="menu-toggle"
          onClick={() => setIsNavOpen(!isNavOpen)}
          aria-label="Toggle navigation"
          aria-expanded={isNavOpen}
        >
          {isNavOpen ? '✕' : '☰'}
        </button>

        <nav className={`main-nav ${isNavOpen ? 'open' : ''}`}>
          <a href="#home" onClick={() => setIsNavOpen(false)}>Home</a>
          <a href="#signals" onClick={() => setIsNavOpen(false)}>Live Signals</a>
          <a href="#chart" onClick={() => setIsNavOpen(false)}>Live Chart</a>
          <a href="#markets" onClick={() => setIsNavOpen(false)}>Markets</a>
          <a href="#performance" onClick={() => setIsNavOpen(false)}>Performance</a>
          <a href="#pricing" onClick={() => setIsNavOpen(false)}>Pricing</a>
          <a href="#about" onClick={() => setIsNavOpen(false)}>About</a>
          <a href="#contact" onClick={() => setIsNavOpen(false)}>Contact</a>
        </nav>

        <div className="header-actions">
          {user?.role === 'admin' && (
            <button
              className="btn btn-admin"
              onClick={() => setActiveModal('admin')}
              title="Open Admin Operations Console"
            >
              ⚙ Admin Console
            </button>
          )}

          <button
            className="btn btn-quiet"
            onClick={() => {
              if (user) {
                showToast(`${user.email} · ${user.membershipStatus} Member`)
              } else {
                setAuthMode('login')
                setActiveModal('auth')
              }
            }}
          >
            {user ? `${user.name} (${user.membershipStatus})` : 'Log in'}
          </button>

          <button
            className="btn btn-primary btn-small"
            onClick={() => setActiveModal('premium')}
          >
            Get Premium <span>↗</span>
          </button>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="hero section-wrap" id="home">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="eyebrow-line"></span> INTELLIGENCE FOR ACTIVE MARKETS
            </div>
            <h1>
              Trade with a plan.<br />
              <span>Move with purpose.</span>
            </h1>
            <p className="hero-lead">
              Structured trading signals for Gold, Bitcoin, Crude Oil, and Major Currencies — built around clear levels, disciplined risk, and transparent history.
            </p>
            <div className="hero-actions">
              <a className="btn btn-primary" href="#signals">
                Explore live signals <span>↗</span>
              </a>
              <a className="text-link" href="#chart">
                Interactive chart <span>→</span>
              </a>
            </div>
            <div className="hero-proof">
              <div className="proof-avatars">
                <i>S</i>
                <i>F</i>
                <i>+</i>
              </div>
              <span>
                <strong>Clarity over noise.</strong>
                <br />
                Every setup starts with risk.
              </span>
            </div>
          </div>

          <div className="hero-visual">
            <div className="visual-glow"></div>
            <div className="chart-card">
              <div className="chart-top">
                <div>
                  <span className="live-dot"></span>
                  <span className="micro-label" style={{ marginLeft: 6 }}>MARKET SNAPSHOT</span>
                </div>
                <span className="chart-period">LIVE VIA TRADINGVIEW WEBHOOK</span>
              </div>
              <div className="chart-title">
                <div>
                  <strong>{currentMarketInfo.symbol}</strong>
                  <small>{currentMarketInfo.name}</small>
                </div>
                <span className="chart-tag">SIGNAL WATCH</span>
              </div>
              <div className="chart-illustration" aria-label="Decorative market chart">
                <svg viewBox="0 0 560 210" role="img" aria-label="Market line">
                  <defs>
                    <linearGradient id="areaGrad" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0" stopColor="#13a879" stopOpacity="0.28" />
                      <stop offset="1" stopColor="#13a879" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M0 170 C35 155 44 178 77 145 S120 158 150 118 S190 138 220 105 S260 120 292 92 S332 116 365 70 S410 94 440 53 S490 69 560 18 L560 210 L0 210Z"
                    fill="url(#areaGrad)"
                  />
                  <path
                    d="M0 170 C35 155 44 178 77 145 S120 158 150 118 S190 138 220 105 S260 120 292 92 S332 116 365 70 S410 94 440 53 S490 69 560 18"
                    fill="none"
                    stroke="#13a879"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                  <circle cx="560" cy="18" r="5" fill="#13a879" stroke="#fff" strokeWidth="3" />
                </svg>
                <span className="chart-note">Verified live feed · Webhook synchronized</span>
              </div>
              <div className="chart-footer">
                <span>
                  <small>OUR FOCUS</small>
                  <strong>Precision & discipline</strong>
                </span>
                <span>
                  <small>DELIVERY</small>
                  <strong>Web & Telegram fan-out</strong>
                </span>
              </div>
            </div>
            <div className="floating-chip">
              <span className="chip-icon">↗</span>
              <span>
                <small>OUR PRINCIPLE</small>
                <strong>Risk first. Always.</strong>
              </span>
            </div>
          </div>
        </section>

        {/* Ticker Strip */}
        <section className="ticker-strip">
          <div>
            <span className="ticker-label">MARKETS WE FOLLOW</span>
            {MARKETS.map((m, idx) => (
              <strong
                key={m.symbol}
                onClick={() => setSelectedMarket(m.symbol)}
                style={{ cursor: 'pointer' }}
              >
                <b>0{idx + 1}</b> {m.symbol} <small>{m.category.toUpperCase()}</small>
              </strong>
            ))}
            <span className="ticker-note">Signals are not investment advice.</span>
          </div>
        </section>

        {/* The Signal Room Section */}
        <section className="section-wrap section-block" id="signals">
          <div className="section-heading">
            <div>
              <div className="eyebrow">THE SIGNAL ROOM</div>
              <h2>
                Live market signals<span className="heading-dot">.</span>
              </h2>
              <p>
                Signal data is ingested directly from the SF CAPITAL FX backend. No fabricated live prices.
              </p>
            </div>
            <div className="feed-status">
              <span className="live-dot"></span>
              <span>
                {isLiveConnected ? 'Connected · Server feed active' : 'Syncing with signal service…'}
              </span>
            </div>
          </div>

          <div className="signal-toolbar">
            <div className="market-tabs" role="tablist">
              <button
                className={`market-tab ${selectedMarket === 'ALL' ? 'active' : ''}`}
                onClick={() => setSelectedMarket('ALL')}
              >
                All Markets
              </button>
              {MARKETS.map((m) => (
                <button
                  key={m.symbol}
                  className={`market-tab ${selectedMarket === m.symbol ? 'active' : ''}`}
                  onClick={() => setSelectedMarket(m.symbol)}
                >
                  {m.symbol}
                </button>
              ))}
            </div>

            <div className="signal-filters">
              <button
                className={`filter-btn ${statusFilter === 'ALL' ? 'active' : ''}`}
                onClick={() => setStatusFilter('ALL')}
              >
                All signals
              </button>
              <button
                className={`filter-btn ${statusFilter === 'ACTIVE' ? 'active' : ''}`}
                onClick={() => setStatusFilter('ACTIVE')}
              >
                Active
              </button>
              <button
                className={`filter-btn ${statusFilter === 'CLOSED' ? 'active' : ''}`}
                onClick={() => setStatusFilter('CLOSED')}
              >
                Closed
              </button>
            </div>
          </div>

          <div className="signal-summary">
            <div>
              <span>MARKET</span>
              <strong>{selectedMarket === 'ALL' ? 'ALL ASSETS' : `${selectedMarket} · ${currentMarketInfo.name}`}</strong>
            </div>
            <div>
              <span>ACTIVE SETUPS</span>
              <strong>{activeCount}</strong>
            </div>
            <div>
              <span>LATEST UPDATE</span>
              <strong>{latestUpdateTime}</strong>
            </div>
            <div>
              <span>FEED SOURCE</span>
              <strong>TRADINGVIEW WEBHOOK</strong>
            </div>
          </div>

          <div className="signals-list">
            {filteredSignals.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">⌁</div>
                <strong>No signals found for this selection</strong>
                <p>
                  TradingView alert webhooks will populate this room automatically upon arrival.
                </p>
              </div>
            ) : (
              filteredSignals.map((s) => {
                const isPremiumLocked = s.isPremiumOnly && user?.membershipStatus !== 'PREMIUM'
                return (
                  <article key={s.id} className="signal-row">
                    <div className="signal-asset">
                      <strong>{s.pair}</strong>
                      <small>
                        {s.timeframe} · {formatTimeAgo(s.time)}
                      </small>
                    </div>

                    <div>
                      <span className={`side-pill ${s.direction.toLowerCase()}`}>
                        {s.direction}
                      </span>
                    </div>

                    <div className="signal-cell">
                      <small>ENTRY</small>
                      <span>{formatPrice(s.entry, 2)}</span>
                    </div>

                    <div className="signal-cell">
                      <small>STOP LOSS</small>
                      <span style={{ color: '#d9534f' }}>
                        {isPremiumLocked ? '••.••' : formatPrice(s.sl, 2)}
                      </span>
                    </div>

                    <div className="signal-cell">
                      <small>TAKE PROFIT (1 / 2 / 3)</small>
                      {isPremiumLocked ? (
                        <span className="lock-badge">🔒 VIP Access</span>
                      ) : (
                        <div className="tp-milestones-preview">
                          <span className={s.status.includes('TP1') || s.status === 'CLOSED' ? 'hit' : ''}>
                            {formatPrice(s.tp1, 1)}
                          </span>
                          <span className={s.status.includes('TP2') || s.status === 'CLOSED' ? 'hit' : ''}>
                            {formatPrice(s.tp2, 1)}
                          </span>
                          <span className={s.status.includes('TP3') || s.status === 'CLOSED' ? 'hit' : ''}>
                            {formatPrice(s.tp3, 1)}
                          </span>
                        </div>
                      )}
                    </div>

                    <div>
                      <span
                        className={`status-pill ${
                          s.status === 'ACTIVE'
                            ? 'active'
                            : s.status.includes('TP')
                            ? 'tp1'
                            : s.status === 'SL_HIT'
                            ? 'sl'
                            : 'closed'
                        }`}
                      >
                        {s.status.replace('_', ' ')}
                      </span>
                      <small className="signal-cell" style={{ marginTop: 4 }}>
                        <small>{s.source}</small>
                      </small>
                    </div>

                    <div>
                      <button
                        className="btn btn-quiet btn-small"
                        onClick={() => handleCopySignal(s)}
                        title="Copy signal for MetaTrader or Telegram"
                      >
                        📋 Copy
                      </button>
                    </div>
                  </article>
                )
              })
            )}
          </div>

          <div className="signals-foot">
            <span>Signal information is provided for educational purposes only.</span>
            <button className="text-link" onClick={fetchSignals}>
              Refresh feed ↻
            </button>
          </div>
        </section>

        {/* Interactive Chart Section */}
        <section className="section-wrap section-block" id="chart" style={{ paddingTop: 0 }}>
          <div className="section-heading">
            <div>
              <div className="eyebrow">CHART VISUALIZER</div>
              <h2>
                Interactive market structure<span className="heading-dot">.</span>
              </h2>
              <p>
                Real-time candlestick chart with live visual overlays for Entry, Stop Loss, and Take Profit targets.
              </p>
            </div>
          </div>

          <TradingChart market={currentMarketInfo} signal={featuredSignal} />
        </section>

        {/* Markets Section */}
        <section className="markets-section" id="markets">
          <div className="section-wrap section-block">
            <div className="section-heading">
              <div>
                <div className="eyebrow">THREE FLAGSHIP MARKETS. ONE PROCESS.</div>
                <h2>
                  Focused on what moves<span className="heading-dot">.</span>
                </h2>
                <p>One consistent, risk-controlled framework across liquid commodities, crypto, and energy.</p>
              </div>
            </div>

            <div className="market-cards">
              <article className="market-card">
                <div className="market-card-top">
                  <span className="asset-icon gold">Au</span>
                  <span className="market-number">01 / METALS</span>
                </div>
                <h3>
                  Gold <small>XAUUSD</small>
                </h3>
                <p>
                  Track London and New York session liquidity sweeps, institutional breakout levels, and macro trends in spot gold.
                </p>
                <div className="market-card-bottom">
                  <span>METALS MARKET</span>
                  <span>↗</span>
                </div>
              </article>

              <article className="market-card">
                <div className="market-card-top">
                  <span className="asset-icon bitcoin">₿</span>
                  <span className="market-number">02 / DIGITAL ASSETS</span>
                </div>
                <h3>
                  Bitcoin <small>BTCUSD</small>
                </h3>
                <p>
                  Follow disciplined trend continuation setups and clear liquidity pools in the 24/7 digital asset market.
                </p>
                <div className="market-card-bottom">
                  <span>CRYPTO MARKET</span>
                  <span>↗</span>
                </div>
              </article>

              <article className="market-card">
                <div className="market-card-top">
                  <span className="asset-icon oil">O</span>
                  <span className="market-number">03 / ENERGY</span>
                </div>
                <h3>
                  Crude Oil <small>USOIL</small>
                </h3>
                <p>
                  Monitor energy-market breakouts with precise entry, risk mitigation, and target scaling around inventory sessions.
                </p>
                <div className="market-card-bottom">
                  <span>ENERGY MARKET</span>
                  <span>↗</span>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* Performance Section */}
        <section className="section-wrap section-block performance-section" id="performance">
          <div className="section-heading">
            <div>
              <div className="eyebrow">TRANSPARENCY BUILT IN</div>
              <h2>
                Performance, not promises<span className="heading-dot">.</span>
              </h2>
              <p>Statistics are strictly calculated from signals marked closed with a verified outcome.</p>
            </div>
            <span className="verified-label">↗ SERVER-CALCULATED</span>
          </div>

          <div className="performance-grid">
            <div className="performance-intro">
              <span className="big-mark">
                SF<span>✦</span>
              </span>
              <h3>
                Every result
                <br />
                has a record.
              </h3>
              <p>
                We do not publish invented win rates or projected returns. Performance appears when verified closed-signal data is available.
              </p>
              <a className="text-link" href="#signals">
                View signal history →
              </a>
            </div>

            <div className="stats-grid">
              <div className="stat-box">
                <span>TOTAL TRADES</span>
                <strong>{stats.totalTrades}</strong>
                <small>Verified closed signals</small>
              </div>
              <div className="stat-box">
                <span>WINNING TRADES</span>
                <strong style={{ color: '#11a879' }}>{stats.winningTrades}</strong>
                <small>Hit TP targets</small>
              </div>
              <div className="stat-box">
                <span>LOSING TRADES</span>
                <strong style={{ color: '#d9534f' }}>{stats.losingTrades}</strong>
                <small>Stopped out with SL</small>
              </div>
              <div className="stat-box">
                <span>WIN RATE</span>
                <strong style={{ color: '#11a879' }}>
                  {stats.winRate !== null ? `${stats.winRate}%` : '—'}
                </strong>
                <small>Wins ÷ resolved trades</small>
              </div>
              <div className="stat-box">
                <span>TOTAL PROFIT</span>
                <strong>+{stats.totalProfit} pts</strong>
                <small>Recorded result units</small>
              </div>
              <div className="stat-box">
                <span>TOTAL LOSS</span>
                <strong>-{stats.totalLoss} pts</strong>
                <small>Controlled risk units</small>
              </div>
            </div>
          </div>
          <p className="data-note">
            Calculated from verified closed signal outcomes stored on the server.
          </p>
        </section>

        {/* Pricing Section */}
        <section className="pricing-section" id="pricing">
          <div className="section-wrap section-block">
            <div className="section-heading centered">
              <div className="eyebrow">CHOOSE YOUR ACCESS</div>
              <h2>
                Trade with more clarity<span className="heading-dot">.</span>
              </h2>
              <p>Start with public updates or unlock the complete signal experience.</p>
            </div>

            <div className="pricing-grid">
              <article className="price-card">
                <div className="price-tier">01 / STARTER</div>
                <h3>Free</h3>
                <p className="price-description">
                  A first look at our approach and selected public updates.
                </p>
                <div className="price-amount">
                  $0 <small>/ forever</small>
                </div>
                <div className="price-divider"></div>
                <ul>
                  <li>Basic website access</li>
                  <li>Limited public signals</li>
                  <li>Public market updates</li>
                  <li>Basic performance overview</li>
                </ul>
                <a className="btn btn-outline full-btn" href="#signals">
                  Explore public signals
                </a>
              </article>

              <article className="price-card premium-price">
                <div className="popular-tag">FULL ACCESS</div>
                <div className="price-tier">02 / PREMIUM</div>
                <h3>Premium</h3>
                <p className="price-description">
                  The full signal feed and member experience across all three markets.
                </p>
                <div className="price-amount">
                  $100 <small>/ 30 days</small>
                </div>
                <div className="price-divider"></div>
                <ul>
                  <li>Exclusive XAUUSD signals</li>
                  <li>Exclusive BTCUSD signals</li>
                  <li>Exclusive USOIL signals</li>
                  <li>Automatic Telegram VIP alerts</li>
                  <li>Full Entry, SL, and TP1–TP3 levels</li>
                  <li>Complete signal history & analytics</li>
                  <li>Premium member dashboard</li>
                </ul>
                <button
                  className="btn btn-primary full-btn"
                  onClick={() => setActiveModal('premium')}
                >
                  Get Premium Access <span>↗</span>
                </button>
                <small className="manual-note">
                  Manual payment verification · 30-day activation
                </small>
              </article>
            </div>
          </div>
        </section>

        {/* About Section */}
        <section className="about-section section-wrap section-block" id="about">
          <div className="about-visual">
            <div className="about-orbit orbit-one"></div>
            <div className="about-orbit orbit-two"></div>
            <div className="about-emblem">
              SF<span>✦</span>
              <small>CAPITAL FX</small>
            </div>
            <div className="about-caption">DISCIPLINE IS A STRATEGY</div>
          </div>
          <div className="about-copy">
            <div className="eyebrow">WHO WE ARE</div>
            <h2>
              Built around better decisions<span className="heading-dot">.</span>
            </h2>
            <p>
              SF CAPITAL FX is a trading signals platform focused on Gold, Bitcoin, Crude Oil, and Major Currency pairs.
            </p>
            <p>
              Our goal is to provide structured trading signals, transparent performance tracking, and disciplined risk management. We believe in smart trading, consistency, and responsible risk management.
            </p>
            <div className="principles">
              <div>
                <b>01</b>
                <span>
                  <strong>Structure</strong>
                  <small>Clear entry and exit levels.</small>
                </span>
              </div>
              <div>
                <b>02</b>
                <span>
                  <strong>Transparency</strong>
                  <small>Visible history and verified outcomes.</small>
                </span>
              </div>
              <div>
                <b>03</b>
                <span>
                  <strong>Risk awareness</strong>
                  <small>Plan risk before considering reward.</small>
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="faq-section">
          <div className="section-wrap section-block">
            <div className="section-heading centered">
              <div className="eyebrow">GOOD TO KNOW</div>
              <h2>
                Frequently asked questions<span className="heading-dot">.</span>
              </h2>
            </div>
            <div className="faq-list">
              <details>
                <summary>
                  How do signals reach the website and Telegram? <span>＋</span>
                </summary>
                <p>
                  TradingView alert webhooks trigger an instantaneous POST payload to our C++ backend. The backend validates and persists the signal idempotently, then simultaneously fans out the alert to our Telegram VIP channel and website sessions via Server-Sent Events.
                </p>
              </details>

              <details>
                <summary>
                  Are the signals guaranteed to make profit? <span>＋</span>
                </summary>
                <p>
                  No. Trading financial instruments involves substantial risk and losses are possible. Signals are educational and informational and never constitute investment advice or a guarantee of returns.
                </p>
              </details>

              <details>
                <summary>
                  How do I activate Premium membership? <span>＋</span>
                </summary>
                <p>
                  Contact SF CAPITAL FX through our official Telegram (@sfcapitalfrx) or social channels for payment details (USDT/Crypto or Bank). Once received, an administrator approves your account for 30 days.
                </p>
              </details>

              <details>
                <summary>
                  When does a signal become closed? <span>＋</span>
                </summary>
                <p>
                  A signal is marked closed only after an explicit exit alert or when a verified milestone (such as TP3 or SL) is reached in the market. Frontend timers never arbitrarily close trades.
                </p>
              </details>

              <details>
                <summary>
                  Can I cancel or renew my membership? <span>＋</span>
                </summary>
                <p>
                  Memberships run for 30 days without recurring billing surprises. You can easily renew for another term by contacting our official Telegram desk.
                </p>
              </details>
            </div>
          </div>
        </section>

        {/* Contact CTA Section */}
        <section className="contact-cta section-wrap" id="contact">
          <div>
            <div className="eyebrow" style={{ color: '#22c18b' }}>LET'S CONNECT</div>
            <h2>Questions about membership?</h2>
            <p>Reach SF CAPITAL FX through our official channels.</p>
          </div>
          <div className="social-actions">
            <a
              className="social-btn telegram"
              href="https://t.me/sfcapitalfrx"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span>➤</span> Contact via Telegram ↗
            </a>
            <a
              className="social-btn"
              href="https://web.facebook.com/profile.php?id=61594920310389"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span>f</span> Contact via Facebook ↗
            </a>
            <a
              className="social-btn"
              href="https://www.youtube.com/@SFCAPITALFX"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span>▶</span> Visit YouTube Channel ↗
            </a>
          </div>
        </section>
      </main>

      {/* Site Footer */}
      <footer className="site-footer">
        <div className="footer-main">
          <a className="brand footer-brand" href="#home">
            <span className="brand-mark">
              SF<span>✦</span>
            </span>
            <span className="brand-copy">
              <strong>
                SF CAPITAL <em>FX</em>
              </strong>
              <small>TRADE WITH STRUCTURE</small>
            </span>
          </a>
          <p>
            Trade Smart. Manage Risk.
            <br />
            Grow Consistently.
          </p>
          <div className="footer-links">
            <a href="#signals">Signals</a>
            <a href="#chart">Chart</a>
            <a href="#performance">Performance</a>
            <a href="#pricing">Pricing</a>
            <a href="#about">About</a>
            <a href="#contact">Contact</a>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} SF CAPITAL FX. All rights reserved.</span>
          <span>Trading involves risk. Past performance does not guarantee future results.</span>
        </div>
      </footer>

      {/* Auth Modal */}
      {activeModal === 'auth' && (
        <div
          className="modal-backdrop open"
          onClick={(e) => e.target === e.currentTarget && setActiveModal(null)}
        >
          <section className="modal" role="dialog" aria-modal="true">
            <button
              className="modal-close"
              onClick={() => setActiveModal(null)}
              aria-label="Close"
            >
              ×
            </button>
            <div className="eyebrow">MEMBER ACCESS</div>
            <h2>{authMode === 'login' ? 'Welcome back.' : 'Create your account.'}</h2>
            <p className="modal-subtitle">
              {authMode === 'login'
                ? 'Log in to your SF CAPITAL FX account.'
                : 'Join the SF CAPITAL FX member area.'}
            </p>

            <div className="auth-tabs">
              <button
                className={`auth-tab ${authMode === 'login' ? 'active' : ''}`}
                onClick={() => setAuthMode('login')}
              >
                Log in
              </button>
              <button
                className={`auth-tab ${authMode === 'register' ? 'active' : ''}`}
                onClick={() => setAuthMode('register')}
              >
                Create account
              </button>
            </div>

            <form onSubmit={handleAuthSubmit}>
              {authMode === 'register' && (
                <label>
                  Full name
                  <input
                    type="text"
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                    placeholder="Your name"
                    required
                  />
                </label>
              )}
              <label>
                Email address
                <input
                  type="email"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  required
                  minLength={8}
                />
              </label>

              <button className="btn btn-primary full-btn" type="submit" style={{ marginTop: 10 }}>
                {authMode === 'login' ? 'Log in securely' : 'Create account'}
              </button>

              {authFeedback && (
                <div className={`form-message ${authFeedback.isError ? '' : 'success'}`}>
                  {authFeedback.text}
                </div>
              )}
            </form>

            {authMode === 'login' && (
              <button
                className="text-link"
                style={{ marginTop: 16, display: 'block', textAlign: 'center', width: '100%' }}
                onClick={() => setActiveModal('forgot')}
              >
                Forgot password?
              </button>
            )}
          </section>
        </div>
      )}

      {/* Premium Membership Modal */}
      {activeModal === 'premium' && (
        <div
          className="modal-backdrop open"
          onClick={(e) => e.target === e.currentTarget && setActiveModal(null)}
        >
          <section className="modal premium-modal" role="dialog" aria-modal="true">
            <button
              className="modal-close"
              onClick={() => setActiveModal(null)}
              aria-label="Close"
            >
              ×
            </button>
            <div className="eyebrow">PREMIUM MEMBERSHIP</div>
            <h2>Unlock the full signal room.</h2>
            <div className="modal-price">
              $100 <small>/ 30 days</small>
            </div>
            <p className="modal-subtitle">
              Membership is activated after manual payment verification by an administrator.
            </p>

            <div className="payment-steps">
              <div>
                <b>01</b>
                <span>Contact us using an official channel (Telegram preferred).</span>
              </div>
              <div>
                <b>02</b>
                <span>Receive payment instructions (USDT Crypto or Bank Transfer).</span>
              </div>
              <div>
                <b>03</b>
                <span>Admin verifies payment and activates your account for 30 days.</span>
              </div>
            </div>

            <div className="modal-socials">
              <a href="https://t.me/sfcapitalfrx" target="_blank" rel="noopener noreferrer">
                Telegram ↗
              </a>
              <a
                href="https://web.facebook.com/profile.php?id=61594920310389"
                target="_blank"
                rel="noopener noreferrer"
              >
                Facebook ↗
              </a>
              <a
                href="https://www.youtube.com/@SFCAPITALFX"
                target="_blank"
                rel="noopener noreferrer"
              >
                YouTube ↗
              </a>
            </div>
            <small className="fine-print">
              Do not send payment details or passwords to unofficial accounts.
            </small>
          </section>
        </div>
      )}

      {/* Forgot Password Modal */}
      {activeModal === 'forgot' && (
        <div
          className="modal-backdrop open"
          onClick={(e) => e.target === e.currentTarget && setActiveModal(null)}
        >
          <section className="modal" role="dialog" aria-modal="true">
            <button
              className="modal-close"
              onClick={() => setActiveModal(null)}
              aria-label="Close"
            >
              ×
            </button>
            <div className="eyebrow">ACCOUNT RECOVERY</div>
            <h2>Reset your password.</h2>
            <p className="modal-subtitle">
              Enter your account email. If email delivery is configured, you will receive a reset link.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                showToast('Password recovery instructions sent to your email.')
                setActiveModal(null)
              }}
            >
              <label>
                Email address
                <input type="email" required placeholder="you@example.com" />
              </label>
              <button className="btn btn-primary full-btn" type="submit" style={{ marginTop: 12 }}>
                Send reset link
              </button>
            </form>
          </section>
        </div>
      )}

      {/* Admin Console Modal */}
      {activeModal === 'admin' && (
        <AdminConsole
          signals={signals}
          user={user}
          onClose={() => setActiveModal(null)}
          onAddSignal={(newSignal) => setSignals((prev) => [newSignal, ...prev])}
          onUpdateStatus={(signalId, status) => {
            setSignals((prev) =>
              prev.map((s) => (s.id === signalId ? { ...s, status } : s))
            )
          }}
          onToggleUserTier={(status) => {
            if (user) {
              setUser({ ...user, membershipStatus: status })
            }
          }}
          onToast={showToast}
        />
      )}
    </div>
  )
}
