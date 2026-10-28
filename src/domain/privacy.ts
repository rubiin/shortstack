export type DeviceClass = 'desktop' | 'mobile' | 'tablet' | 'bot' | 'unknown'

const BOT_PATTERN =
  /bot|crawler|spider|preview|headless|curl\/|wget|python-requests|facebookexternalhit|slackbot|twitterbot|linkedinbot|whatsapp|telegram|discord/i

export function classifyDevice(userAgent: string | null | undefined): DeviceClass {
  if (!userAgent) return 'unknown'
  if (BOT_PATTERN.test(userAgent)) return 'bot'
  if (/ipad|tablet|playbook|silk|android(?!.*mobile)/i.test(userAgent)) return 'tablet'
  if (/mobile|iphone|ipod|android|blackberry|windows phone/i.test(userAgent)) return 'mobile'
  return 'desktop'
}

export function coarseCountry(header: string | null | undefined): string {
  if (!header) return 'ZZ'
  const normalized = header.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(normalized) || normalized === 'XX') return 'ZZ'
  return normalized
}

export function referrerDomain(referrer: string | null | undefined): string {
  if (!referrer) return 'direct'
  try {
    const parsed = new URL(referrer)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return 'direct'
    const host = parsed.hostname.toLowerCase().replace(/\.$/, '').replace(/^www\./, '')
    if (!host || host.length > 253 || !host.includes('.')) return 'direct'
    return host
  } catch {
    return 'direct'
  }
}

export function deviceLabel(device: string): string {
  if (device === 'bot') return 'Automated'
  if (device === 'unknown') return 'Unknown'
  return device.charAt(0).toUpperCase() + device.slice(1)
}

export function countryName(code: string): string {
  if (code === 'ZZ') return 'Unknown'
  const label = new Intl.DisplayNames(['en'], { type: 'region' }).of(code)
  return label && label !== code ? label : code
}

export function percentage(part: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((part / total) * 100)
}
