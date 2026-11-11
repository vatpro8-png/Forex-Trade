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
  entry: number | null
  entryPrice?: number | null
  sl: number | null
  stopLoss?: number | null
  tp1: number | null
  tp2: number | null
  tp3: number | null
  takeProfit?: number | null
  time: string
  signalTime?: string
  status: SignalStatus
  source: string
  pnlPips?: number | null
  isPremiumOnly?: boolean
  isLocked?: boolean
  isPartial?: boolean
  milestones?: { milestone: string; time: string; price?: number }[]
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
export type MembershipPlanSlug = 'starter_free' | 'premium_30d' | 'premium_365d'

export interface MembershipPlan {
  id: MembershipPlanSlug
  slug: MembershipPlanSlug
  name: string
  isPremium: boolean
  priceUsd: number
  priceCents: number
  durationDays: number
  currency: 'USD'
  checkoutMode: 'NONE' | 'MANUAL_VERIFICATION'
  badge?: string
  tagline: string
  features: string[]
}

export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  membershipStatus: MembershipStatus
  membershipPlan?: MembershipPlanSlug
  premiumExpiresAt?: string | null
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
