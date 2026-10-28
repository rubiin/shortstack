import { createServerFn } from '@tanstack/react-start'
import { getRequestIP, setResponseHeader } from '@tanstack/react-start/server'
import { redirect } from '@tanstack/react-router'
import { z } from 'zod'
import { getDb } from '../db'
import { nowIso } from '../ids'
import { getSessionUser, attachSessionCookie, revokeCurrentSession, createSession, requireSessionUser } from '../auth'
import { verifyPassword, hashPassword } from '../password'
import { rateLimitOrThrow } from '../rate-limit'
import { logger } from '../log'
import { actionError, ok, type ActionResult } from './result'
import type { AuthUser } from '~/domain/authz'

const loginSchema = z.object({
  email: z.string().trim().min(1, 'Enter your email.').max(254),
  password: z.string().min(1, 'Enter your password.').max(200),
  next: z.string().max(500).optional().default('/app/links'),
})

const dummyHash = hashPassword('shortstack-not-a-real-password')

function safeNext(value: string): string {
  return /^\/app(?:\/|$)/.test(value) && !value.startsWith('//') ? value : '/app/links'
}

export const getSessionFn = createServerFn({ method: 'GET' }).handler(async () => {
  setResponseHeader('Cache-Control', 'private, no-store')
  return { user: getSessionUser() }
})

export const loginFn = createServerFn({ method: 'POST' })
  .validator((input: unknown) => loginSchema.parse(input))
  .handler(async ({ data }): Promise<ActionResult<{ user: AuthUser }>> => {
    try {
      const db = getDb()
      const email = data.email.trim().toLowerCase()
      const ip = getRequestIP({ xForwardedFor: true }) ?? 'unknown'
      rateLimitOrThrow('login-ip', ip, 20, 10 * 60 * 1000)
      rateLimitOrThrow('login-account', `${ip}:${email}`, 8, 10 * 60 * 1000)

      const row = db
        .prepare('SELECT id, workspace_id, email, name, role, password_hash, disabled_at FROM users WHERE email = ?')
        .get(email) as
        | {
            id: string
            workspace_id: string
            email: string
            name: string
            role: 'owner' | 'member'
            password_hash: string
            disabled_at: string | null
          }
        | undefined

      const valid = verifyPassword(data.password, row?.password_hash ?? dummyHash)
      if (!row || !valid || row.disabled_at) {
        logger.warn('sign-in rejected', { reason: 'invalid_credentials' })
        return { ok: false, message: 'Email or password is incorrect.' }
      }

      revokeCurrentSession()
      const session = createSession(row.id)
      attachSessionCookie(session.token)
      db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(nowIso(), row.id)
      logger.info('sign-in succeeded', { userId: row.id, workspaceId: row.workspace_id })
      throw redirect({ href: safeNext(data.next) })
    } catch (error) {
      if (error instanceof Response) throw error
      if (error && typeof error === 'object' && 'to' in error) throw error
      return actionError(error, 'login')
    }
  })

export const logoutFn = createServerFn({ method: 'POST' }).handler(async () => {
  revokeCurrentSession()
  throw redirect({ to: '/login' })
})

export const requireUserFn = createServerFn({ method: 'GET' }).handler(async () => {
  setResponseHeader('Cache-Control', 'private, no-store')
  return requireSessionUser()
})

export const sessionContextFn = createServerFn({ method: 'GET' }).handler(async () => {
  const user = getSessionUser()
  return {
    user,
    isOwner: user?.role === 'owner',
  }
})
