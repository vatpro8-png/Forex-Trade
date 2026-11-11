import React, { useEffect, useState } from 'react'
import type { Signal, SignalStatus, User } from '../model/types'
import { MARKETS } from '../model/symbols'

interface AdminConsoleProps {
  signals: Signal[]
  user: User | null
  onClose: () => void
  onAddSignal: (signal: Signal) => void
  onUpdateSignal: (signal: Signal) => void
  onToast: (msg: string) => void
}

interface TelegramDelivery {
  id: string
  signalId: string
  messageType: string
  status: string
  lastAttemptAt: string
  lastError?: string | null
}

export const AdminConsole: React.FC<AdminConsoleProps> = ({
  signals,
  user,
  onClose,
  onAddSignal,
  onUpdateSignal,
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
  const [secret, setSecret] = useState('')
  const [isSimulating, setIsSimulating] = useState(false)
  const [targetEmail, setTargetEmail] = useState('')
  const [paymentReference, setPaymentReference] = useState('')
  const [isActivating, setIsActivating] = useState(false)
  const [telegramDeliveries, setTelegramDeliveries] = useState<TelegramDelivery[]>([])
  const [telegramError, setTelegramError] = useState<string | null>(null)
  const [isTelegramLoading, setIsTelegramLoading] = useState(false)

  useEffect(() => {
    if (tab !== 'telegram') return

    const token = localStorage.getItem('sf-session-token')
    if (!token) {
      setTelegramError('Admin authentication is required.')
      return
    }

    let isCurrent = true
    setIsTelegramLoading(true)
    setTelegramError(null)
    fetch('/api/admin/telegram/deliveries', { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Unable to load Telegram delivery history.')
        return data as TelegramDelivery[]
      })
      .then((data) => {
        if (isCurrent) setTelegramDeliveries(data)
      })
      .catch((error) => {
        if (isCurrent) setTelegramError(error instanceof Error ? error.message : 'Unable to load Telegram delivery history.')
      })
      .finally(() => {
        if (isCurrent) setIsTelegramLoading(false)
      })

    return () => {
      isCurrent = false
    }
  }, [tab])

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
      const response = await fetch('/api/webhooks/tradingview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = await response.json()
      if (!response.ok || !result.accepted) throw new Error(result.error || 'Webhook request failed.')
      if (result.signal) onAddSignal(result.signal)
      onToast(`Backend accepted ${selectedPair} ${direction}.`)
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'Webhook request failed.')
    } finally {
      setIsSimulating(false)
    }
  }

  const handleUpdateMilestone = async (signalId: string, status: SignalStatus) => {
    try {
      const token = localStorage.getItem('sf-session-token')
      const response = await fetch('/api/signals/milestone', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ id: signalId, status }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Milestone update failed.')
      onUpdateSignal(result.signal)
      onToast(`Signal ${signalId} updated to ${status}.`)
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'Milestone update failed.')
    }
  }

  const handleActivateMember = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsActivating(true)
    try {
      const token = localStorage.getItem('sf-session-token')
      const response = await fetch('/api/admin/subscriptions/activate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ email: targetEmail, days: 30, reference: paymentReference }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Membership activation failed.')
      setTargetEmail('')
      setPaymentReference('')
      onToast(`30-day VIP activated for ${result.user.email}.`)
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'Membership activation failed.')
    } finally {
      setIsActivating(false)
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
                type="password"
                value={secret}
                autoComplete="off"
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
              Sends this test payload to the configured backend. It is not created locally if the request fails.
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
                      void handleUpdateMilestone(s.id, 'TP1_HIT')
                    }}
                  >
                    TP1 Hit
                  </button>
                  <button
                    className="btn btn-small"
                    style={{ background: '#e4f6ef', color: '#087b59', border: '1px solid #11a879' }}
                    onClick={() => {
                      void handleUpdateMilestone(s.id, 'TP2_HIT')
                    }}
                  >
                    TP2 Hit
                  </button>
                  <button
                    className="btn btn-small"
                    style={{ background: '#fdf2f2', color: '#d9534f', border: '1px solid #d9534f' }}
                    onClick={() => {
                      void handleUpdateMilestone(s.id, 'SL_HIT')
                    }}
                  >
                    SL Hit
                  </button>
                  <button
                    className="btn btn-small"
                    style={{ background: '#102c49', color: '#fff' }}
                    onClick={() => {
                      void handleUpdateMilestone(s.id, 'CLOSED')
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
            <p className="admin-notice">Signed in as {user?.email}. Verify the payment independently before granting access.</p>
            <form className="admin-form" onSubmit={handleActivateMember}>
              <label>
                Member email
                <input type="email" value={targetEmail} onChange={(e) => setTargetEmail(e.target.value)} required />
              </label>
              <label>
                Verified payment reference
                <input type="text" value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} required />
              </label>
              <button type="submit" className="btn btn-primary full-btn" disabled={isActivating}>
                {isActivating ? 'Activating…' : 'Activate 30-day VIP'}
              </button>
            </form>
          </div>
        )}

        {tab === 'telegram' && (
          <div className="admin-telegram-view">
            <div className="telegram-status-summary">
              <div>
                <small>TELEGRAM DELIVERY HISTORY</small>
                <strong>Latest backend outbox records</strong>
              </div>
              <span className="data-note">{isTelegramLoading ? 'Loading' : `${telegramDeliveries.length} records`}</span>
            </div>
            {telegramError ? (
              <p className="admin-notice" role="alert">{telegramError}</p>
            ) : telegramDeliveries.length === 0 && !isTelegramLoading ? (
              <p className="admin-notice">No delivery records are available. Confirm that the backend and Telegram credentials are configured.</p>
            ) : (
              <div className="admin-milestone-list">
                {telegramDeliveries.map((delivery) => (
                  <div className="admin-signal-row" key={delivery.id}>
                    <div>
                      <strong>{delivery.messageType}</strong>
                      <div style={{ fontSize: 11, color: '#8293a4' }}>
                        Signal: {delivery.signalId} · {new Date(delivery.lastAttemptAt).toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <strong>{delivery.status}</strong>
                      {delivery.lastError && <div style={{ fontSize: 11, color: '#d9534f' }}>{delivery.lastError}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
