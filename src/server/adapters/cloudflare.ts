import { getConfig } from '../config'
import { logger } from '../log'

export type PurgeResult =
  | { ok: true; mode: 'cloudflare' | 'disabled-fake'; purged: number }
  | {
      ok: false
      code: 'timeout' | 'unauthorized' | 'provider_error' | 'network_error'
      message: string
      status?: number
    }

export interface CachePurgeAdapter {
  purge(urls: string[]): Promise<PurgeResult>
}

type FetchLike = typeof fetch

function normalizeUrl(value: string): string | null {
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    parsed.hash = ''
    return parsed.toString()
  } catch {
    return null
  }
}

export class CloudflareCacheAdapter implements CachePurgeAdapter {
  constructor(
    private readonly options: {
      enabled: boolean
      apiToken: string
      zoneId: string
      apiBase: string
      timeoutMs: number
      fetchImpl?: FetchLike
    },
  ) {}

  async purge(urls: string[]): Promise<PurgeResult> {
    const files = Array.from(
      new Set(urls.map(normalizeUrl).filter((url): url is string => Boolean(url))),
    ).slice(0, 30)
    if (!files.length) return { ok: true, mode: 'disabled-fake', purged: 0 }
    if (!this.options.enabled) {
      logger.info('cache purge skipped (adapter disabled)', { count: files.length })
      return { ok: true, mode: 'disabled-fake', purged: 0 }
    }
    if (!this.options.apiToken || !this.options.zoneId) {
      return {
        ok: false,
        code: 'unauthorized',
        message: 'Cloudflare token or zone is not configured',
      }
    }

    const fetchImpl = this.options.fetchImpl ?? fetch
    try {
      const response = await fetchImpl(
        `${this.options.apiBase.replace(/\/$/, '')}/zones/${encodeURIComponent(this.options.zoneId)}/purge_cache`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.options.apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ files }),
          signal: AbortSignal.timeout(this.options.timeoutMs),
        },
      )
      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          code: 'unauthorized',
          message: 'Cloudflare rejected the API token',
          status: response.status,
        }
      }
      if (!response.ok) {
        return {
          ok: false,
          code: 'provider_error',
          message: `Cloudflare purge failed with status ${response.status}`,
          status: response.status,
        }
      }
      const body = (await response.json().catch(() => ({}))) as { success?: boolean }
      if (body.success === false) {
        return {
          ok: false,
          code: 'provider_error',
          message: 'Cloudflare did not accept the purge request',
        }
      }
      logger.info('cache purged', { count: files.length })
      return { ok: true, mode: 'cloudflare', purged: files.length }
    } catch (error) {
      const name = error instanceof Error ? error.name : ''
      if (name === 'TimeoutError' || name === 'AbortError') {
        return { ok: false, code: 'timeout', message: 'Cloudflare purge timed out' }
      }
      return {
        ok: false,
        code: 'network_error',
        message: error instanceof Error ? error.message : 'Cloudflare request failed',
      }
    }
  }
}

let adapter: CachePurgeAdapter | null = null

export function getCachePurgeAdapter(): CachePurgeAdapter {
  if (!adapter) {
    const config = getConfig()
    adapter = new CloudflareCacheAdapter({
      enabled: config.CLOUDFLARE_PURGE_ENABLED,
      apiToken: config.CLOUDFLARE_API_TOKEN,
      zoneId: config.CLOUDFLARE_ZONE_ID,
      apiBase: config.CLOUDFLARE_API_BASE,
      timeoutMs: config.CLOUDFLARE_TIMEOUT_MS,
    })
  }
  return adapter
}

export function setCachePurgeAdapterForTests(value: CachePurgeAdapter | null): void {
  adapter = value
}
