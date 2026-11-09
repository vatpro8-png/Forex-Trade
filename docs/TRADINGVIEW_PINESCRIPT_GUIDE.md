# TradingView Pine Script Setup & Webhook Automation Guide
**Platform**: SF CAPITAL FX (`Forex-Trade`)  
**Target Webhook**: `https://sfcapitalsf.netlify.app/api/webhooks/tradingview`

---

## 1. Overview

The **SF CAPITAL FX Signals Engine** (`tradingview/SF_Capital_Signals.pine`) is a Pine Script v5 indicator that calculates high-confluence entry, stop loss, and three take profit targets (TP1, TP2, TP3) across **Gold (XAUUSD)**, **Bitcoin (BTCUSD)**, and **Crude Oil (USOIL)**.

When a setup triggers, TradingView sends a signed JSON webhook to `https://sfcapitalsf.netlify.app/api/webhooks/tradingview`. The platform:
1. Validates the payload and shared secret.
2. Ingests and stores the signal.
3. Automatically notifies connected website sessions via Server-Sent Events.
4. Fans out the alert to the official Telegram VIP channel (`@sfcapitalfrx`).

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
2. Verify the **Webhook Secret Key**:
   * Default: `sf-capital-fx-production-secret-2026-key`
   *(Must match `SF_WEBHOOK_SECRET` in your Netlify environment variables)*.
3. Adjust Risk:Reward multipliers if desired (TP1: 1.0x, TP2: 2.0x, TP3: 3.5x).

---

### Step 3: Create the Webhook Alert
1. Press `Alt + A` (or click the **Alerts** icon in the right sidebar → **"Create Alert"**).
2. In **Condition**, select:
   * **Condition**: `SF CAPITAL FX — Structured Signals Engine`
   * **Trigger**: `SF CAPITAL BUY Alert` (or `SF CAPITAL SELL Alert`)
   * **Options**: Select **"Once Per Bar Close"** (to prevent repaint false signals).
3. Under **Alert actions**:
   * Check **"Webhook URL"**.
   * Enter:
     ```text
     https://sfcapitalsf.netlify.app/api/webhooks/tradingview
     ```
4. In the **Message** box:
   * Enter:
     ```text
     {{strategy.order.alert_message}}
     ```
     *(Or leave `{{message}}` to pass the pre-formatted JSON from the indicator)*.
5. Click **"Create"**. Repeat the process for the SELL alert.

---

## 3. Testing with Manual Webhook Payload

You can test the webhook endpoint directly using PowerShell or cURL:

```bash
curl -X POST https://sfcapitalsf.netlify.app/api/webhooks/tradingview \
  -H "Content-Type: application/json" \
  -d '{
    "secret": "sf-capital-fx-production-secret-2026-key",
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

**Expected Response**:
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

When the market reaches profit targets, status updates can be triggered automatically via alert webhooks or through the **Admin Console** on the web app:

* **TP1 Hit**: Stop loss moved to break-even ($+95\text{ pips}$).
* **TP2 Hit**: Runner partial close ($+215\text{ pips}$).
* **TP3 Hit**: Final target complete ($+340\text{ pips}$).
* **SL Hit**: Closed with controlled risk.
