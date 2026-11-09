export type SignalDirection = 'BUY' | 'SELL'

export type SignalStatus =
  | 'ACTIVE'
  | 'TP1_HIT'
  | 'TP2_HIT'
  | 'TP3_HIT'
  | 'SL_HIT'
  | 'CLOSED'
  | 'CANCELLED'

export interface Signal {
  id: string
  pair: string
  symbol?: string
  direction: SignalDirection
  action?: SignalDirection
  timeframe: string
  entry: number
  entryPrice?: number
  sl: number
  stopLoss?: number
  tp1: number
  tp2: number
  tp3: number
  takeProfit?: number
  time: string
  signalTime?: string
  status: SignalStatus
  source: string
  pnlPips?: number
  isPremiumOnly?: boolean
  milestones?: { milestone: string; time: string }[]
}

export interface PerformanceStats {
  totalTrades: number
  winningTrades: number
  losingTrades: number
  winRate: number | null
  totalProfit: number
  totalLoss: number
}

export type UserRole = 'member' | 'admin'
export type MembershipStatus = 'FREE' | 'PREMIUM'

export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  membershipStatus: MembershipStatus
  premiumExpiresAt?: string
  createdAt?: string
}

export interface MarketInfo {
  symbol: string
  name: string
  category: 'Metals' | 'Crypto' | 'Energy' | 'Forex'
  iconText: string
  iconClass: 'gold' | 'bitcoin' | 'oil' | 'forex'
  digits: number
  pipSize: number
  price: number
  change24h: number
  description: string
}
