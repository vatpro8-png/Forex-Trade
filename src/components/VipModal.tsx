import React, { useEffect, useState } from 'react'
import type { MembershipPlan, User } from '../model/types'

interface VipModalProps {
  plans: MembershipPlan[]
  initialPlan: MembershipPlan
  user: User | null
  onClose: () => void
  onToast: (message: string) => void
}

const PAYMENT_METHODS = [
  { id: 'USDT_TRC20', label: 'USDT (TRC20 / Crypto)' },
  { id: 'BINANCE_PAY', label: 'Binance Pay' },
  { id: 'BKASH', label: 'bKash (Manual Verify)' },
  { id: 'BANK_TRANSFER', label: 'Bank Transfer / Manual' },
]

export const VipModal: React.FC<VipModalProps> = ({
  plans,
  initialPlan,
  user,
  onClose,
  onToast,
}) => {
  const paidPlans = plans.filter((p) => p.isPremium)
  const [selectedPlan, setSelectedPlan] = useState<MembershipPlan>(
    initialPlan.isPremium ? initialPlan : paidPlans[0]
  )
  const [paymentMethod, setPaymentMethod] = useState<string>('USDT_TRC20')
  const [accountEmail, setAccountEmail] = useState<string>(user?.email || '')
  const [reference, setReference] = useState<string>('')
  const [submitStatus, setSubmitStatus] = useState<{ text: string; isError: boolean } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (initialPlan.isPremium) setSelectedPlan(initialPlan)
  }, [initialPlan])

  useEffect(() => {
    if (user?.email) setAccountEmail(user.email)
  }, [user?.email])

  const handleSubmitProof = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitStatus(null)
    setIsSubmitting(true)

    try {
      const token = localStorage.getItem('sf-session-token')
      const res = await fetch('/api/subscriptions/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          plan: selectedPlan.slug,
          paymentMethod,
          reference: reference.trim(),
          email: accountEmail.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Unable to log payment verification request.')
      setReference('')
      setSubmitStatus({
        text: data.duplicate
          ? 'Verification request for this reference is already queued.'
          : '✓ Payment verification request queued (PENDING_VERIFICATION). Admin will activate your plan once verified.',
        isError: false,
      })
      onToast('Payment reference submitted for admin verification.')
    } catch (error) {
      setSubmitStatus({
        text:
          error instanceof Error
            ? `${error.message} Contact @sfcapitalfrx on Telegram with your receipt.`
            : 'Unable to reach backend. Contact @sfcapitalfrx on Telegram.',
        isError: true,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="po-modal-overlay" onClick={onClose}>
      <div className="po-modal po-admin-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button className="po-modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <div className="po-admin-eyebrow">PAID VIP SIGNAL MEMBERSHIP</div>
        <h3 className="po-modal-title">
          👑 {selectedPlan.name} · ${selectedPlan.priceUsd} / {selectedPlan.durationDays} days
        </h3>
        <p className="po-modal-desc">
          There is no free VIP membership tier. Automated card checkout is not enabled; choose a plan, obtain payment instructions on an official channel, and submit your verified transaction reference below.
        </p>

        <div className="po-filter-tabs" style={{ marginBottom: 16 }}>
          {paidPlans.map((plan) => (
            <button
              key={plan.slug}
              type="button"
              className={`po-filter-btn ${selectedPlan.slug === plan.slug ? 'active' : ''}`}
              onClick={() => setSelectedPlan(plan)}
            >
              {plan.name} (${plan.priceUsd} / {plan.durationDays}d)
            </button>
          ))}
        </div>

        <div className="po-vip-summary-box">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontWeight: 700, color: '#fff' }}>
              {selectedPlan.name} ({selectedPlan.durationDays}-day access)
            </span>
            <span style={{ color: '#00e676', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
              ${selectedPlan.priceUsd}.00 {selectedPlan.currency}
            </span>
          </div>
          <ol className="po-vip-steps">
            <li>01 · Contact an official channel below to request payment wallet / bKash / bank details.</li>
            <li>02 · Complete payment and submit your Transaction Reference / TxID with your account email.</li>
            <li>03 · An administrator verifies the payment receipt and unlocks VIP access in the console.</li>
          </ol>
        </div>

        {/* Submit Payment Verification Proof Form */}
        <form onSubmit={handleSubmitProof} className="po-admin-form" style={{ marginBottom: 16 }}>
          <div className="po-admin-grid-2">
            <div className="po-form-group">
              <label className="po-form-label" htmlFor="vip-email">Registered Account Email</label>
              <input
                id="vip-email"
                type="email"
                className="po-form-input"
                placeholder="you@example.com"
                value={accountEmail}
                onChange={(e) => setAccountEmail(e.target.value)}
                required
              />
            </div>

            <div className="po-form-group">
              <label className="po-form-label" htmlFor="vip-method">Payment Method</label>
              <select
                id="vip-method"
                className="po-form-input"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="po-form-group">
            <label className="po-form-label" htmlFor="vip-ref">Transaction ID / Receipt Reference</label>
            <input
              id="vip-ref"
              type="text"
              className="po-form-input"
              placeholder="e.g. USDT TxHash, Binance Order ID, or bKash TrxID"
              minLength={4}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              required
            />
          </div>

          {submitStatus && (
            <p className={submitStatus.isError ? 'po-form-error' : 'po-form-info'} role="status">
              {submitStatus.text}
            </p>
          )}

          <button type="submit" className="po-btn-submit" disabled={isSubmitting}>
            {isSubmitting ? 'Submitting…' : `Submit Proof for Verification ($${selectedPlan.priceUsd})`}
          </button>
        </form>

        <div className="po-vip-social-grid">
          <a className="po-btn-plan primary" style={{ textAlign: 'center' }} href="https://t.me/sfcapitalfrx" target="_blank" rel="noopener noreferrer">
            Telegram Channel ↗
          </a>
          <a className="po-btn-plan" style={{ textAlign: 'center' }} href="https://t.me/+X_bXKn7BYNxlZGFl" target="_blank" rel="noopener noreferrer">
            Public Group ↗
          </a>
          <a className="po-btn-plan" style={{ textAlign: 'center' }} href="https://web.facebook.com/profile.php?id=61594920310389" target="_blank" rel="noopener noreferrer">
            Facebook ↗
          </a>
          <a className="po-btn-plan" style={{ textAlign: 'center' }} href="https://www.youtube.com/@SFCAPITALFX" target="_blank" rel="noopener noreferrer">
            YouTube ↗
          </a>
          <a className="po-btn-plan" style={{ textAlign: 'center' }} href="https://www.tiktok.com/@sfcapitalforex" target="_blank" rel="noopener noreferrer">
            TikTok ↗
          </a>
        </div>
      </div>
    </div>
  )
}
