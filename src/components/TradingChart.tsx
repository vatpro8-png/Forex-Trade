import React, { useEffect, useRef, useState } from 'react'
import { createChart, ColorType, IChartApi, ISeriesApi } from 'lightweight-charts'
import type { Signal, MarketInfo } from '../model/types'
import { formatPrice } from '../model/format'

interface TradingChartProps {
  market: MarketInfo
  signal?: Signal | null
  currentPrice?: number
  onPriceChange?: (price: number) => void
}

function calculateEmaSeries(
  candles: Array<{ time: any; close: number }>,
  period: number,
  digits: number
) {
  if (candles.length === 0) return []
  const k = 2 / (period + 1)
  let ema = candles[0].close
  return candles.map((c, idx) => {
    ema = idx === 0 ? c.close : c.close * k + ema * (1 - k)
    return {
      time: c.time,
      value: Number(ema.toFixed(digits)),
    }
  })
}

function formatCountdown(intervalSec: number): string {
  const nowSec = Math.floor(Date.now() / 1000)
  const remaining = intervalSec - (nowSec % intervalSec)
  const hours = Math.floor(remaining / 3600)
  const mins = Math.floor((remaining % 3600) / 60)
  const secs = remaining % 60
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

export const TradingChart: React.FC<TradingChartProps> = ({
  market,
  signal,
  onPriceChange,
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const [selectedTimeframe, setSelectedTimeframe] = useState<'1M' | '5M' | '15M' | '1H' | '1D'>('15M')
  const [showEmaOverlay, setShowEmaOverlay] = useState<boolean>(true)
  const [livePrice, setLivePrice] = useState<number>(market.price)
  const [ohlc, setOhlc] = useState({ open: market.price, high: market.price, low: market.price, close: market.price })
  const [priceDirection, setPriceDirection] = useState<'UP' | 'DOWN'>('UP')
  const [barCountdown, setBarCountdown] = useState<string>('15:00')

  const intervalSec =
    selectedTimeframe === '1M'
      ? 60
      : selectedTimeframe === '5M'
        ? 300
        : selectedTimeframe === '15M'
          ? 900
          : selectedTimeframe === '1H'
            ? 3600
            : 86400

  useEffect(() => {
    setLivePrice(market.price)
    setOhlc({ open: market.price, high: market.price, low: market.price, close: market.price })
    if (onPriceChange) onPriceChange(market.price)
  }, [market.symbol, market.price])

  useEffect(() => {
    setBarCountdown(formatCountdown(intervalSec))
    const timer = setInterval(() => {
      setBarCountdown(formatCountdown(intervalSec))
    }, 1000)
    return () => clearInterval(timer)
  }, [intervalSec])

  useEffect(() => {
    if (!chartContainerRef.current) return

    const container = chartContainerRef.current
    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: '#0b1118' },
        textColor: '#7e93a8',
        fontFamily: "'IBM Plex Sans', sans-serif",
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.035)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.035)' },
      },
      crosshair: {
        vertLine: { color: '#00d4ff', width: 1, style: 3 },
        horzLine: { color: '#00d4ff', width: 1, style: 3 },
      },
      timeScale: {
        borderColor: '#1d2d42',
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: '#1d2d42',
      },
      height: 470,
    })

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#00e676',
      downColor: '#ff3358',
      borderVisible: false,
      wickUpColor: '#00e676',
      wickDownColor: '#ff3358',
      priceFormat: {
        type: 'price',
        precision: market.digits,
        minMove: 1 / Math.pow(10, market.digits),
      },
    })

    chartRef.current = chart
    candlestickSeriesRef.current = candlestickSeries

    const basePrice = market.price
    const count = 85
    const nowSec = Math.floor(Date.now() / 1000)
    let currentOpen = basePrice * 0.988
    const data: Array<{ time: any; open: number; high: number; low: number; close: number }> = []

    for (let i = count; i >= 0; i--) {
      const time = (nowSec - i * intervalSec) as any
      const volatility = basePrice * 0.0018
      const delta = (Math.random() - 0.485) * volatility
      const close = currentOpen + delta
      const high = Math.max(currentOpen, close) + Math.random() * volatility * 0.7
      const low = Math.min(currentOpen, close) - Math.random() * volatility * 0.7

      data.push({
        time,
        open: Number(currentOpen.toFixed(market.digits)),
        high: Number(high.toFixed(market.digits)),
        low: Number(low.toFixed(market.digits)),
        close: Number(close.toFixed(market.digits)),
      })
      currentOpen = close
    }

    candlestickSeries.setData(data)

    if (showEmaOverlay) {
      const emaFastSeries = chart.addLineSeries({
        color: '#00e676',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      })
      const emaSlowSeries = chart.addLineSeries({
        color: '#ffb300',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      })
      emaFastSeries.setData(calculateEmaSeries(data, 20, market.digits))
      emaSlowSeries.setData(calculateEmaSeries(data, 50, market.digits))
    }

    if (signal) {
      if (signal.entry !== null && signal.entry !== undefined) {
        candlestickSeries.createPriceLine({
          price: signal.entry,
          color: '#00d4ff',
          lineWidth: 2,
          lineStyle: 2,
          axisLabelVisible: true,
          title: `ENTRY [${signal.direction}]`,
        })
      }
      if (signal.sl !== null && signal.sl !== undefined) {
        candlestickSeries.createPriceLine({
          price: signal.sl,
          color: '#ff3358',
          lineWidth: 2,
          lineStyle: 0,
          axisLabelVisible: true,
          title: 'STOP LOSS',
        })
      }
      if (signal.tp1 !== null && signal.tp1 !== undefined) {
        candlestickSeries.createPriceLine({
          price: signal.tp1,
          color: '#00e676',
          lineWidth: 1,
          lineStyle: 1,
          axisLabelVisible: true,
          title: 'TP 1',
        })
      }
      if (signal.tp2 !== null && signal.tp2 !== undefined) {
        candlestickSeries.createPriceLine({
          price: signal.tp2,
          color: '#00e676',
          lineWidth: 1,
          lineStyle: 1,
          axisLabelVisible: true,
          title: 'TP 2',
        })
      }
      if (signal.tp3 !== null && signal.tp3 !== undefined) {
        candlestickSeries.createPriceLine({
          price: signal.tp3,
          color: '#ffb300',
          lineWidth: 2,
          lineStyle: 0,
          axisLabelVisible: true,
          title: 'TP 3 (MAX)',
        })
      }
    }

    chart.timeScale().fitContent()

    const lastCandle = { ...data[data.length - 1] }
    setOhlc({
      open: lastCandle.open,
      high: lastCandle.high,
      low: lastCandle.low,
      close: lastCandle.close,
    })

    chart.subscribeCrosshairMove((param) => {
      const point = param.seriesData.get(candlestickSeries) as
        | { open: number; high: number; low: number; close: number }
        | undefined
      if (point) {
        setOhlc({
          open: point.open,
          high: point.high,
          low: point.low,
          close: point.close,
        })
      }
    })

    const tickInterval = setInterval(() => {
      if (!candlestickSeriesRef.current) return
      const tickDelta = (Math.random() - 0.49) * (market.price * 0.00035)
      const nextClose = Number((lastCandle.close + tickDelta).toFixed(market.digits))
      const isUp = nextClose >= lastCandle.close
      lastCandle.close = nextClose
      lastCandle.high = Number(Math.max(lastCandle.high, nextClose).toFixed(market.digits))
      lastCandle.low = Number(Math.min(lastCandle.low, nextClose).toFixed(market.digits))
      candlestickSeriesRef.current.update(lastCandle)

      setLivePrice(nextClose)
      setPriceDirection(isUp ? 'UP' : 'DOWN')
      setOhlc({
        open: lastCandle.open,
        high: lastCandle.high,
        low: lastCandle.low,
        close: lastCandle.close,
      })
      if (onPriceChange) onPriceChange(nextClose)
    }, 1200)

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth })
      }
    }

    window.addEventListener('resize', handleResize)

    return () => {
      clearInterval(tickInterval)
      window.removeEventListener('resize', handleResize)
      chart.remove()
    }
  }, [
    market.symbol,
    signal?.id,
    signal?.entry,
    signal?.tp2,
    signal?.tp3,
    market.price,
    market.digits,
    selectedTimeframe,
    intervalSec,
    showEmaOverlay,
  ])

  return (
    <div className="po-chart-terminal" id="terminal-chart">
      <div className="po-chart-toolbar">
        <div className="po-market-title">
          <span className={`po-asset-badge ${market.iconClass}`}>{market.iconText}</span>
          <div className="po-asset-info">
            <span className="po-asset-name">{market.symbol}</span>
            <span className="po-asset-payout">{market.name}</span>
          </div>
          <div className={`po-live-price-pill ${priceDirection === 'UP' ? 'bull' : 'bear'}`}>
            <span className="po-pulse-dot"></span>
            <span className="po-price-val">{livePrice.toFixed(market.digits)}</span>
            <span className="po-price-arrow">{priceDirection === 'UP' ? '▲' : '▼'}</span>
          </div>
        </div>

        <div className="po-chart-controls-group">
          <div className="po-tf-switcher">
            {(['1M', '5M', '15M', '1H', '1D'] as const).map((tf) => (
              <button
                key={tf}
                type="button"
                className={`po-tf-btn ${selectedTimeframe === tf ? 'active' : ''}`}
                onClick={() => setSelectedTimeframe(tf)}
              >
                {tf}
              </button>
            ))}
          </div>

          <button
            type="button"
            className={`po-indicator-toggle ${showEmaOverlay ? 'active' : ''}`}
            onClick={() => setShowEmaOverlay((v) => !v)}
            title="Toggle EMA 20 / EMA 50 Confluence Overlay"
          >
            <span>EMA 20/50</span>
          </button>

          <span className="po-bar-timer" title="Time to next bar close">
            ⏱ {barCountdown}
          </span>
        </div>

        {signal && (
          <div className="po-signal-tags">
            <span className={`po-tag-action ${signal.direction === 'BUY' ? 'buy' : 'sell'}`}>
              {signal.direction} @ {formatPrice(signal.entry, market.digits)}
            </span>
            <span className="po-tag-target sl">SL: {formatPrice(signal.sl, market.digits)}</span>
            <span className="po-tag-target tp">TP1: {formatPrice(signal.tp1, market.digits)}</span>
            <span className="po-tag-target tp">
              TP2: {signal.tp2 !== null ? formatPrice(signal.tp2, market.digits) : 'VIP'}
            </span>
            <span className="po-tag-target gold">
              TP3: {signal.tp3 !== null ? formatPrice(signal.tp3, market.digits) : 'VIP'}
            </span>
          </div>
        )}
      </div>

      {/* Floating OHLC & Strategy HUD */}
      <div className="po-chart-stage">
        <div className="po-ohlc-hud">
          <span>
            O <strong>{ohlc.open.toFixed(market.digits)}</strong>
          </span>
          <span>
            H <strong className="bull">{ohlc.high.toFixed(market.digits)}</strong>
          </span>
          <span>
            L <strong className="bear">{ohlc.low.toFixed(market.digits)}</strong>
          </span>
          <span>
            C <strong>{ohlc.close.toFixed(market.digits)}</strong>
          </span>
          {showEmaOverlay && (
            <span className="po-ema-legend">
              <i style={{ background: '#00e676' }}></i> EMA20
              <i style={{ background: '#ffb300', marginLeft: 8 }}></i> EMA50
            </span>
          )}
        </div>
        <div ref={chartContainerRef} className="po-chart-canvas" />
      </div>

      <div className="po-chart-statusbar">
        <div className="po-feed-status">
          <span className="po-status-dot online"></span>
          <span>Chart: Reference candles + EMA 20/50 · Signal levels overlaid from TradingView feed</span>
        </div>
        <div className="po-spread-info">
          <span>Precision: {market.digits} decimals</span>
          <span>·</span>
          <span>Demo Simulation Mode</span>
        </div>
      </div>
    </div>
  )
}
