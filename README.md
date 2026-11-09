# Forex-Trade — SF CAPITAL FX Automated Signal Platform MVP

[![CI/CD Pipeline](https://github.com/vatpro8-png/Forex-Trade/actions/workflows/deploy.yml/badge.svg)](https://github.com/vatpro8-png/Forex-Trade/actions/workflows/deploy.yml)
[![Live Platform](https://img.shields.io/badge/Live%20Platform-sfcapitalsf.netlify.app-00C7B7?style=flat&logo=netlify)](https://sfcapitalsf.netlify.app)
[![Telegram VIP](https://img.shields.io/badge/Telegram-@sfcapitalfrx-2CA5E0?style=flat&logo=telegram)](https://t.me/sfcapitalfrx)

> Client-based Platform for TradingView Pine Script → Webhook API → Backend Server → Database → Website + Telegram Bot

## Overview

**SF CAPITAL FX** is a professional automated Forex, Commodities, and Crypto trading signal platform that integrates with TradingView alerts, publishes signals to a live responsive dashboard and Telegram VIP channel, and manages user memberships with premium access control.

## Project Structure

```
.
├── backend/                          # C++ backend API
│   ├── include/                     # Header files
│   │   ├── types.hpp               # Core data types
│   │   ├── database.hpp            # Database abstraction
│   │   ├── auth.hpp                # Authentication
│   │   ├── webhooks.hpp            # TradingView webhook handler
│   │   └── telegram.hpp            # Telegram integration
│   ├── src/                         # Implementation files
│   ├── config/                      # Configuration files
│   ├── CMakeLists.txt              # Build configuration
│   ├── Dockerfile                  # Container image
│   └── tests/                       # Unit and integration tests
├── frontend/                         # React/TypeScript frontend
│   ├── src/
│   │   ├── components/             # React components
│   │   ├── pages/                  # Page components
│   │   ├── services/               # API client services
│   │   ├── hooks/                  # Custom hooks
│   │   └── styles/                 # Dark & Gold design
│   ├── Dockerfile                  # Container image
│   └── vite.config.ts              # Build configuration
├── database/
│   ├── migrations/                 # SQL migration files
│   └── seeds/                      # Initial data scripts
├── deploy/
│   ├── kubernetes/                 # K8s manifests
│   │   ├── backend-deployment.yaml
│   │   └── database-deployment.yaml
│   ├── terraform/                  # Infrastructure as code (AWS/GCP/Azure)
│   └── docker-compose.yml          # Local development
├── tests/                           # Integration tests
├── docs/                            # Documentation
│   ├── API.md                      # API documentation
│   ├── DEPLOYMENT.md               # Deployment guide
│   ├── ARCHITECTURE.md             # Architecture overview
│   └── SETUP.md                    # Local setup instructions
└── README.md                        # Project overview
```

## Key Features

### Phase 1 (MVP - 7 days)
- ✅ TradingView webhook integration with HMAC validation
- ✅ Real-time signal persistence and deduplication
- ✅ Live dashboard with active/closed signals
- ✅ Basic authentication (registration/login)
- ✅ Free and Premium membership tiers
- ✅ Telegram signal publishing with retry logic
- ✅ Admin dashboard for user/signal management
- ✅ Dark & Gold responsive design
- ✅ Docker Compose local development setup
- ✅ Kubernetes deployment manifests
- ✅ PostgreSQL database with audit trailing

### Phase 2 (Post-MVP)
- Advanced predictive analytics integration
- Multi-region deployment with active-active failover
- Instagram API integration for alerts
- Payment processing with withdrawal functionality
- KYC/compliance module
- Advanced performance analytics and reporting
- Machine learning signal validation

## Quick Start

### Prerequisites
- Docker & Docker Compose
- PostgreSQL 15+
- Node.js 20+
- C++ 20 compiler
- CMake 3.20+

### Local Development

1. **Clone and setup:**
```bash
cd "E:\Forex platform"
cp .env.example .env
# Edit .env with your credentials
```

2. **Start services:**
```bash
docker-compose up -d
```

3. **Run database migrations:**
```bash
docker exec sfc_postgres psql -U sfc_user -d sfc_capital_fx -f /docker-entrypoint-initdb.d/001_initial_schema.sql
```

4. **Build backend:**
```bash
cd backend
mkdir build
cd build
cmake ..
make
```

5. **Start frontend:**
```bash
npm install
npm run dev
```

6. **Access services:**
   - Frontend: http://localhost:5173
   - API: https://localhost:8443
   - Database: localhost:5432

## API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - User login
- `POST /api/v1/auth/logout` - User logout
- `GET /api/v1/auth/me` - Get current user (protected)

### Trading Signals
- `POST /api/v1/webhooks/tradingview` - TradingView webhook (validate signature)
- `GET /api/v1/signals?status=ACTIVE&pair=EURUSD` - Get signals (filtered)
- `GET /api/v1/signals/{id}` - Get signal details
- `GET /api/v1/signals/{id}/milestones` - Get signal milestone history
- `PATCH /api/v1/signals/{id}/status` - Update signal status (admin only)

### Dashboard
- `GET /api/v1/dashboard/summary` - Performance summary
- `GET /api/v1/dashboard/signals/active` - Active signals
- `GET /api/v1/dashboard/signals/closed` - Closed signals
- `GET /api/v1/dashboard/pnl` - P&L statistics

### Membership & Subscriptions
- `GET /api/v1/memberships/plans` - Available plans
- `POST /api/v1/subscriptions/upgrade` - Upgrade membership
- `GET /api/v1/subscriptions/current` - Current subscription
- `POST /api/v1/subscriptions/cancel` - Cancel subscription

### Admin
- `GET /api/v1/admin/users` - List all users (admin only)
- `GET /api/v1/admin/signals` - All signals with metadata (admin only)
- `GET /api/v1/admin/audit-log` - Audit trail (admin only)
- `PATCH /api/v1/admin/settings` - Update site settings (admin only)

## Database Schema

Key tables:
- `users` - User accounts with membership info
- `signals` - Trading signals from TradingView
- `signal_milestones` - TP/SL hit history
- `subscriptions` - User memberships
- `telegram_deliveries` - Message delivery tracking
- `audit_log` - All administrative actions

## Security

- **Authentication:** JWT tokens with BCrypt password hashing
- **Webhook Validation:** HMAC-SHA256 signature verification
- **Database:** Encrypted connections, role-based access
- **Secrets:** All credentials in secure vaults (K8s Secrets, AWS Secrets Manager)
- **Rate Limiting:** Per-user API rate limits
- **HTTPS/TLS:** Only, with certificate pinning for critical endpoints

## Deployment

### Docker Compose (Development)
```bash
docker-compose up -d
```

### Kubernetes (Production)
```bash
kubectl apply -f deploy/kubernetes/
# Update secrets in backend-deployment.yaml BEFORE deploying
```

### Manual Cloud Deployment
See `docs/DEPLOYMENT.md` for AWS/GCP/Azure setup with domain, SSL, load balancing.

## TradingView Integration

1. **Create Pine Script Alert:**
   - In your TradingView indicator, add webhook URL: `https://yourdomain.com/api/v1/webhooks/tradingview`
   - Set message format to JSON (example in `docs/WEBHOOK_PAYLOAD.md`)

2. **Payload Structure:**
```json
{
  "event_id": "tv_alert_12345",
  "trading_pair": "EURUSD",
  "direction": "BUY",
  "entry_price": 1.0850,
  "stop_loss": 1.0800,
  "take_profit_1": 1.0900,
  "take_profit_2": 1.0950,
  "take_profit_3": 1.1000,
  "timestamp": "2026-01-15T14:30:00Z"
}
```

## Telegram Integration

1. **Setup Bot:**
   - Create bot with @BotFather on Telegram
   - Get`TELEGRAM_BOT_TOKEN`
   - Add bot to your signal group
   - Get `TELEGRAM_CHAT_ID` from group

2. **Features:**
   - Auto-publishes signals with formatting
   - Retries failed deliveries with exponential backoff
   - Message editing on status updates
   - Duplicate prevention

## Admin Dashboard

Access at `/admin` (requires admin role):
- User management (suspend, upgrade tier)
- Signal management (cancel, force-close)
- Audit log review
- System health monitoring
- Subscription management
- Site content/settings

## Testing

```bash
# Run unit tests
cd backend/build
cmake ..
ctest --output-on-failure

# Run integration tests
cd ../../tests
npm install
npm run test:e2e
```

## Performance Targets (MVP)

- API response time: <500ms (p95)
- Webhook processing: <1s end-to-end
- Dashboard load: <2s
- Telegram delivery: <5s (with retries)
- DB query: <200ms (p95)

## Known Limitations (MVP)

- Single-region deployment (multi-region in Phase 2)
- Sqlite/Postgres only (add MongoDB/Cassandra later)
- No predictive modeling (planned Phase 2)
- Withdrawals payment gateway deferred (compliance first)
- Manual signal management only (auto-triggers Phase 2)
- Email notifications not included (Phase 2)

## Support & Maintenance

- **Bug Reports:** Create GitHub issue
- **Security Issues:** Email security@sfcapitalfx.com
- **Maintenance Contract:** Available post-MVP

## License

Proprietary - SF CAPITAL FX Brand
All rights reserved.

## Contact

- **Website:** https://sfcapitalfx.com
- **Support:** support@sfcapitalfx.com
- **Admin:** admin@sfcapitalfx.com
