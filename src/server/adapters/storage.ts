import { createHmac, timingSafeEqual } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, posix } from 'node:path'
import { getConfig } from '../config'

export type StoredFile = {
  key: string
  bytes: Buffer
  contentType: string
}

export interface ObjectStorage {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>
  get(key: string, contentType?: string): Promise<StoredFile>
  delete(key: string): Promise<void>
  signedUrl(key: string, ttlSeconds?: number): string
  verifySignedUrl(token: string): { key: string; expiresAt: number } | null
  exists(key: string): Promise<boolean>
}

export class StorageError extends Error {
  readonly code: 'invalid_key' | 'not_found' | 'io_error' | 'bad_signature'
  constructor(code: StorageError['code'], message: string) {
    super(message)
    this.name = 'StorageError'
    this.code = code
  }
}

const safeKey = /^[a-zA-Z0-9][a-zA-Z0-9/_-]*\.[a-zA-Z0-9]+$/

export function assertSafeKey(key: string): void {
  if (
    !safeKey.test(key) ||
    key.includes('..') ||
    key.includes('//') ||
    key.startsWith('/') ||
    key.length > 512
  ) {
    throw new StorageError('invalid_key', 'Invalid storage key')
  }
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

export class LocalObjectStorage implements ObjectStorage {
  constructor(
    private readonly root: string,
    private readonly secret: string,
    private readonly appOrigin: string,
  ) {}

  private pathFor(key: string): string {
    assertSafeKey(key)
    return join(this.root, key)
  }

  async put(key: string, bytes: Uint8Array, _contentType: string): Promise<void> {
    const path = this.pathFor(key)
    try {
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, bytes, { mode: 0o600 })
    } catch {
      throw new StorageError('io_error', 'Could not write export file')
    }
  }

  async get(key: string, contentType = 'application/octet-stream'): Promise<StoredFile> {
    const path = this.pathFor(key)
    try {
      const bytes = await readFile(path)
      return { key, bytes, contentType }
    } catch {
      throw new StorageError('not_found', 'Export file not found')
    }
  }

  async delete(key: string): Promise<void> {
    const path = this.pathFor(key)
    try {
      await rm(path, { force: true })
    } catch {
      throw new StorageError('io_error', 'Could not delete export file')
    }
  }

  async exists(key: string): Promise<boolean> {
    return existsSync(this.pathFor(key))
  }

  signedUrl(key: string, ttlSeconds = 300): string {
    assertSafeKey(key)
    const expiresAt = Math.floor(Date.now() / 1000) + Math.min(3600, Math.max(30, ttlSeconds))
    const payload = `${key}:${expiresAt}`
    const signature = createHmac('sha256', this.secret).update(payload).digest('base64url')
    const token = base64url(payload) + '.' + signature
    return `${this.appOrigin.replace(/\/$/, '')}/api/files/${encodeURIComponent(token)}`
  }

  verifySignedUrl(token: string): { key: string; expiresAt: number } | null {
    const [encoded, signature] = token.split('.')
    if (!encoded || !signature) return null
    let payload: string
    try {
      payload = Buffer.from(encoded, 'base64url').toString('utf8')
    } catch {
      return null
    }
    const separator = payload.lastIndexOf(':')
    if (separator <= 0) return null
    const key = payload.slice(0, separator)
    const expiresAt = Number(payload.slice(separator + 1))
    if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) return null
    try {
      assertSafeKey(key)
    } catch {
      return null
    }
    const expected = createHmac('sha256', this.secret).update(payload).digest('base64url')
    const expectedBuffer = Buffer.from(expected)
    const actualBuffer = Buffer.from(signature)
    if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) return null
    return { key, expiresAt }
  }

  filePathForTest(key: string): string {
    return posix.normalize(this.pathFor(key))
  }
}

let storage: ObjectStorage | null = null

export function getStorage(): ObjectStorage {
  if (!storage) {
    const config = getConfig()
    storage = new LocalObjectStorage(config.FILE_STORAGE_DIR, config.FILE_SIGNING_SECRET, config.APP_ORIGIN)
  }
  return storage
}

export function setStorageForTests(adapter: ObjectStorage | null): void {
  storage = adapter
}
