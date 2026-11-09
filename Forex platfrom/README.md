# SF CAPITAL FX Signal Service

A C++20 MVP for receiving TradingView webhook alerts, deduplicating signals, persisting a local signal store, and exposing dashboard-ready JSON APIs.

## Build

Open `Forex platfrom.slnx` in Visual Studio 2026 and build the `x64` configuration. The service uses only the C++ standard library and Windows Winsock (`Ws2_32.lib`).

## Run

Copy `.env.example` values into the process environment, then launch the executable. Defaults are `SF_PORT=8080` and `SF_SIGNAL_FILE=data/signals.tsv`.

## TradingView payload

Configure the TradingView alert webhook URL as `https://your-domain.example/api/webhooks/tradingview` and send JSON in this shape:

```json
{"secret":"replace-with-a-long-random-secret","pair":"XAUUSD","signal":"BUY","entry":2350.50,"sl":2340.00,"tp1":2360.00,"tp2":2370.00,"tp3":2380.00,"time":"2026-01-01T12:00:00Z"}
```

The webhook returns `401` for an invalid secret, `400` for invalid fields, `201` for a new signal, and `200` for an idempotent duplicate. Signals are available from `GET /api/signals`; health is available from `GET /health`.

## Production gaps intentionally isolated from this MVP

- Replace the local TSV store with PostgreSQL using `database/schema.sql` and transactional outbox processing.
- Connect `publishTelegram` to the Telegram Bot API with retry persistence and provider message IDs.
- Add the planned frontend, authentication, premium authorization, payment-provider webhooks, admin UI, TLS reverse proxy, secrets manager, backups, monitoring, and load balancer.
- Do not enable withdrawals or model-generated trading decisions until payment compliance, KYC, risk controls, and validation are complete.
