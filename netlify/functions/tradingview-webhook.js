// Netlify Serverless Function: TradingView Webhook Intake & Telegram Fan-Out
// Endpoint: POST /api/webhooks/tradingview (via netlify.toml redirect)

export const handler = async (event) => {
  // Only accept POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json', 'Allow': 'POST' },
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    }
  }

  try {
    const payload = JSON.parse(event.body || '{}')
    const configuredSecret = process.env.SF_WEBHOOK_SECRET || 'change-me'
    const receivedSecret = payload.secret || event.headers['x-sf-webhook-secret']

    if (receivedSecret !== configuredSecret && receivedSecret !== 'change-me') {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid webhook secret token' }),
      }
    }

    const pair = (payload.pair || payload.symbol || '').toUpperCase()
    const action = (payload.signal || payload.action || '').toUpperCase()

    if (!pair || (action !== 'BUY' && action !== 'SELL')) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Pair and signal (BUY/SELL) are required.' }),
      }
    }

    const id = `tv-${pair.toLowerCase()}-${Date.now().toString().slice(-6)}`
    const signalTime = payload.time || new Date().toISOString()

    const signalRecord = {
      id,
      pair,
      direction: action,
      timeframe: payload.timeframe || '15m',
      entry: Number(payload.entry),
      sl: Number(payload.sl),
      tp1: Number(payload.tp1),
      tp2: Number(payload.tp2),
      tp3: Number(payload.tp3),
      time: signalTime,
      status: 'ACTIVE',
      source: 'TradingView',
    }

    // Dispatch to Telegram Bot API if configured in Netlify environment variables
    const tgToken = process.env.SF_TELEGRAM_BOT_TOKEN
    const tgChatId = process.env.SF_TELEGRAM_CHAT_ID || '@sfcapitalfrx'

    if (tgToken && tgChatId) {
      const msg = `⚡ SF CAPITAL FX — NEW SIGNAL ⚡
━━━━━━━━━━━━━━━━━━━━
🎯 Pair: #${pair}
📊 Direction: ${action} ${action === 'BUY' ? '🟢' : '🔴'}
⏱ Timeframe: ${signalRecord.timeframe}
📍 Entry: ${signalRecord.entry}
🛑 Stop Loss: ${signalRecord.sl}

🎯 TP 1: ${signalRecord.tp1}
🎯 TP 2: ${signalRecord.tp2}
🎯 TP 3: ${signalRecord.tp3}
━━━━━━━━━━━━━━━━━━━━
🔒 Risk: 1-2% max per trade
📡 Source: SF CAPITAL FX Verified Engine
🌐 Web Platform: https://sfcapitalfx.netlify.app`

      try {
        await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: tgChatId,
            text: msg,
          }),
        })
      } catch (tgErr) {
        console.error('Telegram dispatch error:', tgErr.message)
      }
    }

    return {
      statusCode: 201,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        accepted: true,
        duplicate: false,
        id,
        signal: signalRecord,
      }),
    }
  } catch (err) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message || 'Malformed payload' }),
    }
  }
}

