import React, { useState } from 'react'
import type { User } from '../model/types'
import { formatDate } from '../model/format'

interface AuthModalProps {
  user: User | null
  onClose: () => void
  onAuthenticated: (user: User) => void
  onLogout: () => void
  onOpenAdmin: () => void
  onToast: (message: string) => void
}

export const AuthModal: React.FC<AuthModalProps> = ({
  user,
  onClose,
  onAuthenticated,
  onLogout,
  onOpenAdmin,
  onToast,
}) => {
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'forgot'>('login')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authName, setAuthName] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const [authInfo, setAuthInfo] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError(null)
    setAuthInfo(null)
    setIsSubmitting(true)

    try {
      if (authMode === 'forgot') {
        const res = await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: authEmail }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Unable to process recovery request.')
        setAuthInfo(data.message || 'Recovery request logged.')
        return
      }

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
      onAuthenticated(data.user)
      setAuthPassword('')
      onClose()
      onToast(`Signed in as ${data.user.email}`)
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to process request.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="po-modal-overlay" onClick={onClose}>
      <div className="po-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button className="po-modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <h3 className="po-modal-title">Trader Account</h3>
        {user ? (
          <>
            <p className="po-modal-desc">
              Signed in as <strong>{user.email}</strong> · Role: <strong>{user.role.toUpperCase()}</strong> · Tier:{' '}
              <strong>{user.membershipStatus}</strong>
              {user.premiumExpiresAt ? ` (valid until ${formatDate(user.premiumExpiresAt)})` : ''}.
            </p>
            {user.role === 'admin' && (
              <button
                type="button"
                className="po-btn-submit"
                style={{ marginBottom: 8 }}
                onClick={onOpenAdmin}
              >
                ⚙ Open Admin Operations Console
              </button>
            )}
            <button type="button" className="po-btn-plan" onClick={onLogout}>
              Sign out
            </button>
          </>
        ) : (
          <>
            <p className="po-modal-desc">
              {authMode === 'forgot'
                ? 'Enter your account email to log a password recovery request.'
                : 'Sign in or create an account to access membership-gated TradingView signals.'}
            </p>
            <div className="po-filter-tabs auth-tabs" role="tablist" aria-label="Account access" style={{ marginBottom: 16 }}>
              <button
                type="button"
                className={`po-filter-btn ${authMode === 'login' ? 'active' : ''}`}
                onClick={() => {
                  setAuthMode('login')
                  setAuthError(null)
                  setAuthInfo(null)
                }}
              >
                Log in
              </button>
              <button
                type="button"
                className={`po-filter-btn ${authMode === 'register' ? 'active' : ''}`}
                onClick={() => {
                  setAuthMode('register')
                  setAuthError(null)
                  setAuthInfo(null)
                }}
              >
                Create account
              </button>
              <button
                type="button"
                className={`po-filter-btn ${authMode === 'forgot' ? 'active' : ''}`}
                onClick={() => {
                  setAuthMode('forgot')
                  setAuthError(null)
                  setAuthInfo(null)
                }}
              >
                Reset password
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
              {authMode !== 'forgot' && (
                <div className="po-form-group">
                  <label className="po-form-label" htmlFor="auth-password">Password (min 8 chars)</label>
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
              )}
              {authError && <p className="po-form-error" role="alert">{authError}</p>}
              {authInfo && <p className="po-form-info" role="status">{authInfo}</p>}
              <button type="submit" className="po-btn-submit" disabled={isSubmitting}>
                {isSubmitting
                  ? 'Please wait…'
                  : authMode === 'login'
                    ? 'Log in securely'
                    : authMode === 'register'
                      ? 'Create account'
                      : 'Request reset link'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
