import React, { useEffect, useRef } from 'react'
import { createChart, ColorType, IChartApi, ISeriesApi } from 'lightweight-charts'
import type { Signal, MarketInfo } from '../model/types'

interface TradingChartProps {
  market: MarketInfo
  signal?: Signal | null
}

export const TradingChart: React.FC<TradingChartProps> = ({ market, signal }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)

  useEffect(() => {
    if (!chartContainerRef.current) return

    const container = chartContainerRef.current
    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: '#09182b' },
        textColor: '#8496a7',
        fontFamily: "'DM Sans', sans-serif",
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.04)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.04)' },
      },
      crosshair: {
        vertLine: { color: '#c38d35', width: 1, style: 3 },
        horzLine: { color: '#c38d35', width: 1, style: 3 },
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.08)',
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.08)',
      },
      height: 380,
    })

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#11a879',
      downColor: '#d9534f',
      borderVisible: false,
      wickUpColor: '#11a879',
      wickDownColor: '#d9534f',
      priceFormat: {
        type: 'price',
        precision: market.digits,
        minMove: 1 / Math.pow(10, market.digits),
      },
    })

    chartRef.current = chart
    candlestickSeriesRef.current = candlestickSeries

    // Generate realistic base candles around current market price
    const basePrice = market.price
    const count = 75
    const nowSec = Math.floor(Date.now() / 1000)
    const intervalSec = 900 // 15m
    let currentOpen = basePrice * 0.985
    const data = []

    for (let i = count; i >= 0; i--) {
      const time = (nowSec - i * intervalSec) as any
      const volatility = basePrice * 0.002
      const delta = (Math.random() - 0.48) * volatility
      const close = currentOpen + delta
      const high = Math.max(currentOpen, close) + Math.random() * volatility * 0.6
      const low = Math.min(currentOpen, close) - Math.random() * volatility * 0.6

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

    // Add price lines for active signal if available
    if (signal) {
      if (signal.entry) {
        candlestickSeries.createPriceLine({
          price: signal.entry,
          color: '#ffffff',
          lineWidth: 2,
          lineStyle: 2, // Dashed
          axisLabelVisible: true,
          title: `ENTRY (${signal.direction})`,
        })
      }
      if (signal.sl) {
        candlestickSeries.createPriceLine({
          price: signal.sl,
          color: '#d9534f',
          lineWidth: 2,
          lineStyle: 0, // Solid
          axisLabelVisible: true,
          title: 'STOP LOSS',
        })
      }
      if (signal.tp1) {
        candlestickSeries.createPriceLine({
          price: signal.tp1,
          color: '#11a879',
          lineWidth: 1,
          lineStyle: 1, // Dotted
          axisLabelVisible: true,
          title: 'TP 1',
        })
      }
      if (signal.tp2) {
        candlestickSeries.createPriceLine({
          price: signal.tp2,
          color: '#18c58d',
          lineWidth: 1,
          lineStyle: 1,
          axisLabelVisible: true,
          title: 'TP 2',
        })
      }
      if (signal.tp3) {
        candlestickSeries.createPriceLine({
          price: signal.tp3,
          color: '#22c18b',
          lineWidth: 2,
          lineStyle: 0,
          axisLabelVisible: true,
          title: 'TP 3 (MAX)',
        })
      }
    }

    chart.timeScale().fitContent()

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth })
      }
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.remove()
    }
  }, [market.symbol, signal?.id, market.price, market.digits])

  return (
    <div className="trading-chart-wrapper">
      <div className="chart-controls-bar">
        <div className="chart-symbol-badge">
          <span className={`asset-icon-mini ${market.iconClass}`}>{market.iconText}</span>
          <strong>{market.symbol}</strong>
          <span>{market.name}</span>
          <span className="live-dot" style={{ marginLeft: 6 }}></span>
        </div>
        <div className="chart-levels-legend">
          {signal && (
            <>
              <span className="legend-tag entry">Entry: {signal.entry}</span>
              <span className="legend-tag sl">SL: {signal.sl}</span>
              <span className="legend-tag tp">TP1: {signal.tp1}</span>
              <span className="legend-tag tp">TP2: {signal.tp2}</span>
              <span className="legend-tag tp">TP3: {signal.tp3}</span>
            </>
          )}
        </div>
      </div>
      <div ref={chartContainerRef} className="chart-canvas-container" />
      <div className="chart-subtext">
        <span>Interactive Candlestick Chart · Lightweight Charts™</span>
        <span>Levels automatically synced from TradingView webhook</span>
      </div>
    </div>
  )
}

