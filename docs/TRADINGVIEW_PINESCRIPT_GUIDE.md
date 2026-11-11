# TradingView Pine Script Setup & Webhook Automation Guide
**Platform**: SF CAPITAL FX (`Forex-Trade`)  
**Target Webhook**: `https://<your-site-domain>/api/webhooks/tradingview`

---

## 1. Overview

The **SF CAPITAL FX Signals Engine** (`tradingview/SF_Capital_Signals.pine`) is a Pine Script v5 indicator that calculates high-confluence entry, stop loss, and three take profit targets (TP1, TP2, TP3) across **Gold (XAUUSD)**, **Bitcoin (BTCUSD)**, and **Crude Oil (USOIL)**.

When a setup triggers on a confirmed bar, TradingView sends a JSON webhook to your site. The Netlify function forwards it to the configured persistent backend, which validates the shared secret and price ordering before storing the signal. The website refreshes its feed every 25 seconds. Telegram delivery requires bot credentials on the backend.

---

## 2. Step-by-Step TradingView Setup

### Step 1: Open Pine Editor in TradingView
1. Open [TradingView.com](https://www.tradingview.com/chart/) and select your desired chart (e.g. `XAUUSD`, `BTCUSD`, or `USOIL` on a `15m` or `1h` timeframe).
2. Click the **"Pine Editor"** tab at the bottom of the screen.
3. Click **"Open"** → **"New indicator"**.
4. Paste the entire code from [`tradingview/SF_Capital_Signals.pine`](../tradingview/SF_Capital_Signals.pine).
5. Click **"Save"** (name it `SF CAPITAL FX Engine`) and click **"Add to chart"**.

---

### Step 2: Configure Indicator Settings
1. Click the gear/settings icon next to `SF CAPITAL FX — Structured Signals Engine` on your chart.
2. Set **Webhook Secret Key** to the same private value configured as `SF_WEBHOOK_SECRET` on the persistent backend. The script intentionally has no committed default. Never use `change-me` in production.
3. Adjust Risk:Reward multipliers if desired (TP1: 1.0x, TP2: 2.0x, TP3: 3.5x).

---

### Step 3: Create the Webhook Alert
1. Create an alert for `SF CAPITAL FX — Structured Signals Engine`.
2. Set the condition to **Any alert() function call**. The script builds the JSON dynamically; do not select one of the static BUY/SELL chart conditions for webhook delivery.
3. Enable **Webhook URL** and enter `https://<your-site-domain>/api/webhooks/tradingview`.
4. Leave the message field unchanged. The script sends one alert per confirmed bar close and formats prices using the symbol's minimum tick.
5. Confirm that `BACKEND_API_URL` is set in Netlify and that the backend has `SF_WEBHOOK_SECRET` configured to match the indicator input. Without these values the endpoint returns an error and does not store a signal.

---

## 3. Testing with Manual Webhook Payload

You can test the webhook endpoint directly using PowerShell or cURL:

```bash
curl -X POST https://<your-site-domain>/api/webhooks/tradingview \
  -H "Content-Type: application/json" \
  -d '{
    "secret": "<your-configured-webhook-secret>",
    "pair": "XAUUSD",
    "signal": "BUY",
    "timeframe": "15m",
    "entry": 2688.50,
    "sl": 2675.00,
    "tp1": 2698.00,
    "tp2": 2710.00,
    "tp3": 2725.00,
    "time": "2026-11-09T22:15:00Z"
  }'
```

**Expected Response when the backend is configured and the alert is valid**:
```json
{
  "accepted": true,
  "duplicate": false,
  "id": "tv-xauusd-123456",
  "signal": {
    "pair": "XAUUSD",
    "direction": "BUY",
    "status": "ACTIVE"
  }
}
```

---

## 4. Signal Lifecycle Milestones

Signal milestone updates are not generated automatically by this indicator. An authenticated administrator can record a status change through the **Admin Console** after verifying the market event:

* **TP1 Hit**: Stop loss moved to break-even ($+95\text{ pips}$).
* **TP2 Hit**: Runner partial close ($+215\text{ pips}$).
* **TP3 Hit**: Final target complete ($+340\text{ pips}$).
* **SL Hit**: Closed with controlled risk.

