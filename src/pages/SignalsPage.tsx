import React, { useState, useEffect } from 'react';
import SignalCard, { Signal } from '../components/SignalCard';
import '../styles/SignalsPage.css';

const SignalsPage: React.FC = () => {
  const [allSignals, setAllSignals] = useState<Signal[]>([]);
  const [filteredSignals, setFilteredSignals] = useState<Signal[]>([]);
  const [selectedPair, setSelectedPair] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [loading, setLoading] = useState(true);

  const pairs = ['ALL', 'XAUUSD', 'EURUSD', 'USDJPY', 'GBPUSD', 'AUDUSD'];
  const statuses = ['ALL', 'ACTIVE', 'TP1_HIT', 'TP2_HIT', 'TP3_HIT', 'SL_HIT', 'CLOSED'];

  useEffect(() => {
	fetchSignals();
  }, []);

  useEffect(() => {
	applyFilters();
  }, [allSignals, selectedPair, selectedStatus]);

  const fetchSignals = async () => {
	try {
	  setLoading(true);
	  const token = localStorage.getItem('session_token');

	  const response = await fetch('/api/v1/signals?limit=200', {
		headers: { 'Authorization': `Bearer ${token}` }
	  });

	  if (response.ok) {
		const data = await response.json();
		setAllSignals(data.signals || []);
	  }
	} catch (error) {
	  console.error('Error fetching signals:', error);
	} finally {
	  setLoading(false);
	}
  };

  const applyFilters = () => {
	let filtered = allSignals;

	if (selectedPair !== 'ALL') {
	  filtered = filtered.filter(s => s.trading_pair === selectedPair);
	}

	if (selectedStatus !== 'ALL') {
	  filtered = filtered.filter(s => s.status === selectedStatus);
	}

	setFilteredSignals(filtered);
  };

  return (
	<div className="signals-page">
	  <div className="signals-header">
		<h2>📈 All Trading Signals</h2>
		<button className="refresh-btn" onClick={fetchSignals} disabled={loading}>
		  🔄 Refresh
		</button>
	  </div>

	  <div className="filters-section">
		<div className="filter-group">
		  <label>Trading Pair:</label>
		  <select value={selectedPair} onChange={(e) => setSelectedPair(e.target.value)}>
			{pairs.map(pair => (
			  <option key={pair} value={pair}>{pair}</option>
			))}
		  </select>
		</div>

		<div className="filter-group">
		  <label>Status:</label>
		  <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)}>
			{statuses.map(status => (
			  <option key={status} value={status}>{status}</option>
			))}
		  </select>
		</div>
	  </div>

	  {loading ? (
		<div className="loading">Loading signals...</div>
	  ) : filteredSignals.length === 0 ? (
		<div className="empty-state">
		  <p>No signals found with the selected filters</p>
		</div>
	  ) : (
		<div className="signals-list">
		  <div className="signals-count">
			Showing {filteredSignals.length} signal{filteredSignals.length !== 1 ? 's' : ''}
		  </div>
		  <div className="signals-grid">
			{filteredSignals.map((signal) => (
			  <SignalCard key={signal.id} signal={signal} />
			))}
		  </div>
		</div>
	  )}
	</div>
  );
};

export default SignalsPage;
