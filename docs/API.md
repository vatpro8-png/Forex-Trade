# SF CAPITAL FX - API Documentation

## Base URL
```
https://api.sfcapitalfx.com/api/v1
```

## Authentication

All requests to protected endpoints require a valid JWT token in the `Authorization` header:
```
Authorization: Bearer <jwt_token>
```

## Status Codes

- `200 OK` - Request succeeded
- `201 Created` - Resource created
- `204 No Content` - Successful, no content
- `400 Bad Request` - Invalid request
- `401 Unauthorized` - Missing or invalid token
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `409 Conflict` - Duplicate or conflict
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error

## Error Response Format

All error responses follow this structure:
```json
{
  "error": {
	"code": "ERROR_CODE",
	"message": "Human readable message",
	"timestamp": "2026-01-15T14:30:00Z"
  }
}
```

---

## Authentication Endpoints

### Register
Create a new user account.

**Request:**
```http
POST /auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "username": "johndoe",
  "password": "SecurePassword123!"
}
```

**Response (201):**
```json
{
  "id": 1,
  "email": "user@example.com",
  "username": "johndoe",
  "membership_tier": 0,
  "email_verified": false,
  "created_at": "2026-01-15T14:30:00Z",
  "session_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

### Login
Authenticate user and obtain session token.

**Request:**
```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

**Response (200):**
```json
{
  "user": {
	"id": 1,
	"email": "user@example.com",
	"username": "johndoe",
	"membership_tier": 0,
	"last_login": "2026-01-15T14:30:00Z"
  },
  "session_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_in": 3600
}
```

---

### Get Current User
Retrieve authenticated user info.

**Request:**
```http
GET /auth/me
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "id": 1,
  "email": "user@example.com",
  "username": "johndoe",
  "membership_tier": 1,
  "email_verified": true,
  "subscription": {
	"id": 5,
	"tier": 1,
	"active": true,
	"renews_at": "2026-02-15T14:30:00Z"
  }
}
```

---

### Logout
Invalidate current session.

**Request:**
```http
POST /auth/logout
Authorization: Bearer <token>
```

**Response (204):**
Empty body

---

## Signal Endpoints

### Get Active Signals
Retrieve currently active trading signals. Free users see limited signals; Premium users see all.

**Request:**
```http
GET /signals?status=ACTIVE&pair=EURUSD&limit=50&offset=0
Authorization: Bearer <token>
```

**Query Parameters:**
- `status` - Filter by status: ACTIVE, TP1_HIT, TP2_HIT, TP3_HIT, SL_HIT, CLOSED, CANCELLED
- `pair` - Filter by trading pair (EURUSD, XAUUSD, etc.)
- `limit` - Max results (default 50, max 200)
- `offset` - Pagination offset (default 0)

**Response (200):**
```json
{
  "signals": [
	{
	  "id": 42,
	  "external_id": "tv_alert_12345",
	  "trading_pair": "EURUSD",
	  "direction": "BUY",
	  "entry_price": 1.0850,
	  "stop_loss": 1.0800,
	  "take_profit_1": 1.0900,
	  "take_profit_2": 1.0950,
	  "take_profit_3": 1.1000,
	  "status": "ACTIVE",
	  "created_at": "2026-01-15T14:00:00Z",
	  "event_time": "2026-01-15T14:00:00Z",
	  "is_published": true,
	  "milestones": []
	}
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

---

### Get Signal Details
Retrieve full details of a specific signal including milestone history.

**Request:**
```http
GET /signals/{id}
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "id": 42,
  "external_id": "tv_alert_12345",
  "trading_pair": "EURUSD",
  "direction": "BUY",
  "entry_price": 1.0850,
  "stop_loss": 1.0800,
  "take_profit_1": 1.0900,
  "take_profit_2": 1.0950,
  "take_profit_3": 1.1000,
  "status": "ACTIVE",
  "created_at": "2026-01-15T14:00:00Z",
  "event_time": "2026-01-15T14:00:00Z",
  "is_published": true,
  "milestones": [
	{
	  "id": 1,
	  "status": "TP1_HIT",
	  "milestone_price": 1.0900,
	  "occurred_at": "2026-01-15T15:30:00Z"
	}
  ]
}
```

---

### Get Signal Milestones
Retrieve historical milestone events (TP hits, SL hits) for a signal.

**Request:**
```http
GET /signals/{id}/milestones
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "signal_id": 42,
  "milestones": [
	{
	  "id": 1,
	  "status": "TP1_HIT",
	  "milestone_price": 1.0900,
	  "occurred_at": "2026-01-15T15:30:00Z",
	  "notes": "TP1 reached"
	},
	{
	  "id": 2,
	  "status": "TP2_HIT",
	  "milestone_price": 1.0950,
	  "occurred_at": "2026-01-15T16:15:00Z",
	  "notes": "TP2 reached"
	}
  ]
}
```

---

## Webhook Endpoints

### TradingView Webhook
Receive and process trading signals from TradingView alerts.

**Request:**
```http
POST /webhooks/tradingview
Content-Type: application/json
X-Signature: <HMAC-SHA256>

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

**Signature Computation:**
```
HMAC-SHA256(payload_json, TRADINGVIEW_WEBHOOK_SECRET) -> hex
```

**Response (200):**
```json
{
  "success": true,
  "signal_id": 42,
  "message": "Signal received and published",
  "telegram_sent": true
}
```

**Response (409 - Duplicate):**
```json
{
  "success": true,
  "signal_id": 42,
  "message": "Signal already exists (deduplicated)",
  "telegram_sent": false
}
```

---

## Dashboard Endpoints

### Get Dashboard Summary
High-level performance metrics.

**Request:**
```http
GET /dashboard/summary
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "total_signals": 145,
  "active_signals": 12,
  "closed_signals": 133,
  "win_rate": 0.72,
  "total_pnl": 2350.50,
  "pnl_percentage": 5.2,
  "period": "30_days",
  "currency": "USD"
}
```

---

### Get Active Signals (Dashboard View)
Simplified signal list for dashboard.

**Request:**
```http
GET /dashboard/signals/active
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "signals": [
	{
	  "id": 42,
	  "pair": "EURUSD",
	  "direction": "BUY",
	  "entry": 1.0850,
	  "sl": 1.0800,
	  "tp1": 1.0900,
	  "tp2": 1.0950,
	  "tp3": 1.1000,
	  "status": "ACTIVE",
	  "created": "2026-01-15T14:00:00Z",
	  "created_hours_ago": 2
	}
  ],
  "count": 1
}
```

---

### Get Closed Signals (Dashboard View)
Completed/closed signals with outcomes.

**Request:**
```http
GET /dashboard/signals/closed?limit=20&offset=0
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "signals": [
	{
	  "id": 40,
	  "pair": "XAUUSD",
	  "direction": "SELL",
	  "entry": 2050.00,
	  "final_price": 2045.50,
	  "pnl": 450.00,
	  "pnl_percent": 2.2,
	  "status": "TP2_HIT",
	  "closed_at": "2026-01-14T16:30:00Z"
	}
  ],
  "total": 133,
  "limit": 20,
  "offset": 0
}
```

---

### Get P&L Statistics
Detailed profitability analysis.

**Request:**
```http
GET /dashboard/pnl?period=7_days
Authorization: Bearer <token>
```

**Query Parameters:**
- `period` - 24_hours, 7_days, 30_days, 90_days, all_time

**Response (200):**
```json
{
  "period": "7_days",
  "currency": "USD",
  "total_pnl": 1250.00,
  "winning_trades": 18,
  "losing_trades": 6,
  "win_rate": 0.75,
  "average_win": 89.50,
  "average_loss": 45.20,
  "profit_factor": 3.62,
  "largest_win": 450.00,
  "largest_loss": 120.00,
  "consecutive_wins": 5,
  "consecutive_losses": 2,
  "daily_breakdown": [
	{
	  "date": "2026-01-15",
	  "pnl": 250.00,
	  "trades": 4,
	  "win_count": 3
	}
  ]
}
```

---

## Membership & Subscription Endpoints

### Get Available Plans
List membership tiers and features.

**Request:**
```http
GET /api/memberships/plans
```

**Response (200):**
```json
{
  "plans": [
	{
	  "id": "starter_free",
	  "slug": "starter_free",
	  "name": "Public Preview",
	  "isPremium": false,
	  "priceUsd": 0,
	  "priceCents": 0,
	  "durationDays": 0,
	  "currency": "USD",
	  "checkoutMode": "NONE"
	},
	{
	  "id": "premium_30d",
	  "slug": "premium_30d",
	  "name": "Premium Monthly",
	  "isPremium": true,
	  "priceUsd": 100,
	  "priceCents": 10000,
	  "durationDays": 30,
	  "currency": "USD",
	  "checkoutMode": "MANUAL_VERIFICATION"
	},
	{
	  "id": "premium_365d",
	  "slug": "premium_365d",
	  "name": "Premium Plus Annual",
	  "isPremium": true,
	  "priceUsd": 800,
	  "priceCents": 80000,
	  "durationDays": 365,
	  "currency": "USD",
	  "checkoutMode": "MANUAL_VERIFICATION"
	}
  ]
}
```

---

### Admin Activate Verified Membership
Grant verified VIP membership (30 days for Premium Monthly `$100` or 365 days for Premium Plus Annual `$800`).

**Request:**
```http
POST /api/admin/subscriptions/activate
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "email": "user@example.com",
  "plan": "premium_30d",
  "reference": "TXN_RECEIPT_100_USDT"
}
```

**Response (200):**
```json
{
  "success": true,
  "user": {
	"id": "usr-123",
	"email": "user@example.com",
	"membershipStatus": "PREMIUM",
	"membershipPlan": "premium_30d",
	"premiumExpiresAt": "2026-12-11T00:00:00.000Z"
  },
  "subscription": {
	"id": "sub-1794400000",
	"plan": "premium_30d",
	"durationDays": 30,
	"amountCents": 10000,
	"amountUsd": 100,
	"currency": "USD",
	"status": "ACTIVE"
  }
}
```

---

## Admin Endpoints

All admin endpoints require user with `admin` role.

### List All Users
Paginated list of all users.

**Request:**
```http
GET /admin/users?limit=50&offset=0&tier=1
Authorization: Bearer <admin_token>
```

**Response (200):**
```json
{
  "users": [
	{
	  "id": 1,
	  "email": "premium@example.com",
	  "username": "premiumuser",
	  "membership_tier": 1,
	  "subscription_active": true,
	  "created_at": "2026-01-01T00:00:00Z",
	  "last_login": "2026-01-15T14:30:00Z"
	}
  ],
  "total": 256,
  "limit": 50,
  "offset": 0
}
```

---

### List All Signals (with metadata)
All signals with admin metadata.

**Request:**
```http
GET /admin/signals?limit=100&status=ACTIVE
Authorization: Bearer <admin_token>
```

**Response (200):**
```json
{
  "signals": [
	{
	  "id": 42,
	  "external_id": "tv_alert_12345",
	  "trading_pair": "EURUSD",
	  "direction": "BUY",
	  "entry_price": 1.0850,
	  "stop_loss": 1.0800,
	  "take_profit_1": 1.0900,
	  "status": "ACTIVE",
	  "created_by": "TradingView",
	  "published_to_telegram": true,
	  "telegram_message_id": 98765,
	  "registered_users_viewing": 12,
	  "premium_users_viewing": 10
	}
  ],
  "total": 142
}
```

---

### View Audit Log
Review all administrative actions.

**Request:**
```http
GET /admin/audit-log?limit=100&action=signal_status_changed
Authorization: Bearer <admin_token>
```

**Response (200):**
```json
{
  "audit_log": [
	{
	  "id": 1001,
	  "admin_id": 1,
	  "admin_email": "admin@sfcapitalfx.com",
	  "action": "signal_status_changed",
	  "entity_type": "signal",
	  "entity_id": 42,
	  "details": {
		"old_status": "ACTIVE",
		"new_status": "CLOSED",
		"reason": "Manual close by admin"
	  },
	  "timestamp": "2026-01-15T14:30:00Z"
	}
  ],
  "total": 1000
}
```

---

## Rate Limiting

All endpoints are rate limited based on user tier:

- **Free Users:** 100 requests/minute
- **Premium Users:** 1000 requests/minute
- **Admin:** No limit

Rate limit info in response headers:
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1642348200
```

---

## Examples

### Complete Signal Flow

1. **TradingView sends webhook:**
```bash
curl -X POST https://api.sfcapitalfx.com/api/v1/webhooks/tradingview \
  -H "Content-Type: application/json" \
  -H "X-Signature: $(echo -n '{"trading_pair":"EURUSD"...}' | openssl dgst -sha256 -hmac 'secret')" \
  -d '{
	"event_id": "tv_unique_id",
	"trading_pair": "EURUSD",
	"direction": "BUY",
	"entry_price": 1.0850,
	"stop_loss": 1.0800,
	"take_profit_1": 1.0900,
	"take_profit_2": 1.0950,
	"take_profit_3": 1.1000,
	"timestamp": "2026-01-15T14:30:00Z"
  }'
```

2. **Backend processes:**
   - Validates signature
   - Checks for duplicates
   - Creates signal in DB
   - Publishes to Telegram
   - Updates dashboard

3. **Client retrieves signal:**
```bash
curl -H "Authorization: Bearer <token>" \
  https://api.sfcapitalfx.com/api/v1/signals?status=ACTIVE&pair=EURUSD
```

---

## Changelog

### Version 1.0 (MVP)
- Initial release
- TradingView webhook integration
- Dashboard and signal management
- Free/Premium memberships
- Telegram publishing
- Admin controls
