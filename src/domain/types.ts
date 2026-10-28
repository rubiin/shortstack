import type { LinkState } from './time'

export type DomainOption = {
  id: string
  hostname: string
  origin: string
  isDefault: boolean
}

export type CampaignOption = {
  id: string
  name: string
}

export type LinkListItem = {
  id: string
  slug: string
  shortUrl: string
  destinationUrl: string
  campaignId: string | null
  campaignName: string | null
  note: string | null
  expiresAt: string | null
  expiresTimezone: string
  enabled: boolean
  archivedAt: string | null
  state: LinkState
  clicks7d: number
  createdAt: string
  updatedAt: string
  domainHostname: string
}

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }

export type AuditEntry = {
  id: string
  action: string
  actorName: string | null
  createdAt: string
  details: Record<string, JsonValue>
}

export type LinkDetail = LinkListItem & {
  workspaceId: string
  domainId: string
  clicks30d: number
  clicksTotal: number
  createdBy: string
  updatedBy: string
  lastDays: Array<{ day: string; clicks: number }>
  audit: AuditEntry[]
  canArchive: boolean
}

export type DashboardStats = {
  activeLinks: number
  clicks7d: number
  expiring7d: number
  archivedLinks: number
}

export type LinkListResult = {
  links: LinkListItem[]
  total: number
  page: number
  pageSize: number
  stats: DashboardStats
  domains: DomainOption[]
  campaigns: CampaignOption[]
}

export type AnalyticsRange = {
  from: string
  to: string
  days: number
  previousFrom: string
  previousTo: string
}

export type BreakdownItem = {
  key: string
  label: string
  clicks: number
  share: number
}

export type TrendPoint = {
  day: string
  current: number
  previous: number
}

export type ExportSummary = {
  id: string
  status: 'queued' | 'running' | 'ready' | 'failed' | 'expired'
  rowCount: number | null
  attempts: number
  lastError: string | null
  createdAt: string
  expiresAt: string | null
  downloadUrl: string | null
  requestedByName: string
}

export type AnalyticsData = {
  filters: {
    from: string
    to: string
    days: number
    compare: boolean
    campaignId: string | null
  }
  range: AnalyticsRange
  totalClicks: number
  previousClicks: number
  deltaPercent: number | null
  topReferrer: BreakdownItem | null
  topCountry: BreakdownItem | null
  mobileShare: number
  trend: TrendPoint[]
  referrers: BreakdownItem[]
  countries: BreakdownItem[]
  devices: BreakdownItem[]
  campaigns: BreakdownItem[]
  topLinks: Array<{ id: string; slug: string; campaignName: string | null; clicks: number }>
  exportList: ExportSummary[]
  campaignsAvailable: CampaignOption[]
  hasAnyClicks: boolean
}

export type ImportBatchStatus = 'draft' | 'previewed' | 'creating' | 'completed' | 'failed'

export type ImportRowError = {
  field: string
  message: string
}

export type ImportRowView = {
  id: string
  rowNumber: number
  slug: string | null
  destinationUrl: string | null
  campaignName: string | null
  note: string | null
  expiresAt: string | null
  enabled: boolean
  status: 'pending' | 'valid' | 'invalid' | 'duplicate' | 'excluded' | 'created'
  errors: ImportRowError[]
  suggestedSlug: string | null
  createdLinkId: string | null
}

export type ImportBatchView = {
  id: string
  filename: string | null
  status: ImportBatchStatus
  headers: string[]
  mapping: Record<string, string | null>
  totalRows: number
  validRows: number
  invalidRows: number
  commitToken: string
  domainId: string
  domainHostname: string
  createdAt: string
  completedAt: string | null
  rows: ImportRowView[]
  domains: DomainOption[]
  createdLinks: Array<{ id: string; slug: string; shortUrl: string }>
  rawExpired: boolean
}
