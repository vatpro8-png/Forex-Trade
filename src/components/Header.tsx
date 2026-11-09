import React from 'react';
import '../styles/Header.css';

interface HeaderProps {
  user: any;
  onLogout: () => void;
  isDarkMode: boolean;
  setIsDarkMode: (dark: boolean) => void;
}

const Header: React.FC<HeaderProps> = ({ user, onLogout, isDarkMode, setIsDarkMode }) => {
  return (
	<header className="header">
	  <div className="header-container">
		<div className="logo">
		  <h1>🏆 SF CAPITAL FX</h1>
		  <p className="tagline">Automated Forex Trading Signals</p>
		</div>

		{user && (
		  <div className="header-right">
			<div className="user-info">
			  <span className="username">{user.username}</span>
			  <span className={`tier-badge ${user.is_premium ? 'premium' : 'free'}`}>
				{user.is_premium ? '⭐ Premium' : 'Free'}
			  </span>
			</div>

			<button 
			  className="theme-toggle"
			  onClick={() => setIsDarkMode(!isDarkMode)}
			  title="Toggle theme"
			>
			  {isDarkMode ? '☀️' : '🌙'}
			</button>

			<button className="logout-btn" onClick={onLogout}>
			  Logout
			</button>
		  </div>
		)}
	  </div>
	</header>
  );
};

export default Header;
