CREATE TABLE users (
	id UUID PRIMARY KEY,
	email TEXT NOT NULL UNIQUE,
	password_hash TEXT NOT NULL,
	role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
	created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE membership_plans (
	id UUID PRIMARY KEY,
	name TEXT NOT NULL UNIQUE,
	is_premium BOOLEAN NOT NULL DEFAULT false,
	price_minor INTEGER NOT NULL DEFAULT 0,
	currency CHAR(3) NOT NULL DEFAULT 'USD'
);

CREATE TABLE subscriptions (
	id UUID PRIMARY KEY,
	user_id UUID NOT NULL REFERENCES users(id),
	plan_id UUID NOT NULL REFERENCES membership_plans(id),
	provider TEXT NOT NULL,
	provider_subscription_id TEXT UNIQUE,
	status TEXT NOT NULL,
	current_period_end TIMESTAMPTZ,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE signals (
	id TEXT PRIMARY KEY,
	pair TEXT NOT NULL,
	direction TEXT NOT NULL CHECK (direction IN ('BUY', 'SELL')),
	entry_price NUMERIC(18,8) NOT NULL,
	stop_loss NUMERIC(18,8) NOT NULL,
	tp1 NUMERIC(18,8) NOT NULL,
	tp2 NUMERIC(18,8) NOT NULL,
	tp3 NUMERIC(18,8) NOT NULL,
	signal_time TIMESTAMPTZ NOT NULL,
	status TEXT NOT NULL DEFAULT 'ACTIVE',
	created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE signal_milestones (
	id BIGSERIAL PRIMARY KEY,
	signal_id TEXT NOT NULL REFERENCES signals(id),
	milestone TEXT NOT NULL,
	occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	UNIQUE(signal_id, milestone)
);

CREATE TABLE telegram_deliveries (
	id BIGSERIAL PRIMARY KEY,
	signal_id TEXT NOT NULL REFERENCES signals(id),
	chat_id TEXT NOT NULL,
	provider_message_id TEXT,
	status TEXT NOT NULL,
	attempts INTEGER NOT NULL DEFAULT 0,
	last_error TEXT,
	UNIQUE(signal_id, chat_id)
);

CREATE TABLE audit_log (
	id BIGSERIAL PRIMARY KEY,
	actor_user_id UUID REFERENCES users(id),
	action TEXT NOT NULL,
	entity_type TEXT NOT NULL,
	entity_id TEXT NOT NULL,
	details JSONB NOT NULL DEFAULT '{}',
	created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX signals_status_time_idx ON signals(status, signal_time DESC);
CREATE INDEX signals_pair_time_idx ON signals(pair, signal_time DESC);
