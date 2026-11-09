-- SF CAPITAL FX — PostgreSQL Production Relational Schema
-- Version: 1.0.0

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Core Users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT NOT NULL UNIQUE,
    full_name TEXT,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Membership Plans
CREATE TABLE IF NOT EXISTS membership_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug TEXT NOT NULL UNIQUE,       -- 'starter_free', 'premium_30d'
    name TEXT NOT NULL,
    is_premium BOOLEAN NOT NULL DEFAULT false,
    price_cents INTEGER NOT NULL DEFAULT 0,
    duration_days INTEGER NOT NULL DEFAULT 30,
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User Subscriptions & Entitlements
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES membership_plans(id),
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED', 'PENDING_VERIFICATION', 'CANCELLED')),
    payment_method TEXT NOT NULL DEFAULT 'MANUAL', -- 'MANUAL', 'CRYPTO_USDT', 'STRIPE'
    provider_reference TEXT,
    activated_by UUID REFERENCES users(id),
    period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
    period_end TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Canonical Signals
CREATE TABLE IF NOT EXISTS signals (
    id TEXT PRIMARY KEY,                 -- Deterministic key: tv-{pair}-{timestamp}
    pair TEXT NOT NULL,                  -- 'XAUUSD', 'BTCUSD', 'USOIL', etc.
    timeframe TEXT NOT NULL DEFAULT '15m',
    direction TEXT NOT NULL CHECK (direction IN ('BUY', 'SELL')),
    entry_price NUMERIC(18,8) NOT NULL,
    stop_loss NUMERIC(18,8) NOT NULL,
    tp1 NUMERIC(18,8) NOT NULL,
    tp2 NUMERIC(18,8) NOT NULL,
    tp3 NUMERIC(18,8) NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'TP1_HIT', 'TP2_HIT', 'TP3_HIT', 'SL_HIT', 'CLOSED', 'CANCELLED')),
    signal_time TIMESTAMPTZ NOT NULL,
    source TEXT NOT NULL DEFAULT 'TradingView',
    pnl_pips NUMERIC(10,2) DEFAULT 0,
    is_premium_only BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Signal Milestones (Audit log of each progressive level hit)
CREATE TABLE IF NOT EXISTS signal_milestones (
    id BIGSERIAL PRIMARY KEY,
    signal_id TEXT NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
    milestone TEXT NOT NULL CHECK (milestone IN ('CREATED', 'TP1_HIT', 'TP2_HIT', 'TP3_HIT', 'SL_HIT', 'CLOSED', 'CANCELLED')),
    price_at_milestone NUMERIC(18,8),
    notes TEXT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(signal_id, milestone)
);

-- Telegram Bot Dispatch & Delivery Tracking
CREATE TABLE IF NOT EXISTS telegram_deliveries (
    id BIGSERIAL PRIMARY KEY,
    signal_id TEXT NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
    chat_id TEXT NOT NULL,
    message_type TEXT NOT NULL DEFAULT 'NEW_SIGNAL', -- 'NEW_SIGNAL', 'MILESTONE_UPDATE'
    provider_message_id TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'FAILED')),
    attempts INTEGER NOT NULL DEFAULT 0,
    last_attempt_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Central System Audit Trail
CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    actor_id UUID REFERENCES users(id),
    action TEXT NOT NULL,                -- e.g. 'ACTIVATE_30D_VIP', 'MANUAL_MILESTONE', 'WEBHOOK_RECEIVED'
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    details JSONB NOT NULL DEFAULT '{}',
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Performance Summary Snapshot Cache
CREATE TABLE IF NOT EXISTS performance_cache (
    id INTEGER PRIMARY KEY DEFAULT 1,
    total_trades INTEGER NOT NULL DEFAULT 0,
    winning_trades INTEGER NOT NULL DEFAULT 0,
    losing_trades INTEGER NOT NULL DEFAULT 0,
    win_rate NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    total_profit_units NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    total_loss_units NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    last_calculated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Site Settings Key-Value Store
CREATE TABLE IF NOT EXISTS site_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- High-Speed Composite Indexes
CREATE INDEX IF NOT EXISTS idx_signals_status_time ON signals(status, signal_time DESC);
CREATE INDEX IF NOT EXISTS idx_signals_pair_time ON signals(pair, signal_time DESC);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_telegram_pending ON telegram_deliveries(status) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
