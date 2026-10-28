import { createHash } from 'node:crypto'

import { redirect } from '@tanstack/react-router'
import { deleteCookie, getCookie, setCookie } from '@tanstack/react-start/server'

import { AuthorizationError, type AuthUser, type UserRole } from '~/domain/authz'

import { getConfig } from './config'
import { getDb } from './db'
import { nowIso, randomToken } from './ids'

const COOKIE_NAME = 'shortstack_session'
const SESSION_HOURS = 24 * 7

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function cookieOptions() {
  const config = getConfig()
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: new URL(config.APP_ORIGIN).protocol === 'https:',
    path: '/',
    maxAge: SESSION_HOURS * 60 * 60,
  }
}

export function createSession(userId: string): { token: string; expiresAt: string } {
  const db = getDb()
  const token = randomToken()
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000).toISOString()
  db.prepare(
    'INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)',
  ).run(hashToken(token), userId, nowIso(), expiresAt, nowIso())
  return { token, expiresAt }
}

type UserRow = {
  id: string
  workspace_id: string
  email: string
  name: string
  role: UserRole
  disabled_at: string | null
}

export function resolveSession(token: string): AuthUser | null {
  if (!token || token.length > 256) return null
  const db = getDb()
  const row = db
    .prepare(
      `SELECT u.id, u.workspace_id, u.email, u.name, u.role, u.disabled_at, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ?`,
    )
    .get(hashToken(token)) as (UserRow & { expires_at: string }) | undefined
  if (!row) return null
  if (Date.parse(row.expires_at) <= Date.now() || row.disabled_at) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(hashToken(token))
    return null
  }
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    email: row.email,
    name: row.name,
    role: row.role,
  }
}

export function attachSessionCookie(token: string): void {
  setCookie(COOKIE_NAME, token, cookieOptions())
}

export function clearSessionCookie(): void {
  deleteCookie(COOKIE_NAME, cookieOptions())
}

export function revokeCurrentSession(): void {
  const token = getCookie(COOKIE_NAME)
  if (token) getDb().prepare('DELETE FROM sessions WHERE id = ?').run(hashToken(token))
  clearSessionCookie()
}

export function getSessionUser(): AuthUser | null {
  const token = getCookie(COOKIE_NAME)
  if (!token) return null
  return resolveSession(token)
}

export function requireSessionUser(): AuthUser {
  const user = getSessionUser()
  if (!user) {
    throw redirect({ to: '/login' })
  }
  return user
}

export function requireOwner(user: AuthUser): void {
  if (user.role !== 'owner') {
    throw new AuthorizationError('Only workspace owners can archive or restore links.')
  }
}
