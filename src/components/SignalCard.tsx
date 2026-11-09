import React from 'react';
import '../styles/SignalCard.css';

export interface Signal {
  id: number;
  trading_pair: string;
  direction: string;
  entry_price: number;
  stop_loss: number;
  take_profit_1: number;
  take_profit_2?: number;
  take_profit_3?: number;
  status: string;
  created_at: string;
  pnl?: number;
  pnl_percent?: number;
}

interface SignalCardProps {
  signal: Signal;
  compact?: boolean;
}

const SignalCard: React.FC<SignalCardProps> = ({ signal, compact = false }) => {
  const directionEmoji = signal.direction === 'BUY' ? '🔵' : '🔴';
  const statusEmoji = signal.status === 'ACTIVE' ? '⏱️' : 
					 signal.status.includes('TP') ? '✅' : '❌';
  const pnlColor = signal.pnl && signal.pnl > 0 ? 'positive' : 'negative';

  return (
	<div className={`signal-card ${signal.status.toLowerCase()} ${compact ? 'compact' : ''}`}>
	  <div className="signal-header">
		<div className="signal-pair">
		  <span className="direction-emoji">{directionEmoji}</span>
		  <span className="pair-name">{signal.trading_pair}</span>
		  <span className="direction-text">{signal.direction}</span>
		</div>
		<span className={`status-badge ${signal.status.toLowerCase()}`}>
		  {statusEmoji} {signal.status}
		</span>
	  </div>

	  {!compact && (
		<div className="signal-body">
		  <div className="prices">
			<div className="price-item">
			  <label>Entry</label>
			  <span className="price">{signal.entry_price.toFixed(5)}</span>
			</div>
			<div className="price-item">
			  <label>SL</label>
			  <span className="price danger">{signal.stop_loss.toFixed(5)}</span>
			</div>
			<div className="price-item">
			  <label>TP1</label>
			  <span className="price success">{signal.take_profit_1.toFixed(5)}</span>
			</div>
			{signal.take_profit_2 && (
			  <div className="price-item">
				<label>TP2</label>
				<span className="price success">{signal.take_profit_2.toFixed(5)}</span>
			  </div>
			)}
			{signal.take_profit_3 && (
			  <div className="price-item">
				<label>TP3</label>
				<span className="price success">{signal.take_profit_3.toFixed(5)}</span>
			  </div>
			)}
		  </div>

		  {signal.pnl !== undefined && (
			<div className={`pnl-section ${pnlColor}`}>
			  <span className="pnl-label">P&L</span>
			  <span className="pnl-value">{signal.pnl > 0 ? '+' : ''}{signal.pnl}</span>
			  <span className="pnl-percent">({signal.pnl_percent}%)</span>
			</div>
		  )}

		  <div className="signal-time">
			<small>🕐 {new Date(signal.created_at).toLocaleString()}</small>
		  </div>
		</div>
	  )}
	</div>
  );
};

export default SignalCard;
