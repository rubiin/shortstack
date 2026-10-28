import { createServerFn } from '@tanstack/react-start'
import { getRequestIP, setResponseHeader } from '@tanstack/react-start/server'
import { z } from 'zod'

import { requireSessionUser } from '../auth'
import {
  anonymousAuthor,
  checkSlugAvailability,
  createLink,
  getLinkDetail,
  listCampaigns,
  listDomains,
  listLinks,
  setArchived,
  updateLink,
} from '../links'
import { rateLimitOrThrow } from '../rate-limit'
import { actionError, ok, fail, type ActionResult } from './result'

const listSchema = z.object({
  search: z.string().max(200).optional().default(''),
  campaignId: z.string().max(100).optional().default(''),
  state: z.enum(['active', 'disabled', 'expired', 'archived', 'all']).optional().default('active'),
  page: z.coerce.number().int().min(1).max(10_000).optional().default(1),
})

const linkInputSchema = z.object({
  domainId: z.string().min(1).max(100),
  slug: z.string().max(100).optional().default(''),
  generateSlug: z.boolean().optional().default(false),
  destinationUrl: z.string().min(1).max(3_000),
  campaignId: z.string().max(100).nullable().optional(),
  note: z.string().max(1_000).optional().default(''),
  expiresAt: z.string().max(50).optional().default(''),
  enabled: z.boolean().optional().default(true),
  expectedUpdatedAt: z.string().max(50).optional(),
})

const slugCheckSchema = z.object({
  domainId: z.string().min(1).max(100),
  slug: z.string().min(1).max(100),
})

const idSchema = z.object({ linkId: z.string().min(3).max(100) })

function requestFingerprint(scope: string): string {
  return `${scope}:${getRequestIP({ xForwardedFor: true }) ?? 'local'}`
}

export const listLinksFn = createServerFn({ method: 'GET' })
  .validator((input: unknown) => listSchema.parse(input))
  .handler(async ({ data }) => {
    setResponseHeader('Cache-Control', 'private, no-store')
    const user = requireSessionUser()
    return listLinks({ workspaceId: user.workspaceId, ...data })
  })

export const getLinkFn = createServerFn({ method: 'GET' })
  .validator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data }) => {
    setResponseHeader('Cache-Control', 'private, no-store')
    const user = requireSessionUser()
    return getLinkDetail({ workspaceId: user.workspaceId, linkId: data.linkId, role: user.role })
  })

export const getEditorDataFn = createServerFn({ method: 'GET' })
  .validator((input: unknown) => z.object({ linkId: z.string().max(100).optional() }).parse(input))
  .handler(async ({ data }) => {
    setResponseHeader('Cache-Control', 'private, no-store')
    const user = requireSessionUser()
    return {
      domains: listDomains(user.workspaceId),
      campaigns: listCampaigns(user.workspaceId),
      link: data.linkId
        ? getLinkDetail({ workspaceId: user.workspaceId, linkId: data.linkId, role: user.role })
        : null,
    }
  })

export const createAnonymousLinkFn = createServerFn({ method: 'POST' })
  .validator((input: unknown) =>
    z.object({ destinationUrl: z.string().min(1).max(3_000) }).parse(input),
  )
  .handler(async ({ data }): Promise<ActionResult<{ shortUrl: string }>> => {
    try {
      const ip = requestFingerprint('anon-link-create')
      rateLimitOrThrow('anon-link-create-ip', ip, 20, 60 * 60 * 1000)
      const user = anonymousAuthor('dom_primary')
      const link = createLink({
        user,
        domainId: 'dom_primary',
        slug: '',
        generateSlug: true,
        destinationUrl: data.destinationUrl,
        campaignId: null,
        note: 'Created from public homepage',
        expiresAtLocal: '',
        enabled: true,
      })
      return ok({ shortUrl: link.shortUrl })
    } catch (error) {
      return actionError(error, 'createAnonymousLink')
    }
  })

export const createLinkFn = createServerFn({ method: 'POST' })
  .validator((input: unknown) => linkInputSchema.parse(input))
  .handler(async ({ data }): Promise<ActionResult<{ linkId: string }>> => {
    try {
      const user = requireSessionUser()
      rateLimitOrThrow('link-create-user', user.id, 40, 60 * 60 * 1000)
      rateLimitOrThrow('link-create-ip', requestFingerprint('link-create'), 80, 60 * 60 * 1000)
      const link = createLink({
        user,
        domainId: data.domainId,
        slug: data.slug,
        generateSlug: data.generateSlug || !data.slug,
        destinationUrl: data.destinationUrl,
        campaignId: data.campaignId || null,
        note: data.note,
        expiresAtLocal: data.expiresAt,
        enabled: data.enabled,
      })
      return ok({ linkId: link.id })
    } catch (error) {
      return actionError(error, 'createLink')
    }
  })

export const updateLinkFn = createServerFn({ method: 'POST' })
  .validator((input: unknown) =>
    linkInputSchema.extend({ linkId: z.string().min(3).max(100) }).parse(input),
  )
  .handler(async ({ data }): Promise<ActionResult<{ linkId: string }>> => {
    try {
      const user = requireSessionUser()
      rateLimitOrThrow('link-update-user', user.id, 80, 60 * 60 * 1000)
      const link = updateLink({
        user,
        linkId: data.linkId,
        domainId: data.domainId,
        slug: data.slug,
        destinationUrl: data.destinationUrl,
        campaignId: data.campaignId || null,
        note: data.note,
        expiresAtLocal: data.expiresAt,
        enabled: data.enabled,
        expectedUpdatedAt: data.expectedUpdatedAt,
      })
      return ok({ linkId: link.id })
    } catch (error) {
      return actionError(error, 'updateLink')
    }
  })

export const setArchivedFn = createServerFn({ method: 'POST' })
  .validator((input: unknown) =>
    z.object({ linkId: z.string().min(3).max(100), archived: z.boolean() }).parse(input),
  )
  .handler(async ({ data }): Promise<ActionResult<{ archived: boolean }>> => {
    try {
      const user = requireSessionUser()
      setArchived({ user, linkId: data.linkId, archived: data.archived })
      return ok({ archived: data.archived })
    } catch (error) {
      return actionError(error, 'setArchived')
    }
  })

export const checkSlugFn = createServerFn({ method: 'GET' })
  .validator((input: unknown) => slugCheckSchema.parse(input))
  .handler(async ({ data }) => {
    const user = requireSessionUser()
    rateLimitOrThrow('slug-check-user', user.id, 180, 60 * 1000)
    return checkSlugAvailability({ workspaceId: user.workspaceId, ...data })
  })

export const getDomainPublicInfoFn = createServerFn({ method: 'GET' })
  .validator((input: unknown) => z.object({ domainId: z.string().max(100) }).parse(input))
  .handler(async ({ data }) => {
    const user = requireSessionUser()
    const domain = listDomains(user.workspaceId).find((item) => item.id === data.domainId)
    if (!domain) return fail('Domain not found.')
    return ok({ origin: domain.origin, hostname: domain.hostname })
  })
