-- Create a test user with FREE tier
INSERT INTO users (email, username, password_hash, membership_tier, email_verified, is_active)
VALUES (
	'test@sfcapitalfx.com',
	'testuser',
	'$2b$12$abcdefghijklmnopqrstuvwxyz...', -- bcrypt hash (replace with actual)
	0,
	TRUE,
	TRUE
) ON CONFLICT (email) DO NOTHING;

-- Insert some example trading pairs that we support
CREATE TABLE IF NOT EXISTS supported_pairs (
	id SERIAL PRIMARY KEY,
	pair_symbol VARCHAR(20) NOT NULL UNIQUE,
	description VARCHAR(255),
	is_active BOOLEAN DEFAULT TRUE
);

INSERT INTO supported_pairs (pair_symbol, description, is_active) VALUES
	('XAUUSD', 'Gold vs US Dollar', TRUE),
	('EURUSD', 'Euro vs US Dollar', TRUE),
	('USDJPY', 'US Dollar vs Japanese Yen', TRUE),
	('GBPUSD', 'British Pound vs US Dollar', TRUE),
	('AUDUSD', 'Australian Dollar vs US Dollar', TRUE),
	('NZDUSD', 'New Zealand Dollar vs US Dollar', TRUE),
	('USDCAD', 'US Dollar vs Canadian Dollar', TRUE),
	('USDCHF', 'US Dollar vs Swiss Franc', TRUE),
	('USDRUB', 'US Dollar vs Russian Ruble', TRUE)
ON CONFLICT (pair_symbol) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_supported_pairs_symbol ON supported_pairs(pair_symbol);
