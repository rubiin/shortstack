export type LinkState = 'active' | 'disabled' | 'expired' | 'archived'

export type LinkStateInput = {
  enabled: boolean
  expiresAt: string | null
  archivedAt: string | null
}

export function effectiveLinkState(input: LinkStateInput, now = new Date()): LinkState {
  if (input.archivedAt) return 'archived'
  if (!input.enabled) return 'disabled'
  if (input.expiresAt && Date.parse(input.expiresAt) <= now.getTime()) return 'expired'
  return 'active'
}

export function isRedirectable(input: LinkStateInput, now = new Date()): boolean {
  return effectiveLinkState(input, now) === 'active'
}

export function expiryWarning(input: LinkStateInput, now = new Date(), warningDays = 7): boolean {
  if (!input.expiresAt || input.archivedAt || !input.enabled) return false
  const remaining = Date.parse(input.expiresAt) - now.getTime()
  return remaining > 0 && remaining <= warningDays * 24 * 60 * 60 * 1000
}

export function parseDateTimeLocalUtc(value: string): string | null {
  if (!value) return null
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)) return null
  const normalized = value.length === 16 ? `${value}:00` : value
  const date = new Date(`${normalized}Z`)
  if (Number.isNaN(date.getTime())) return null
  // Date rolls impossible values such as 2026-02-31 forward. Reject them rather
  // than silently scheduling a different expiry day.
  if (date.toISOString().slice(0, 19) !== normalized) return null
  return date.toISOString()
}

export function toDateTimeLocal(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 16)
}

export type DateRange = {
  from: string
  to: string
  days: number
  previousFrom: string
  previousTo: string
}

function addUtcDays(day: string, amount: number): string {
  const date = new Date(`${day}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

function validDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function resolveDateRange(
  input: { from?: string; to?: string; days?: string | number },
  now = new Date(),
): DateRange {
  const today = now.toISOString().slice(0, 10)
  const requestedDays = Math.min(366, Math.max(1, Number(input.days) || 30))
  let to = validDay(input.to ?? '') ? (input.to as string) : today
  let from = validDay(input.from ?? '')
    ? (input.from as string)
    : addUtcDays(to, -(requestedDays - 1))

  if (from > to) [from, to] = [to, from]
  const span =
    Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1
  if (span > 366) {
    from = addUtcDays(to, -365)
  }
  const days =
    Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1
  return {
    from,
    to,
    days,
    previousFrom: addUtcDays(from, -days),
    previousTo: addUtcDays(from, -1),
  }
}

export function enumerateDays(from: string, to: string): string[] {
  const days: string[] = []
  let cursor = from
  let guard = 0
  while (cursor <= to && guard < 367) {
    days.push(cursor)
    cursor = addUtcDays(cursor, 1)
    guard += 1
  }
  return days
}

export function humanExpiry(expiresAt: string | null, now = new Date()): string {
  if (!expiresAt) return 'No expiry'
  const diff = Date.parse(expiresAt) - now.getTime()
  if (diff <= 0) return 'Expired'
  const hours = Math.floor(diff / 3_600_000)
  if (hours < 1) return 'Expires in under an hour'
  if (hours < 48) return `Expires in ${hours}h`
  const days = Math.ceil(hours / 24)
  return `Expires in ${days} days`
}

export function formatUtc(iso: string | null): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(iso))
}
