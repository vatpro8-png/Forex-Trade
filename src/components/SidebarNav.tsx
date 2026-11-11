import React from 'react'

interface SidebarNavProps {
  activeSection: string
  onSelectSection: (sectionId: string) => void
  onOpenVip: () => void
  isAdmin: boolean
  onOpenAdmin: () => void
}

export const SidebarNav: React.FC<SidebarNavProps> = ({
  activeSection,
  onSelectSection,
  onOpenVip,
  isAdmin,
  onOpenAdmin,
}) => {
  const navItems = [
    { id: 'terminal-chart', icon: '📊', label: 'Trade' },
    { id: 'signals', icon: '📡', label: 'Signals' },
    { id: 'paper-positions', icon: '🧾', label: 'Trades' },
    { id: 'markets', icon: '🌐', label: 'Markets' },
    { id: 'performance', icon: '📈', label: 'Stats' },
    { id: 'pricing', icon: '👑', label: 'Plans' },
    { id: 'faq', icon: '❓', label: 'FAQ' },
  ]

  return (
    <nav className="po-side-rail" aria-label="Trading workspace navigation">
      <div className="po-rail-top">
        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`po-rail-btn ${activeSection === item.id ? 'active' : ''}`}
            onClick={() => onSelectSection(item.id)}
            title={item.label}
          >
            <span className="po-rail-icon">{item.icon}</span>
            <span className="po-rail-label">{item.label}</span>
          </button>
        ))}
      </div>

      <div className="po-rail-bottom">
        <button
          type="button"
          className="po-rail-btn gold"
          onClick={onOpenVip}
          title="Unlock VIP Signals"
        >
          <span className="po-rail-icon">💎</span>
          <span className="po-rail-label">Buy VIP</span>
        </button>

        {isAdmin && (
          <button
            type="button"
            className="po-rail-btn"
            onClick={onOpenAdmin}
            title="Admin Operations Console"
          >
            <span className="po-rail-icon">⚙</span>
            <span className="po-rail-label">Admin</span>
          </button>
        )}

        <a
          href="https://t.me/sfcapitalfrx"
          target="_blank"
          rel="noopener noreferrer"
          className="po-rail-btn tg"
          title="Telegram VIP Channel"
        >
          <span className="po-rail-icon">✈</span>
          <span className="po-rail-label">Telegram</span>
        </a>
      </div>
    </nav>
  )
}
