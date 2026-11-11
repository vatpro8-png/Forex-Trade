import type { MembershipPlan } from './types'

// Canonical pricing configuration aligned with backend plans and SQL seeds.
export const MEMBERSHIP_PLANS: MembershipPlan[] = [
  {
    id: 'starter_free',
    slug: 'starter_free',
    name: 'Public Preview',
    isPremium: false,
    priceUsd: 0,
    priceCents: 0,
    durationDays: 0,
    currency: 'USD',
    checkoutMode: 'NONE',
    tagline: 'Public market feed preview with server-side masking on VIP setups.',
    features: [
      'Selected public setups (TP1 preview)',
      'VIP setups and TP2–TP3 masked server-side',
      'Demo paper-trade risk calculator',
    ],
  },
  {
    id: 'premium_30d',
    slug: 'premium_30d',
    name: 'Premium Monthly',
    isPremium: true,
    priceUsd: 100,
    priceCents: 10000,
    durationDays: 30,
    currency: 'USD',
    checkoutMode: 'MANUAL_VERIFICATION',
    badge: '30-DAY PLAN',
    tagline: 'Full member signal levels unlocked for 30 days upon verified payment.',
    features: [
      'Full unmasked XAUUSD, BTCUSD, USOIL & Forex setups',
      'Complete Entry, SL & TP1–TP3 price targets',
      'Telegram VIP channel dispatch when configured',
      'Manual payment verification (30 days)',
    ],
  },
  {
    id: 'premium_365d',
    slug: 'premium_365d',
    name: 'Premium Plus Annual',
    isPremium: true,
    priceUsd: 800,
    priceCents: 80000,
    durationDays: 365,
    currency: 'USD',
    checkoutMode: 'MANUAL_VERIFICATION',
    badge: 'SAVE $400 · YEARLY',
    tagline: 'Uninterrupted 12-month VIP entitlement (4 months free vs monthly).',
    features: [
      'Everything in Premium Monthly',
      '365-day continuous VIP access after verification',
      'Full closed-record analytics & milestone feed',
      'Priority onboarding & support via official Telegram',
    ],
  },
]

export function getPlanBySlug(slug?: string | null): MembershipPlan {
  return (
    MEMBERSHIP_PLANS.find((plan) => plan.slug === slug) ||
    MEMBERSHIP_PLANS[1]
  )
}
