import React, { useEffect, useState } from 'react'
import type { MembershipPlanSlug, Signal, SignalStatus, User } from '../model/types'
import { MARKETS } from '../model/symbols'
import { MEMBERSHIP_PLANS } from '../model/pricing'

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

interface SubscriptionRequest {
  id: string
  userId?: string | null
  email?: string
  plan: MembershipPlanSlug
  planName?: string
  durationDays?: number
  amountUsd?: number
  paymentMethod?: string
  reference: string
  status: string
  createdAt: string
}

const PAID_PLANS = MEMBERSHIP_PLANS.filter((p) => p.isPremium)

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
  const [isPremiumOnly, setIsPremiumOnly] = useState(false)
  const [isSimulating, setIsSimulating] = useState(false)

  // Membership verification & activation state
  const [targetEmail, setTargetEmail] = useState('')
  const [selectedPlan, setSelectedPlan] = useState<MembershipPlanSlug>('premium_30d')
  const [paymentReference, setPaymentReference] = useState('')
  const [isActivating, setIsActivating] = useState(false)
  const [subRequests, setSubRequests] = useState<SubscriptionRequest[]>([])

  // Telegram deliveries state
  const [telegramDeliveries, setTelegramDeliveries] = useState<TelegramDelivery[]>([])
  const [telegramError, setTelegramError] = useState<string | null>(null)
  const [isTelegramLoading, setIsTelegramLoading] = useState(false)

  useEffect(() => {
    if (tab !== 'members') return
    const token = localStorage.getItem('sf-session-token')
    if (!token) return
    let active = true
    fetch('/api/admin/subscriptions/requests', { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => (res.ok ? res.json() : []))
      .then((rows) => {
        if (active && Array.isArray(rows)) setSubRequests(rows)
      })
      .catch(() => null)
    return () => {
      active = false
    }
  }, [tab])

  const activePlan = PAID_PLANS.find((p) => p.slug === selectedPlan) || PAID_PLANS[0]

  const applyDefaultLevels = (pairSymbol: string, dir: 'BUY' | 'SELL') => {
    const m = MARKETS.find((item) => item.symbol === pairSymbol)
    if (!m) return
    setEntryPrice(m.price.toFixed(m.digits))
    if (dir === 'BUY') {
      setStopLoss((m.price * 0.995).toFixed(m.digits))
      setTp1((m.price * 1.005).toFixed(m.digits))
      setTp2((m.price * 1.01).toFixed(m.digits))
      setTp3((m.price * 1.018).toFixed(m.digits))
    } else {
      setStopLoss((m.price * 1.005).toFixed(m.digits))
      setTp1((m.price * 0.995).toFixed(m.digits))
      setTp2((m.price * 0.99).toFixed(m.digits))
      setTp3((m.price * 0.982).toFixed(m.digits))
    }
  }

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
        if (isCurrent) {
          setTelegramError(error instanceof Error ? error.message : 'Unable to load Telegram delivery history.')
        }
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
      secret: secret.trim(),
      pair: selectedPair,
      signal: direction,
      entry: parseFloat(entryPrice),
      sl: parseFloat(stopLoss),
      tp1: parseFloat(tp1),
      tp2: parseFloat(tp2),
      tp3: parseFloat(tp3),
      isPremiumOnly,
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
      if (result.duplicate) {
        onToast(`Duplicate webhook within 60s window (${result.id}); existing setup retained.`)
        return
      }
      if (result.signal) onAddSignal(result.signal)
      onToast(`✓ Backend accepted ${selectedPair} ${direction}.`)
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
      onToast(`✓ Signal ${signalId} updated to ${status}.`)
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
        body: JSON.stringify({
          email: targetEmail.trim(),
          plan: activePlan.slug,
          days: activePlan.durationDays,
          reference: paymentReference.trim(),
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Membership activation failed.')
      setTargetEmail('')
      setPaymentReference('')
      onToast(`✓ ${activePlan.name} (${activePlan.durationDays}d · $${activePlan.priceUsd}) activated for ${result.user.email}.`)
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'Membership activation failed.')
    } finally {
      setIsActivating(false)
    }
  }

  return (
    <div className="po-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="po-modal po-admin-modal" role="dialog" aria-modal="true" aria-labelledby="admin-console-title">
        <button className="po-modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <div className="po-admin-eyebrow">SF CAPITAL FX ADMIN CONSOLE</div>
        <h2 id="admin-console-title" className="po-modal-title">Platform Operations & Signal Dispatch</h2>
        <p className="po-modal-desc">
          Test backend webhook intake, record signal milestones, review Telegram delivery history, and activate verified VIP memberships.
        </p>

        <div className="po-filter-tabs po-admin-tabs" role="tablist">
          <button
            type="button"
            className={`po-filter-btn ${tab === 'webhook' ? 'active' : ''}`}
            onClick={() => setTab('webhook')}
          >
            Webhook Intake
          </button>
          <button
            type="button"
            className={`po-filter-btn ${tab === 'milestones' ? 'active' : ''}`}
            onClick={() => setTab('milestones')}
          >
            Milestones ({signals.length})
          </button>
          <button
            type="button"
            className={`po-filter-btn ${tab === 'members' ? 'active' : ''}`}
            onClick={() => setTab('members')}
          >
            VIP Entitlements
          </button>
          <button
            type="button"
            className={`po-filter-btn ${tab === 'telegram' ? 'active' : ''}`}
            onClick={() => setTab('telegram')}
          >
            Telegram Outbox
          </button>
        </div>

        {tab === 'webhook' && (
          <form onSubmit={handleSimulateWebhook} className="po-admin-form">
            <div className="po-admin-grid-2">
              <div className="po-form-group">
                <label className="po-form-label" htmlFor="admin-pair">Instrument</label>
                <select
                  id="admin-pair"
                  className="po-form-input"
                  value={selectedPair}
                  onChange={(e) => {
                    setSelectedPair(e.target.value)
                    applyDefaultLevels(e.target.value, direction)
                  }}
                >
                  {MARKETS.map((m) => (
                    <option key={m.symbol} value={m.symbol}>
                      {m.symbol} ({m.name})
                    </option>
                  ))}
                </select>
              </div>

              <div className="po-form-group">
                <label className="po-form-label" htmlFor="admin-direction">Direction</label>
                <select
                  id="admin-direction"
                  className="po-form-input"
                  value={direction}
                  onChange={(e) => {
                    const nextDir = e.target.value as 'BUY' | 'SELL'
                    setDirection(nextDir)
                    applyDefaultLevels(selectedPair, nextDir)
                  }}
                >
                  <option value="BUY">BUY ▲</option>
                  <option value="SELL">SELL ▼</option>
                </select>
              </div>
            </div>

            <div className="po-admin-grid-2">
              <div className="po-form-group">
                <label className="po-form-label" htmlFor="admin-entry">Entry Price</label>
                <input
                  id="admin-entry"
                  type="number"
                  step="any"
                  className="po-form-input"
                  value={entryPrice}
                  onChange={(e) => setEntryPrice(e.target.value)}
                  required
                />
              </div>
              <div className="po-form-group">
                <label className="po-form-label" htmlFor="admin-sl">Stop Loss (SL)</label>
                <input
                  id="admin-sl"
                  type="number"
                  step="any"
                  className="po-form-input"
                  value={stopLoss}
                  onChange={(e) => setStopLoss(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="po-admin-grid-3">
              <div className="po-form-group">
                <label className="po-form-label" htmlFor="admin-tp1">Take Profit 1</label>
                <input
                  id="admin-tp1"
                  type="number"
                  step="any"
                  className="po-form-input"
                  value={tp1}
                  onChange={(e) => setTp1(e.target.value)}
                  required
                />
              </div>
              <div className="po-form-group">
                <label className="po-form-label" htmlFor="admin-tp2">Take Profit 2</label>
                <input
                  id="admin-tp2"
                  type="number"
                  step="any"
                  className="po-form-input"
                  value={tp2}
                  onChange={(e) => setTp2(e.target.value)}
                  required
                />
              </div>
              <div className="po-form-group">
                <label className="po-form-label" htmlFor="admin-tp3">Take Profit 3</label>
                <input
                  id="admin-tp3"
                  type="number"
                  step="any"
                  className="po-form-input"
                  value={tp3}
                  onChange={(e) => setTp3(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="po-form-group">
              <label className="po-form-label" htmlFor="admin-secret">Webhook Secret (Signed Token)</label>
              <input
                id="admin-secret"
                type="password"
                className="po-form-input"
                placeholder="Configured SF_WEBHOOK_SECRET value"
                value={secret}
                autoComplete="off"
                onChange={(e) => setSecret(e.target.value)}
                required
              />
            </div>

            <label className="po-admin-checkbox">
              <input
                type="checkbox"
                checked={isPremiumOnly}
                onChange={(e) => setIsPremiumOnly(e.target.checked)}
              />
              <span>Mark as VIP-only signal (mask Entry/SL/TP levels for unauthenticated & FREE accounts)</span>
            </label>

            <button
              type="submit"
              className="po-btn-submit"
              disabled={isSimulating}
            >
              {isSimulating ? 'Dispatching…' : '📡 Send TradingView Webhook Alert'}
            </button>
            <small className="po-admin-note">
              Sends this payload directly to <code>POST /api/webhooks/tradingview</code>. Nothing is fabricated locally if the backend rejects it.
            </small>
          </form>
        )}

        {tab === 'milestones' && (
          <div className="po-admin-list">
            <p className="po-admin-notice">
              Advance signal lifecycle states. Each update records an immutable timestamped milestone and triggers Telegram fan-out when configured.
            </p>
            {signals.map((s) => (
              <div key={s.id} className="po-admin-row">
                <div className="po-admin-row-info">
                  <div className="po-admin-row-head">
                    <strong>{s.pair}</strong>
                    <span className={`po-card-badge-direction ${s.direction.toLowerCase()}`}>{s.direction}</span>
                    <span className={`po-status-pill ${s.status.toLowerCase()}`}>{s.status}</span>
                  </div>
                  <div className="po-admin-row-sub">
                    Entry: {s.entry ?? 'VIP'} · SL: {s.sl ?? 'VIP'} · TP1: {s.tp1 ?? 'VIP'}
                  </div>
                </div>
                <div className="po-admin-actions">
                  <button
                    type="button"
                    className="po-admin-action-btn tp"
                    onClick={() => void handleUpdateMilestone(s.id, 'TP1_HIT')}
                  >
                    TP1
                  </button>
                  <button
                    type="button"
                    className="po-admin-action-btn tp"
                    onClick={() => void handleUpdateMilestone(s.id, 'TP2_HIT')}
                  >
                    TP2
                  </button>
                  <button
                    type="button"
                    className="po-admin-action-btn gold"
                    onClick={() => void handleUpdateMilestone(s.id, 'TP3_HIT')}
                  >
                    TP3
                  </button>
                  <button
                    type="button"
                    className="po-admin-action-btn sl"
                    onClick={() => void handleUpdateMilestone(s.id, 'SL_HIT')}
                  >
                    SL
                  </button>
                  <button
                    type="button"
                    className="po-admin-action-btn close"
                    onClick={() => void handleUpdateMilestone(s.id, 'CLOSED')}
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    className="po-admin-action-btn neutral"
                    onClick={() => void handleUpdateMilestone(s.id, 'CANCELLED')}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'members' && (
          <div className="po-admin-members">
            <p className="po-admin-notice">
              Signed in as <strong>{user?.email}</strong>. Independently verify the payment receipt before activating an account.
            </p>
            <form className="po-admin-form" onSubmit={handleActivateMember}>
              <div className="po-form-group">
                <label className="po-form-label" htmlFor="member-email">Member Email</label>
                <input
                  id="member-email"
                  type="email"
                  className="po-form-input"
                  placeholder="trader@example.com"
                  value={targetEmail}
                  onChange={(e) => setTargetEmail(e.target.value)}
                  required
                />
              </div>

              <div className="po-form-group">
                <label className="po-form-label" htmlFor="member-plan">Verified Plan & Rate</label>
                <select
                  id="member-plan"
                  className="po-form-input"
                  value={selectedPlan}
                  onChange={(e) => setSelectedPlan(e.target.value as MembershipPlanSlug)}
                >
                  {PAID_PLANS.map((plan) => (
                    <option key={plan.slug} value={plan.slug}>
                      {plan.name} — ${plan.priceUsd} USD ({plan.durationDays} days)
                    </option>
                  ))}
                </select>
              </div>

              <div className="po-form-group">
                <label className="po-form-label" htmlFor="member-ref">Verified Payment Reference</label>
                <input
                  id="member-ref"
                  type="text"
                  className="po-form-input"
                  placeholder="USDT TxHash / Bank Ref / Invoice ID"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  required
                />
              </div>

              <div className="po-payout-box" style={{ marginBottom: 10 }}>
                <span className="po-payout-label">Recorded Entitlement:</span>
                <span className="po-payout-val">
                  ${activePlan.priceUsd} USD · {activePlan.durationDays} days
                </span>
              </div>

              <button type="submit" className="po-btn-submit" disabled={isActivating}>
                {isActivating
                  ? 'Activating…'
                  : `Activate ${activePlan.name} (${activePlan.durationDays}d · $${activePlan.priceUsd})`}
              </button>
            </form>

            {subRequests.length > 0 && (
              <div className="po-admin-list" style={{ marginTop: 16 }}>
                <div className="po-form-label">Verification Queue ({subRequests.length})</div>
                {subRequests.map((req) => (
                  <div className="po-admin-row" key={req.id}>
                    <div className="po-admin-row-info">
                      <div className="po-admin-row-head">
                        <strong>{req.email || req.userId || 'Member'}</strong>
                        <span className={`po-status-pill ${req.status.toLowerCase()}`}>{req.status}</span>
                      </div>
                      <div className="po-admin-row-sub">
                        {req.planName || req.plan} · ${req.amountUsd ?? 100} · {req.paymentMethod || 'MANUAL'} · Ref: {req.reference}
                      </div>
                    </div>
                    {req.status === 'PENDING_VERIFICATION' && req.email && (
                      <button
                        type="button"
                        className="po-admin-action-btn tp"
                        onClick={() => {
                          setTargetEmail(req.email || '')
                          setSelectedPlan(req.plan)
                          setPaymentReference(req.reference)
                        }}
                      >
                        Load into Form
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'telegram' && (
          <div className="po-admin-list">
            <div className="po-payout-box">
              <div>
                <div className="po-form-label">Telegram Delivery Outbox</div>
                <span style={{ fontSize: 12, color: '#8e9fab' }}>Latest backend dispatch records</span>
              </div>
              <span className="po-winrate-chip">
                {isTelegramLoading ? 'LOADING' : `${telegramDeliveries.length} RECORDS`}
              </span>
            </div>

            {telegramError ? (
              <p className="po-form-error" role="alert">{telegramError}</p>
            ) : telegramDeliveries.length === 0 && !isTelegramLoading ? (
              <p className="po-admin-notice">
                No delivery records are available. Confirm that the backend and Telegram credentials are configured.
              </p>
            ) : (
              telegramDeliveries.map((delivery) => (
                <div className="po-admin-row" key={delivery.id}>
                  <div className="po-admin-row-info">
                    <strong>{delivery.messageType}</strong>
                    <div className="po-admin-row-sub">
                      Signal: {delivery.signalId} · {new Date(delivery.lastAttemptAt).toLocaleString()}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span className={`po-status-pill ${delivery.status.toLowerCase()}`}>{delivery.status}</span>
                    {delivery.lastError && (
                      <div style={{ fontSize: 11, color: '#ff8296', marginTop: 4 }}>{delivery.lastError}</div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
