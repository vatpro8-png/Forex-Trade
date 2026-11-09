import React, { useState } from 'react';
import '../styles/LoginPage.css';

interface LoginPageProps {
  onLogin: (user: any, token: string) => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('test@sfcapitalfx.com');
  const [password, setPassword] = useState('test123');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
	e.preventDefault();
	setError('');
	setLoading(true);

	try {
	  const endpoint = isLogin ? '/api/v1/auth/login' : '/api/v1/auth/register';
	  const payload = isLogin 
		? { email, password }
		: { email, password, username };

	  const response = await fetch(endpoint, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload)
	  });

	  if (!response.ok) {
		const data = await response.json();
		throw new Error(data.error || 'Request failed');
	  }

	  const data = await response.json();

	  onLogin(data.user || { 
		id: 1, 
		email, 
		username: username || 'user', 
		membership_tier: 0,
		is_premium: false 
	  }, data.session_token);

	} catch (err) {
	  setError(err instanceof Error ? err.message : 'An error occurred');
	} finally {
	  setLoading(false);
	}
  };

  return (
	<div className="login-page">
	  <div className="login-container">
		<div className="login-hero">
		  <h1>🏆 SF CAPITAL FX</h1>
		  <p>Automated Forex Trading Signals</p>
		  <div className="hero-features">
			<div className="feature">✅ TradingView Integration</div>
			<div className="feature">📱 Telegram Alerts</div>
			<div className="feature">📊 Live Dashboard</div>
			<div className="feature">💎 Premium Signals</div>
		  </div>
		</div>

		<form className="login-form" onSubmit={handleSubmit}>
		  <h2>{isLogin ? 'Login' : 'Register'}</h2>

		  {error && <div className="error-message">{error}</div>}

		  <div className="form-group">
			<label>📧 Email</label>
			<input
			  type="email"
			  value={email}
			  onChange={(e) => setEmail(e.target.value)}
			  required
			  placeholder="your@email.com"
			/>
		  </div>

		  {!isLogin && (
			<div className="form-group">
			  <label>👤 Username</label>
			  <input
				type="text"
				value={username}
				onChange={(e) => setUsername(e.target.value)}
				required
				placeholder="your_username"
			  />
			</div>
		  )}

		  <div className="form-group">
			<label>🔒 Password</label>
			<input
			  type="password"
			  value={password}
			  onChange={(e) => setPassword(e.target.value)}
			  required
			  placeholder="At least 8 characters"
			/>
		  </div>

		  <button type="submit" disabled={loading} className="submit-btn">
			{loading ? 'Loading...' : isLogin ? 'Login' : 'Register'}
		  </button>

		  <p className="toggle-mode">
			{isLogin ? "Don't have an account? " : "Already have an account? "}
			<button
			  type="button"
			  onClick={() => {
				setIsLogin(!isLogin);
				setError('');
			  }}
			  className="toggle-btn"
			>
			  {isLogin ? 'Register here' : 'Login here'}
			</button>
		  </p>
		</form>

		<div className="demo-info">
		  <p><strong>Demo Credentials:</strong></p>
		  <p>Email: test@sfcapitalfx.com</p>
		  <p>Password: test123</p>
		</div>
	  </div>
	</div>
  );
};

export default LoginPage;
