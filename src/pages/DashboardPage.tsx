import React, { useState, useEffect } from 'react';
import SignalCard, { Signal } from '../components/SignalCard';
import '../styles/DashboardPage.css';

const DashboardPage: React.FC = () => {
  const [activeSignals, setActiveSignals] = useState<Signal[]>([]);
  const [summary, setSummary] = useState<any>({
	total_signals: 0,
	active_signals: 0,
	closed_signals: 0,
	win_rate: 0,
	total_pnl: 0,
	pnl_percentage: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
	fetchDashboardData();
	const interval = setInterval(fetchDashboardData, 30000); // Refresh every 30s
	return () => clearInterval(interval);
  }, []);

  const fetchDashboardData = async () => {
	try {
	  const token = localStorage.getItem('session_token');

	  // Fetch summary
	  const summaryRes = await fetch('/api/v1/dashboard/summary', {
		headers: { 'Authorization': `Bearer ${token}` }
	  });
	  if (summaryRes.ok) {
		const summaryData = await summaryRes.json();
		setSummary(summaryData);
	  }

	  // Fetch active signals
	  const signalsRes = await fetch('/api/v1/dashboard/signals/active', {
		headers: { 'Authorization': `Bearer ${token}` }
	  });
	  if (signalsRes.ok) {
		const signalsData = await signalsRes.json();
		setActiveSignals(signalsData.signals || []);
	  }
	} catch (error) {
	  console.error('Error fetching dashboard data:', error);
	} finally {
	  setLoading(false);
	}
  };

  return (
	<div className="dashboard-page">
	  <section className="summary-section">
		<h2>📊 Performance Summary</h2>
		<div className="summary-grid">
		  <div className="summary-card">
			<label>Total Signals</label>
			<span className="value">{summary.total_signals}</span>
		  </div>
		  <div className="summary-card">
			<label>Active Signal</label>
			<span className="value active">{summary.active_signals}</span>
		  </div>
		  <div className="summary-card">
			<label>Closed Signals</label>
			<span className="value">{summary.closed_signals}</span>
		  </div>
		  <div className="summary-card">
			<label>Win Rate</label>
			<span className="value success">{(summary.win_rate * 100).toFixed(1)}%</span>
		  </div>
		  <div className="summary-card">
			<label>Total P&L</label>
			<span className={`value ${summary.total_pnl > 0 ? 'positive' : 'negative'}`}>
			  ${summary.total_pnl.toFixed(2)}
			</span>
		  </div>
		  <div className="summary-card">
			<label>P&L Return</label>
			<span className={`value ${summary.pnl_percentage > 0 ? 'positive' : 'negative'}`}>
			  {summary.pnl_percentage.toFixed(2)}%
			</span>
		  </div>
		</div>
	  </section>

	  <section className="active-signals-section">
		<h2>⏱️ Active Signals ({activeSignals.length})</h2>
		{loading ? (
		  <div className="loading">Loading signals...</div>
		) : activeSignals.length === 0 ? (
		  <div className="empty-state">
			<p>No active signals at the moment</p>
			<p className="hint">Signals will appear here when new BUY/SELL alerts arrive from TradingView</p>
		  </div>
		) : (
		  <div className="signals-grid">
			{activeSignals.map((signal) => (
			  <SignalCard key={signal.id} signal={signal} />
			))}
		  </div>
		)}
	  </section>

	  <section className="news-section">
		<h2>📰 Market News</h2>
		<div className="news-placeholder">
		  <p>Market news and analysis will be displayed here (Phase 2)</p>
		</div>
	  </section>
	</div>
  );
};

export default DashboardPage;
