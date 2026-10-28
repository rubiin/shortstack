import { createHmac } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { CloudflareCacheAdapter } from '../../src/server/adapters/cloudflare'
import { assertSafeKey, LocalObjectStorage, StorageError } from '../../src/server/adapters/storage'

const secret = 'test-signing-secret'

function makeStorage() {
  const root = mkdtempSync(join(tmpdir(), 'shortstack-storage-'))
  const storage = new LocalObjectStorage(root, secret, 'http://127.0.0.1:3100')
  return {
    storage,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  }
}

function tokenOf(url: string): string {
  return decodeURIComponent(url.split('/api/files/')[1] ?? '')
}

describe('local object storage', () => {
  it('writes, reads, and deletes files', async () => {
    const { storage, cleanup } = makeStorage()
    try {
      await storage.put(
        'exports/ws_one/one.csv',
        new TextEncoder().encode('a,b\r\n1,2\r\n'),
        'text/csv',
      )
      expect(await storage.exists('exports/ws_one/one.csv')).toBe(true)
      const file = await storage.get('exports/ws_one/one.csv', 'text/csv')
      expect(file.bytes.toString()).toBe('a,b\r\n1,2\r\n')
      expect(file.contentType).toBe('text/csv')
      await storage.delete('exports/ws_one/one.csv')
      expect(await storage.exists('exports/ws_one/one.csv')).toBe(false)
    } finally {
      cleanup()
    }
  })

  it('signs short-lived download URLs and rejects tampering', async () => {
    const { storage, cleanup } = makeStorage()
    try {
      await storage.put('exports/ws/one.csv', new TextEncoder().encode('data'), 'text/csv')
      const url = storage.signedUrl('exports/ws/one.csv', 60)
      expect(url.startsWith('http://127.0.0.1:3100/api/files/')).toBe(true)
      const token = tokenOf(url)
      expect(storage.verifySignedUrl(token)).toMatchObject({ key: 'exports/ws/one.csv' })
      expect(storage.verifySignedUrl(`${token}x`)).toBeNull()
      expect(storage.verifySignedUrl('garbage')).toBeNull()

      const payload = Buffer.from('exports/ws/one.csv:9999999999').toString('base64url')
      const signature = createHmac('sha256', secret)
        .update(`exports/ws/one.csv:9999999999`)
        .digest('base64url')
      expect(storage.verifySignedUrl(`${payload}.${signature}`)).toMatchObject({
        key: 'exports/ws/one.csv',
      })
      const expiredPayload = Buffer.from('exports/ws/one.csv:1').toString('base64url')
      const expiredSignature = createHmac('sha256', secret)
        .update('exports/ws/one.csv:1')
        .digest('base64url')
      expect(storage.verifySignedUrl(`${expiredPayload}.${expiredSignature}`)).toBeNull()
    } finally {
      cleanup()
    }
  })

  it('rejects unsafe keys', () => {
    for (const key of [
      '../secret.txt',
      '/etc/passwd',
      'exports//one.csv',
      'a'.repeat(600) + '.csv',
    ]) {
      expect(() => assertSafeKey(key)).toThrow(StorageError)
    }
    expect(() => assertSafeKey('exports/ws/one.csv')).not.toThrow()
  })
})

describe('Cloudflare cache purge adapter', () => {
  const base = {
    enabled: true,
    apiToken: 'token',
    zoneId: 'zone',
    apiBase: 'https://api.cloudflare.test/client/v4',
    timeoutMs: 1_000,
  }

  it('does nothing when disabled', async () => {
    const adapter = new CloudflareCacheAdapter({ ...base, enabled: false })
    expect(await adapter.purge(['https://links.test/one'])).toEqual({
      ok: true,
      mode: 'disabled-fake',
      purged: 0,
    })
  })

  it('deduplicates valid URLs and sends a purge request', async () => {
    const captured: { url: string; init?: RequestInit } = { url: '' }
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      captured.url = String(input)
      captured.init = init
      return new Response(JSON.stringify({ success: true }), { status: 200 })
    }) as typeof fetch
    const adapter = new CloudflareCacheAdapter({ ...base, fetchImpl })
    const result = await adapter.purge([
      'https://links.test/one',
      'https://links.test/one',
      'https://links.test/two#fragment',
      'not a url',
      'ftp://links.test/three',
    ])
    expect(result).toEqual({ ok: true, mode: 'cloudflare', purged: 2 })
    expect(captured.url).toBe('https://api.cloudflare.test/client/v4/zones/zone/purge_cache')
    expect(captured.init?.method).toBe('POST')
    expect(JSON.parse(String(captured.init?.body))).toEqual({
      files: ['https://links.test/one', 'https://links.test/two'],
    })
  })

  it('normalises auth, provider, and network failures', async () => {
    const unauthorized = new CloudflareCacheAdapter({
      ...base,
      fetchImpl: (async () => new Response('', { status: 401 })) as typeof fetch,
    })
    expect(await unauthorized.purge(['https://links.test/one'])).toMatchObject({
      ok: false,
      code: 'unauthorized',
      status: 401,
    })

    const provider = new CloudflareCacheAdapter({
      ...base,
      fetchImpl: (async () => new Response('', { status: 502 })) as typeof fetch,
    })
    expect(await provider.purge(['https://links.test/one'])).toMatchObject({
      ok: false,
      code: 'provider_error',
      status: 502,
    })

    const rejected = new CloudflareCacheAdapter({
      ...base,
      fetchImpl: (async () =>
        new Response(JSON.stringify({ success: false }), { status: 200 })) as typeof fetch,
    })
    expect(await rejected.purge(['https://links.test/one'])).toMatchObject({
      ok: false,
      code: 'provider_error',
    })

    const timeout = new CloudflareCacheAdapter({
      ...base,
      fetchImpl: (async () => {
        const error = new Error('timed out')
        error.name = 'TimeoutError'
        throw error
      }) as typeof fetch,
    })
    expect(await timeout.purge(['https://links.test/one'])).toMatchObject({
      ok: false,
      code: 'timeout',
    })

    const network = new CloudflareCacheAdapter({
      ...base,
      fetchImpl: (async () => {
        throw new Error('connection reset')
      }) as typeof fetch,
    })
    expect(await network.purge(['https://links.test/one'])).toMatchObject({
      ok: false,
      code: 'network_error',
      message: 'connection reset',
    })
  })

  it('reports missing credentials without making a request', async () => {
    let called = false
    const adapter = new CloudflareCacheAdapter({
      ...base,
      apiToken: '',
      fetchImpl: (async () => {
        called = true
        return new Response('')
      }) as typeof fetch,
    })
    expect(await adapter.purge(['https://links.test/one'])).toMatchObject({
      ok: false,
      code: 'unauthorized',
    })
    expect(called).toBe(false)
  })
})
