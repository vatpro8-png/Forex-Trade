-- SF CAPITAL FX — Initial Seed Data

-- Membership Plans
INSERT INTO membership_plans (id, slug, name, is_premium, price_cents, duration_days, currency) VALUES
('11111111-1111-1111-1111-111111111111', 'starter_free', 'Starter Free', false, 0, 0, 'USD'),
('22222222-2222-2222-2222-222222222222', 'premium_30d', 'Premium 30 Days', true, 10000, 30, 'USD')
ON CONFLICT (slug) DO NOTHING;

-- Default Admin User (Password: "AdminSecurePass2026!")
-- Hash generated via SHA-256 + salt
INSERT INTO users (id, email, full_name, password_hash, role) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin@sfcapitalfx.com', 'SF Capital Admin', '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918', 'admin')
ON CONFLICT (email) DO NOTHING;

-- Grant Admin 30-Day VIP
INSERT INTO subscriptions (id, user_id, plan_id, status, payment_method, provider_reference, period_start, period_end) VALUES
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'ACTIVE', 'MANUAL', 'ADMIN_INITIAL_GRANT', now(), now() + interval '365 days')
ON CONFLICT DO NOTHING;

-- Initial Seed Signals
INSERT INTO signals (id, pair, timeframe, direction, entry_price, stop_loss, tp1, tp2, tp3, status, signal_time, source, pnl_pips, is_premium_only) VALUES
('tv-xauusd-20261109-01', 'XAUUSD', '15m', 'BUY', 2682.50, 2671.00, 2692.00, 2704.00, 2718.00, 'TP1_HIT', now() - interval '35 minutes', 'TradingView', 95.0, false),
('tv-btcusd-20261109-02', 'BTCUSD', '1h', 'BUY', 88150.00, 86900.00, 89400.00, 90800.00, 92500.00, 'ACTIVE', now() - interval '2 hours', 'TradingView', 300.0, true),
('tv-usoil-20261109-03', 'USOIL', '30m', 'SELL', 71.40, 72.25, 70.60, 69.80, 68.90, 'TP2_HIT', now() - interval '3.5 hours', 'TradingView', 160.0, false),
('tv-eurusd-20261109-04', 'EURUSD', '15m', 'BUY', 1.08250, 1.07950, 1.08550, 1.08850, 1.09200, 'CLOSED', now() - interval '6 hours', 'TradingView', 60.0, true)
ON CONFLICT (id) DO NOTHING;

-- Seed Milestones
INSERT INTO signal_milestones (signal_id, milestone, price_at_milestone, occurred_at) VALUES
('tv-xauusd-20261109-01', 'CREATED', 2682.50, now() - interval '35 minutes'),
('tv-xauusd-20261109-01', 'TP1_HIT', 2692.00, now() - interval '12 minutes'),
('tv-btcusd-20261109-02', 'CREATED', 88150.00, now() - interval '2 hours'),
('tv-usoil-20261109-03', 'CREATED', 71.40, now() - interval '3.5 hours'),
('tv-usoil-20261109-03', 'TP1_HIT', 70.60, now() - interval '2 hours'),
('tv-usoil-20261109-03', 'TP2_HIT', 69.80, now() - interval '45 minutes'),
('tv-eurusd-20261109-04', 'CREATED', 1.08250, now() - interval '6 hours'),
('tv-eurusd-20261109-04', 'TP1_HIT', 1.08550, now() - interval '4 hours'),
('tv-eurusd-20261109-04', 'TP2_HIT', 1.08850, now() - interval '2.5 hours'),
('tv-eurusd-20261109-04', 'CLOSED', 1.08850, now() - interval '1 hour')
ON CONFLICT DO NOTHING;

-- Seed Performance Cache
INSERT INTO performance_cache (id, total_trades, winning_trades, losing_trades, win_rate, total_profit_units, total_loss_units, last_calculated_at) VALUES
(1, 38, 31, 7, 81.60, 4120.00, 680.00, now())
ON CONFLICT (id) DO UPDATE SET
total_trades = EXCLUDED.total_trades,
winning_trades = EXCLUDED.winning_trades,
losing_trades = EXCLUDED.losing_trades,
win_rate = EXCLUDED.win_rate,
total_profit_units = EXCLUDED.total_profit_units,
total_loss_units = EXCLUDED.total_loss_units,
last_calculated_at = now();

-- Site Settings
INSERT INTO site_settings (key, value) VALUES
('official_channels', '{"telegram": "https://t.me/sfcapitalfrx", "facebook": "https://web.facebook.com/profile.php?id=61594920310389", "youtube": "https://www.youtube.com/@SFCAPITALFX"}'::jsonb),
('pricing', '{"price_usd": 100, "duration_days": 30, "currency": "USD"}'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
