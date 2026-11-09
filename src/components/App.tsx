import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import './styles/App.css';
import Header from './components/Header';
import Navigation from './components/Navigation';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import SignalsPage from './pages/SignalsPage';
import MembershipPage from './pages/MembershipPage';
import AdminPage from './pages/AdminPage';

interface User {
  id: number;
  email: string;
  username: string;
  membership_tier: number;
  is_premium: boolean;
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);

  useEffect(() => {
	// Check if user is already logged in
	const token = localStorage.getItem('session_token');
	if (token) {
	  validateToken(token);
	}
  }, []);

  const validateToken = async (token: string) => {
	try {
	  const response = await fetch('/api/v1/auth/me', {
		headers: {
		  'Authorization': `Bearer ${token}`
		}
	  });
	  if (response.ok) {
		const userData = await response.json();
		setUser(userData);
	  } else {
		localStorage.removeItem('session_token');
	  }
	} catch (error) {
	  console.error('Token validation error:', error);
	}
  };

  const handleLogin = (newUser: User, token: string) => {
	setUser(newUser);
	localStorage.setItem('session_token', token);
  };

  const handleLogout = () => {
	setUser(null);
	localStorage.removeItem('session_token');
  };

  return (
	<Router>
	  <div className={`app ${isDarkMode ? 'dark-mode' : 'light-mode'}`}>
		<Header user={user} onLogout={handleLogout} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />

		{user ? (
		  <>
			<Navigation user={user} />
			<main className="main-content">
			  <Routes>
				<Route path="/dashboard" element={<DashboardPage />} />
				<Route path="/signals" element={<SignalsPage />} />
				<Route path="/membership" element={<MembershipPage />} />
				{user.membership_tier === 1 && (
				  <Route path="/admin" element={<AdminPage />} />
				)}
				<Route path="*" element={<Navigate to="/dashboard" />} />
			  </Routes>
			</main>
		  </>
		) : (
		  <Routes>
			<Route path="/" element={<LoginPage onLogin={handleLogin} />} />
			<Route path="/login" element={<LoginPage onLogin={handleLogin} />} />
			<Route path="*" element={<Navigate to="/" />} />
		  </Routes>
		)}
	  </div>
	</Router>
  );
}

export default App;
