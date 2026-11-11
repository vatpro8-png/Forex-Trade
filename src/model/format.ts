export function parseOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

export function formatPrice(value: number | undefined | null, digits = 2, maskedLabel = 'VIP'): string {
  if (value === null || value === undefined || isNaN(value)) return maskedLabel
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export function formatPips(value: number | undefined | null): { text: string; tone: 'profit' | 'loss' | 'neutral' } {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return { text: 'Pending', tone: 'neutral' }
  }
  if (value > 0) return { text: `+${value} pips`, tone: 'profit' }
  if (value < 0) return { text: `${value} pips`, tone: 'loss' }
  return { text: '0 pips', tone: 'neutral' }
}

export function formatDate(value: string | number | Date | undefined | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function formatTimeAgo(value: string | number | Date | undefined | null): string {
  if (!value) return '—'
  const date = new Date(value)
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000)
  if (diffSec < 60) return `${Math.max(1, diffSec)}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour}h ago`
  const diffDay = Math.floor(diffHour / 24)
  return `${diffDay}d ago`
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const success = document.execCommand('copy')
    document.body.removeChild(textarea)
    return success
  }
}
