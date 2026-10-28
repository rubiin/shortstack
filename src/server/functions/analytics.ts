import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { z } from 'zod'
import { requireSessionUser } from '../auth'
import { rateLimitOrThrow } from '../rate-limit'
import { analyticsFor, createAnalyticsExport, getExportStatus } from '../analytics'
import { actionError, ok, type ActionResult } from './result'

const analyticsSchema = z.object({
  from: z.string().max(10).optional(),
  to: z.string().max(10).optional(),
  days: z.coerce.number().int().min(1).max(366).optional(),
  compare: z.boolean().optional().default(true),
  campaignId: z.string().max(100).nullable().optional(),
})

export const getAnalyticsFn = createServerFn({ method: 'GET' })
  .validator((input: unknown) => analyticsSchema.parse(input))
  .handler(async ({ data }) => {
    setResponseHeader('Cache-Control', 'private, no-store')
    const user = requireSessionUser()
    return analyticsFor({
      workspaceId: user.workspaceId,
      from: data.from,
      to: data.to,
      days: data.days,
      compare: data.compare,
      campaignId: data.campaignId,
    })
  })

export const createExportFn = createServerFn({ method: 'POST' })
  .validator((input: unknown) =>
    z
      .object({
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        campaignId: z.string().max(100).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<ActionResult<{ exportId: string }>> => {
    try {
      const user = requireSessionUser()
      rateLimitOrThrow('export-user', user.id, 10, 60 * 60 * 1000)
      const result = createAnalyticsExport({
        workspaceId: user.workspaceId,
        userId: user.id,
        from: data.from,
        to: data.to,
        campaignId: data.campaignId || null,
      })
      return ok({ exportId: result.id })
    } catch (error) {
      return actionError(error, 'createExport')
    }
  })

export const getExportStatusFn = createServerFn({ method: 'GET' })
  .validator((input: unknown) => z.object({ exportId: z.string().min(3).max(100) }).parse(input))
  .handler(async ({ data }) => {
    setResponseHeader('Cache-Control', 'private, no-store')
    const user = requireSessionUser()
    return getExportStatus({ workspaceId: user.workspaceId, exportId: data.exportId })
  })
