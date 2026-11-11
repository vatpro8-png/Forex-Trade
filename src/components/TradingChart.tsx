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

export const TradingChart: React.FC<TradingChartProps> = ({
  market,
  signal,
  onPriceChange,
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const [selectedTimeframe, setSelectedTimeframe] = useState<'1M' | '5M' | '15M' | '1H' | '1D'>('15M')
  const [livePrice, setLivePrice] = useState<number>(market.price)
  const [priceDirection, setPriceDirection] = useState<'UP' | 'DOWN'>('UP')

  useEffect(() => {
    setLivePrice(market.price)
    if (onPriceChange) onPriceChange(market.price)
  }, [market.symbol, market.price])

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
      height: 480,
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
    const count = 80
    const nowSec = Math.floor(Date.now() / 1000)
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
    const tickInterval = setInterval(() => {
      if (!candlestickSeriesRef.current) return
      const tickDelta = (Math.random() - 0.49) * (market.price * 0.00035)
      const nextClose = Number((lastCandle.close + tickDelta).toFixed(market.digits))
      const isUp = nextClose >= lastCandle.close
      lastCandle.close = nextClose
      lastCandle.high = Math.max(lastCandle.high, nextClose)
      lastCandle.low = Math.min(lastCandle.low, nextClose)
      candlestickSeriesRef.current.update(lastCandle)

      setLivePrice(nextClose)
      setPriceDirection(isUp ? 'UP' : 'DOWN')
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
  }, [market.symbol, signal?.id, signal?.entry, signal?.tp2, signal?.tp3, market.price, market.digits, selectedTimeframe])

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

      <div ref={chartContainerRef} className="po-chart-canvas" />

      <div className="po-chart-statusbar">
        <div className="po-feed-status">
          <span className="po-status-dot online"></span>
          <span>Chart Canvas: Reference price action simulation · Levels from Signal Feed</span>
        </div>
        <div className="po-spread-info">
          <span>Precision: {market.digits} decimals</span>
          <span>·</span>
          <span>Risk Model: Fixed Fractional (Max 2%)</span>
        </div>
      </div>
    </div>
  )
}
