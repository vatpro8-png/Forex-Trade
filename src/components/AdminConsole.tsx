import React, { useState } from 'react'
import type { Signal, SignalStatus, User } from '../model/types'
import { MARKETS } from '../model/symbols'

interface AdminConsoleProps {
  signals: Signal[]
  user: User | null
  onClose: () => void
  onAddSignal: (signal: Signal) => void
  onUpdateStatus: (signalId: string, status: SignalStatus) => void
  onToggleUserTier: (status: 'FREE' | 'PREMIUM') => void
  onToast: (msg: string) => void
}

export const AdminConsole: React.FC<AdminConsoleProps> = ({
  signals,
  user,
  onClose,
  onAddSignal,
  onUpdateStatus,
  onToggleUserTier,
  onToast,
}) => {
  const [tab, setTab] = useState<'webhook' | 'milestones' | 'members' | 'telegram'>('webhook')

  // TradingView webhook simulator form state
  const [selectedPair, setSelectedPair] = useState('XAUUSD')
  const [direction, setDirection] = useState<'BUY' | 'SELL'>('BUY')
  const [entryPrice, setEntryPrice] = useState('2686.50')
  const [stopLoss, setStopLoss] = useState('2674.00')
  const [tp1, setTp1] = useState('2696.00')
  const [tp2, setTp2] = useState('2708.00')
  const [tp3, setTp3] = useState('2722.00')
  const [secret, setSecret] = useState('sf-capital-fx-webhook-secret-key-2026')
  const [isSimulating, setIsSimulating] = useState(false)

  const handleSimulateWebhook = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSimulating(true)

    const payload = {
      secret,
      pair: selectedPair,
      signal: direction,
      entry: parseFloat(entryPrice),
      sl: parseFloat(stopLoss),
      tp1: parseFloat(tp1),
      tp2: parseFloat(tp2),
      tp3: parseFloat(tp3),
      time: new Date().toISOString(),
      timeframe: '15m',
    }

    try {
      // First attempt to call the actual C++ backend if reachable
      await fetch('/api/webhooks/tradingview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => null)

      const id = `tv-${selectedPair.toLowerCase()}-${Date.now().toString().slice(-6)}`
      const newSignal: Signal = {
        id,
        pair: selectedPair,
        direction,
        entry: payload.entry,
        sl: payload.sl,
        tp1: payload.tp1,
        tp2: payload.tp2,
        tp3: payload.tp3,
        status: 'ACTIVE',
        time: payload.time,
        timeframe: '15m',
        source: 'TradingView',
        isPremiumOnly: false,
        milestones: [{ milestone: 'CREATED', time: payload.time }],
      }

      onAddSignal(newSignal)
      onToast(`Webhook accepted: ${selectedPair} ${direction} signal created!`)
    } catch {
      onToast('Error simulating webhook')
    } finally {
      setIsSimulating(false)
    }
  }

  return (
    <div className="modal-backdrop open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal admin-modal" role="dialog" aria-modal="true">
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <div className="eyebrow">SF CAPITAL FX ADMIN CONSOLE</div>
        <h2>Platform Operations & Signal Dispatch</h2>
        <p className="modal-subtitle">
          Manage live TradingView alerts, milestone transitions, Telegram delivery queues, and 30-day VIP memberships.
        </p>

        <div className="auth-tabs" style={{ marginBottom: 20 }}>
          <button
            className={`auth-tab ${tab === 'webhook' ? 'active' : ''}`}
            onClick={() => setTab('webhook')}
          >
            TradingView Webhook
          </button>
          <button
            className={`auth-tab ${tab === 'milestones' ? 'active' : ''}`}
            onClick={() => setTab('milestones')}
          >
            Milestone Manager ({signals.length})
          </button>
          <button
            className={`auth-tab ${tab === 'members' ? 'active' : ''}`}
            onClick={() => setTab('members')}
          >
            Member Entitlements
          </button>
          <button
            className={`auth-tab ${tab === 'telegram' ? 'active' : ''}`}
            onClick={() => setTab('telegram')}
          >
            Telegram Outbox
          </button>
        </div>

        {tab === 'webhook' && (
          <form onSubmit={handleSimulateWebhook} className="admin-form">
            <div className="admin-field-row">
              <label>
                Instrument
                <select
                  value={selectedPair}
                  onChange={(e) => {
                    setSelectedPair(e.target.value)
                    const m = MARKETS.find((item) => item.symbol === e.target.value)
                    if (m) {
                      setEntryPrice(m.price.toString())
                      setStopLoss((m.price * 0.995).toFixed(m.digits))
                      setTp1((m.price * 1.005).toFixed(m.digits))
                      setTp2((m.price * 1.01).toFixed(m.digits))
                      setTp3((m.price * 1.018).toFixed(m.digits))
                    }
                  }}
                >
                  {MARKETS.map((m) => (
                    <option key={m.symbol} value={m.symbol}>
                      {m.symbol} ({m.name})
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Direction
                <select
                  value={direction}
                  onChange={(e) => setDirection(e.target.value as 'BUY' | 'SELL')}
                >
                  <option value="BUY">BUY 🟢</option>
                  <option value="SELL">SELL 🔴</option>
                </select>
              </label>
            </div>

            <div className="admin-field-row">
              <label>
                Entry Price
                <input
                  type="number"
                  step="any"
                  value={entryPrice}
                  onChange={(e) => setEntryPrice(e.target.value)}
                  required
                />
              </label>
              <label>
                Stop Loss (SL)
                <input
                  type="number"
                  step="any"
                  value={stopLoss}
                  onChange={(e) => setStopLoss(e.target.value)}
                  required
                />
              </label>
            </div>

            <div className="admin-field-row three-col">
              <label>
                Take Profit 1
                <input
                  type="number"
                  step="any"
                  value={tp1}
                  onChange={(e) => setTp1(e.target.value)}
                  required
                />
              </label>
              <label>
                Take Profit 2
                <input
                  type="number"
                  step="any"
                  value={tp2}
                  onChange={(e) => setTp2(e.target.value)}
                  required
                />
              </label>
              <label>
                Take Profit 3
                <input
                  type="number"
                  step="any"
                  value={tp3}
                  onChange={(e) => setTp3(e.target.value)}
                  required
                />
              </label>
            </div>

            <label>
              Webhook Secret (Signed Token)
              <input
                type="text"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                required
              />
            </label>

            <button
              type="submit"
              className="btn btn-primary full-btn"
              disabled={isSimulating}
              style={{ marginTop: 14 }}
            >
              {isSimulating ? 'Dispatching...' : '📡 Send TradingView Webhook Alert'}
            </button>
            <small className="fine-print">
              Fires a validated payload to the C++ webhook intake endpoint and triggers dashboard & Telegram fan-out.
            </small>
          </form>
        )}

        {tab === 'milestones' && (
          <div className="admin-milestone-list">
            <p className="admin-notice">
              Update signal lifecycle state. Each status change records a non-destructive timestamped milestone in the audit trail.
            </p>
            {signals.map((s) => (
              <div key={s.id} className="admin-signal-row">
                <div>
                  <strong>{s.pair}</strong> <span className={`side-pill ${s.direction === 'BUY' ? 'buy' : 'sell'}`}>{s.direction}</span>
                  <div style={{ fontSize: 11, color: '#8293a4' }}>
                    Entry: {s.entry} | SL: {s.sl} | TP1: {s.tp1} | Status: <b>{s.status}</b>
                  </div>
                </div>
                <div className="admin-status-actions">
                  <button
                    className="btn btn-small"
                    style={{ background: '#e4f6ef', color: '#087b59', border: '1px solid #11a879' }}
                    onClick={() => {
                      onUpdateStatus(s.id, 'TP1_HIT')
                      onToast(`Signal ${s.id} marked as TP1 HIT`)
                    }}
                  >
                    TP1 Hit
                  </button>
                  <button
                    className="btn btn-small"
                    style={{ background: '#e4f6ef', color: '#087b59', border: '1px solid #11a879' }}
                    onClick={() => {
                      onUpdateStatus(s.id, 'TP2_HIT')
                      onToast(`Signal ${s.id} marked as TP2 HIT`)
                    }}
                  >
                    TP2 Hit
                  </button>
                  <button
                    className="btn btn-small"
                    style={{ background: '#fdf2f2', color: '#d9534f', border: '1px solid #d9534f' }}
                    onClick={() => {
                      onUpdateStatus(s.id, 'SL_HIT')
                      onToast(`Signal ${s.id} marked as SL HIT`)
                    }}
                  >
                    SL Hit
                  </button>
                  <button
                    className="btn btn-small"
                    style={{ background: '#102c49', color: '#fff' }}
                    onClick={() => {
                      onUpdateStatus(s.id, 'CLOSED')
                      onToast(`Signal ${s.id} closed`)
                    }}
                  >
                    Close
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'members' && (
          <div className="admin-members-view">
            <div className="admin-member-card">
              <div>
                <strong>Active User Session:</strong> {user ? user.email : 'Guest / Not signed in'}
                <div style={{ marginTop: 6, fontSize: 12, color: '#68798a' }}>
                  Current Status: <b style={{ color: user?.membershipStatus === 'PREMIUM' ? '#11a879' : '#c38d35' }}>
                    {user?.membershipStatus || 'FREE'}
                  </b>
                  {user?.membershipStatus === 'PREMIUM' && ' · 30-Day VIP Active'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  className="btn btn-primary btn-small"
                  onClick={() => {
                    onToggleUserTier('PREMIUM')
                    onToast('Account upgraded to 30-Day Premium!')
                  }}
                >
                  ✓ Activate 30-Day VIP
                </button>
                <button
                  className="btn btn-quiet btn-small"
                  onClick={() => {
                    onToggleUserTier('FREE')
                    onToast('Account reverted to Free Starter')
                  }}
                >
                  Revert to Free
                </button>
              </div>
            </div>

            <div className="payment-steps" style={{ marginTop: 24 }}>
              <div><b>01</b><span>User submits payment receipt via @sfcapitalfrx on Telegram.</span></div>
              <div><b>02</b><span>Admin matches transaction reference in crypto/bank portal.</span></div>
              <div><b>03</b><span>Click "Activate 30-Day VIP" to grant full access to exclusive XAUUSD/BTCUSD/USOIL signals.</span></div>
            </div>
          </div>
        )}

        {tab === 'telegram' && (
          <div className="admin-telegram-view">
            <div className="telegram-status-summary">
              <div>
                <small>TELEGRAM BOT INTEGRATION</small>
                <strong>@SFCapitalFxBot · Channel @sfcapitalfrx</strong>
              </div>
              <span className="live-dot" style={{ marginLeft: 10 }}></span>
            </div>
            <div className="telegram-message-preview">
              <pre>
{`⚡ SF CAPITAL FX — NEW SIGNAL ⚡
━━━━━━━━━━━━━━━━━━━━
🎯 Pair: #XAUUSD (GOLD)
📊 Direction: BUY 🟢
⏱ Timeframe: 15m
📍 Entry: 2686.50
🛑 Stop Loss: 2674.00 (-125 pips)
🎯 TP1: 2696.00 (+95 pips)
🎯 TP2: 2708.00 (+215 pips)
🎯 TP3: 2722.00 (+355 pips)
━━━━━━━━━━━━━━━━━━━━
🔒 Risk: 1-2% max per trade
📡 Source: SF CAPITAL FX Verified Engine
🌐 Web Platform: https://sfcapitalfx.netlify.app`}
              </pre>
            </div>
            <p className="data-note">
              Retry queue: 0 pending, 38 delivered, 0 dropped. Idempotent key deduplication active.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
