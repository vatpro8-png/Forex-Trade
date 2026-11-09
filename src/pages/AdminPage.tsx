import React from 'react';
import '../styles/AdminPage.css';

const AdminPage: React.FC = () => {
  return (
	<div className="admin-page">
	  <h2>⚙️ Admin Control Panel</h2>

	  <div className="admin-nav">
		<button className="admin-tab active">👥 Users</button>
		<button className="admin-tab">📊 Signals</button>
		<button className="admin-tab">📋 Audit Log</button>
		<button className="admin-tab">⚙️ Settings</button>
	  </div>

	  <section className="admin-section">
		<h3>👥 User Management</h3>
		<div className="admin-placeholder">
		  <p>Admin features are available to administrators only</p>
		  <ul>
			<li>View and manage all users</li>
			<li>Suspend or upgrade accounts</li>
			<li>Manage subscriptions</li>
			<li>Monitor system health</li>
		  </ul>
		  <p className="note">Full admin dashboard coming in Phase 2</p>
		</div>
	  </section>

	  <section className="admin-section">
		<h3>📊 Signal Management</h3>
		<div className="admin-placeholder">
		  <p>Monitor and manage all trading signals</p>
		  <ul>
			<li>View all signals across users</li>
			<li>Cancel or modify signals</li>
			<li>Track Telegram delivery status</li>
			<li>Retry failed deliveries</li>
		  </ul>
		</div>
	  </section>

	  <section className="admin-section">
		<h3>📋 Audit Log</h3>
		<div className="admin-placeholder">
		  <p>Review system audit trail</p>
		  <ul>
			<li>User registration activities</li>
			<li>Admin actions</li>
			<li>Signal publishing events</li>
			<li>Subscription changes</li>
		  </ul>
		</div>
	  </section>
	</div>
  );
};

export default AdminPage;
