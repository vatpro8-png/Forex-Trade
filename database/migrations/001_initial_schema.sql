-- Database schema for SF CAPITAL FX
-- Migration: 001_initial_schema.sql

-- Create users table
CREATE TABLE IF NOT EXISTS users (
	id BIGSERIAL PRIMARY KEY,
	email VARCHAR(255) NOT NULL UNIQUE,
	username VARCHAR(100) NOT NULL UNIQUE,
	password_hash VARCHAR(255) NOT NULL,
	membership_tier SMALLINT NOT NULL DEFAULT 0, -- 0: FREE, 1: PREMIUM
	email_verified BOOLEAN DEFAULT FALSE,
	is_active BOOLEAN DEFAULT TRUE,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	last_login TIMESTAMP,
	updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT valid_membership FOREIGN KEY (membership_tier) REFERENCES membership_tiers(id)
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_created_at ON users(created_at);

-- Create membership_tiers table
CREATE TABLE IF NOT EXISTS membership_tiers (
	id SMALLINT PRIMARY KEY,
	name VARCHAR(50) NOT NULL UNIQUE,
	description TEXT
);

INSERT INTO membership_tiers (id, name, description) VALUES
	(0, 'FREE', 'Free tier with limited signal access'),
	(1, 'PREMIUM', 'Premium tier with full signal access');

-- Create signal_directions table
CREATE TABLE IF NOT EXISTS signal_directions (
	id SMALLINT PRIMARY KEY,
	name VARCHAR(10) NOT NULL UNIQUE
);

INSERT INTO signal_directions (id, name) VALUES
	(0, 'BUY'),
	(1, 'SELL');

-- Create signal_statuses table
CREATE TABLE IF NOT EXISTS signal_statuses (
	id SMALLINT PRIMARY KEY,
	name VARCHAR(50) NOT NULL UNIQUE,
	description TEXT
);

INSERT INTO signal_statuses (id, name, description) VALUES
	(0, 'ACTIVE', 'Signal is active and open'),
	(1, 'TP1_HIT', 'Take Profit 1 level hit'),
	(2, 'TP2_HIT', 'Take Profit 2 level hit'),
	(3, 'TP3_HIT', 'Take Profit 3 level hit (fully closed)'),
	(4, 'SL_HIT', 'Stop Loss hit'),
	(5, 'CLOSED', 'Signal manually closed'),
	(6, 'CANCELLED', 'Signal cancelled');

-- Create signals table
CREATE TABLE IF NOT EXISTS signals (
	id BIGSERIAL PRIMARY KEY,
	external_id VARCHAR(100) NOT NULL UNIQUE, -- Idempotency key from TradingView
	trading_pair VARCHAR(20) NOT NULL,
	direction SMALLINT NOT NULL REFERENCES signal_directions(id),
	entry_price DECIMAL(18, 8) NOT NULL,
	stop_loss DECIMAL(18, 8) NOT NULL,
	take_profit_1 DECIMAL(18, 8) NOT NULL,
	take_profit_2 DECIMAL(18, 8),
	take_profit_3 DECIMAL(18, 8),
	status SMALLINT NOT NULL DEFAULT 0 REFERENCES signal_statuses(id),
	created_by_user_id BIGINT REFERENCES users(id),
	is_published BOOLEAN DEFAULT FALSE,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	event_time TIMESTAMP NOT NULL, -- Time signal was generated in TradingView
	updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_signals_pair ON signals(trading_pair);
CREATE INDEX idx_signals_status ON signals(status);
CREATE INDEX idx_signals_created_at ON signals(created_at DESC);
CREATE INDEX idx_signals_event_time ON signals(event_time DESC);
CREATE INDEX idx_signals_external_id ON signals(external_id);

-- Create signal_milestones table (track TP/SL hits)
CREATE TABLE IF NOT EXISTS signal_milestones (
	id BIGSERIAL PRIMARY KEY,
	signal_id BIGINT NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
	status SMALLINT NOT NULL REFERENCES signal_statuses(id),
	milestone_price DECIMAL(18, 8) NOT NULL,
	occurred_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	notes TEXT
);

CREATE INDEX idx_milestones_signal_id ON signal_milestones(signal_id);
CREATE UNIQUE INDEX idx_milestone_unique_per_signal ON signal_milestones(signal_id, status);

-- Create subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
	id BIGSERIAL PRIMARY KEY,
	user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
	tier SMALLINT NOT NULL REFERENCES membership_tiers(id),
	started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	renews_at TIMESTAMP,
	cancelled_at TIMESTAMP,
	external_subscription_id VARCHAR(255), -- Payment provider subscription ID
	amount_paid DECIMAL(10, 2),
	currency VARCHAR(3),
	is_active BOOLEAN DEFAULT TRUE,
	updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_is_active ON subscriptions(is_active);
CREATE INDEX idx_subscriptions_renews_at ON subscriptions(renews_at);

-- Create payment_events table
CREATE TABLE IF NOT EXISTS payment_events (
	id BIGSERIAL PRIMARY KEY,
	user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	subscription_id BIGINT REFERENCES subscriptions(id),
	amount DECIMAL(10, 2) NOT NULL,
	currency VARCHAR(3) NOT NULL,
	status SMALLINT NOT NULL, -- 0: PENDING, 1: COMPLETED, 2: FAILED, 3: REFUNDED
	external_payment_id VARCHAR(255),
	external_event_id VARCHAR(255),
	event_type VARCHAR(50), -- 'payment', 'refund', 'subscription'
	notes TEXT,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_payment_events_user_id ON payment_events(user_id);
CREATE INDEX idx_payment_events_status ON payment_events(status);
CREATE INDEX idx_payment_events_created_at ON payment_events(created_at);

-- Create telegram_deliveries table
CREATE TABLE IF NOT EXISTS telegram_deliveries (
	id BIGSERIAL PRIMARY KEY,
	signal_id BIGINT NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
	telegram_message_id BIGINT,
	status SMALLINT NOT NULL, -- 0: PENDING, 1: DELIVERED, 2: FAILED, 3: RETRYING
	sent_at TIMESTAMP,
	retry_count INTEGER DEFAULT 0,
	error_message TEXT,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_telegram_deliveries_signal_id ON telegram_deliveries(signal_id);
CREATE INDEX idx_telegram_deliveries_status ON telegram_deliveries(status);

-- Create audit_log table
CREATE TABLE IF NOT EXISTS audit_log (
	id BIGSERIAL PRIMARY KEY,
	user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
	action VARCHAR(100) NOT NULL,
	entity_type VARCHAR(50) NOT NULL,
	entity_id BIGINT,
	details JSONB,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at);

-- Create site_settings table
CREATE TABLE IF NOT EXISTS site_settings (
	id SERIAL PRIMARY KEY,
	setting_key VARCHAR(100) NOT NULL UNIQUE,
	setting_value TEXT,
	value_type VARCHAR(20), -- 'string', 'int', 'boolean', 'json'
	description TEXT,
	updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Grant permissions (adjust as needed for your deployment)
-- GRANT CONNECT ON DATABASE sfc TO sfc_user;
-- GRANT USAGE ON SCHEMA public TO sfc_user;
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO sfc_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO sfc_user;
