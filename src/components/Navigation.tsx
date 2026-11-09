import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/Navigation.css';

interface NavigationProps {
  user: any;
}

const Navigation: React.FC<NavigationProps> = ({ user }) => {
  return (
	<nav className="navigation">
	  <ul className="nav-list">
		<li><Link to="/dashboard" className="nav-link">📊 Dashboard</Link></li>
		<li><Link to="/signals" className="nav-link">📈 Signals</Link></li>
		<li><Link to="/membership" className="nav-link">💎 Membership</Link></li>
		{user?.membership_tier === 1 && (
		  <li><Link to="/admin" className="nav-link admin">⚙️ Admin</Link></li>
		)}
	  </ul>
	</nav>
  );
};

export default Navigation;
