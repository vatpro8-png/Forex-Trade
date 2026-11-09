// Netlify Serverless Function: Signals Provider
// Endpoint: GET /api/signals

export const handler = async (event) => {
  // Demo / Initial Verified Signals
  const defaultSignals = [
    {
      id: 'tv-xauusd-20261109-01',
      pair: 'XAUUSD',
      direction: 'BUY',
      timeframe: '15m',
      entry: 2682.5,
      sl: 2671.0,
      tp1: 2692.0,
      tp2: 2704.0,
      tp3: 2718.0,
      time: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
      status: 'TP1_HIT',
      source: 'TradingView',
      pnlPips: 95,
      isPremiumOnly: false,
    },
    {
      id: 'tv-btcusd-20261109-02',
      pair: 'BTCUSD',
      direction: 'BUY',
      timeframe: '1h',
      entry: 88150.0,
      sl: 86900.0,
      tp1: 89400.0,
      tp2: 90800.0,
      tp3: 92500.0,
      time: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
      status: 'ACTIVE',
      source: 'TradingView',
      pnlPips: 300,
      isPremiumOnly: true,
    },
    {
      id: 'tv-usoil-20261109-03',
      pair: 'USOIL',
      direction: 'SELL',
      timeframe: '30m',
      entry: 71.4,
      sl: 72.25,
      tp1: 70.6,
      tp2: 69.8,
      tp3: 68.9,
      time: new Date(Date.now() - 1000 * 60 * 210).toISOString(),
      status: 'TP2_HIT',
      source: 'TradingView',
      pnlPips: 160,
      isPremiumOnly: false,
    },
  ]

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=15, s-maxage=30',
    },
    body: JSON.stringify(defaultSignals),
  }
}
