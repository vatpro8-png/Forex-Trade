import React, { useState, useEffect } from 'react';
import '../styles/MembershipPage.css';

interface Plan {
  id: number;
  name: string;
  description: string;
  price: number;
  currency: string;
  billing_period?: string;
  features: string[];
}

const MembershipPage: React.FC = () => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [currentPlan, setCurrentPlan] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
	fetchPlans();
	fetchCurrentSubscription();
  }, []);

  const fetchPlans = async () => {
	try {
	  const response = await fetch('/api/v1/memberships/plans');
	  if (response.ok) {
		const data = await response.json();
		setPlans(data.plans || []);
	  }
	} catch (error) {
	  console.error('Error fetching plans:', error);
	}
  };

  const fetchCurrentSubscription = async () => {
	try {
	  const token = localStorage.getItem('session_token');
	  const response = await fetch('/api/v1/subscriptions/current', {
		headers: { 'Authorization': `Bearer ${token}` }
	  });
	  if (response.ok) {
		const data = await response.json();
		setCurrentPlan(data);
	  }
	} catch (error) {
	  console.error('Error fetching subscription:', error);
	} finally {
	  setLoading(false);
	}
  };

  const handleUpgrade = async (planId: number) => {
	try {
	  const token = localStorage.getItem('session_token');
	  const response = await fetch('/api/v1/subscriptions/upgrade', {
		method: 'POST',
		headers: {
		  'Authorization': `Bearer ${token}`,
		  'Content-Type': 'application/json'
		},
		body: JSON.stringify({
		  plan_id: planId,
		  billing_period: 'monthly'
		})
	  });

	  if (response.ok) {
		const data = await response.json();
		// Redirect to payment URL or show payment modal
		alert('Upgrade initiated! (Payment integration in Phase 2)');
	  }
	} catch (error) {
	  console.error('Error upgrading:', error);
	}
  };

  const handleCancel = async () => {
	if (!window.confirm('Are you sure you want to cancel your subscription?')) return;

	try {
	  const token = localStorage.getItem('session_token');
	  const response = await fetch('/api/v1/subscriptions/cancel', {
		method: 'POST',
		headers: { 'Authorization': `Bearer ${token}` }
	  });

	  if (response.ok) {
		alert('Subscription cancelled');
		fetchCurrentSubscription();
	  }
	} catch (error) {
	  console.error('Error cancelling:', error);
	}
  };

  return (
	<div className="membership-page">
	  <h2>💎 Membership Plans</h2>

	  {!loading && currentPlan && (
		<div className="current-plan-info">
		  <h3>📋 Your Current Plan</h3>
		  <div className="plan-info">
			<p><strong>Tier:</strong> {currentPlan.tier_name}</p>
			<p><strong>Status:</strong> {currentPlan.status}</p>
			<p><strong>Started:</strong> {new Date(currentPlan.started_at).toLocaleDateString()}</p>
			{currentPlan.renews_at && (
			  <p><strong>Renews:</strong> {new Date(currentPlan.renews_at).toLocaleDateString()}</p>
			)}
			{currentPlan.status === 'active' && (
			  <button className="cancel-btn" onClick={handleCancel}>Cancel Subscription</button>
			)}
		  </div>
		</div>
	  )}

	  {loading ? (
		<div className="loading">Loading plans...</div>
	  ) : (
		<div className="plans-grid">
		  {plans.map((plan) => (
			<div key={plan.id} className={`plan-card ${currentPlan?.tier_name === plan.name ? 'current' : ''}`}>
			  <div className="plan-header">
				<h3>{plan.name}</h3>
				<p className="description">{plan.description}</p>
			  </div>

			  <div className="plan-price">
				{plan.price === 0 ? (
				  <span className="free">Forever Free</span>
				) : (
				  <>
					<span className="amount">${plan.price}</span>
					<span className="period">/{plan.billing_period}</span>
				  </>
				)}
			  </div>

			  <ul className="features">
				{plan.features.map((feature, idx) => (
				  <li key={idx}>✅ {feature}</li>
				))}
			  </ul>

			  {currentPlan?.tier_name === plan.name ? (
				<button className="current-plan-btn" disabled>✅ Current Plan</button>
			  ) : (
				<button 
				  className="upgrade-btn"
				  onClick={() => handleUpgrade(plan.id)}
				  disabled={plan.price === 0}
				>
				  {plan.price === 0 ? 'Already Have' : 'Upgrade Now'}
				</button>
			  )}
			</div>
		  ))}
		</div>
	  )}

	  <div className="faq-section">
		<h3>❓ Frequently Asked Questions</h3>
		<div className="faq-item">
		  <h4>Can I cancel anytime?</h4>
		  <p>Yes, you can cancel your subscription at any time without penalties.</p>
		</div>
		<div className="faq-item">
		  <h4>What's the difference between Free and Premium?</h4>
		  <p>Premium members get unlimited signal access, advanced analytics, and priority support.</p>
		</div>
		<div className="faq-item">
		  <h4>Will I get a refund if I cancel?</h4>
		  <p>Refunds follow the payment provider's policy (typically no refunds for the current billing period).</p>
		</div>
	  </div>
	</div>
  );
};

export default MembershipPage;
