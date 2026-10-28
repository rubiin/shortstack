import { createServerFn } from '@tanstack/react-start'
import { getRequestIP, setResponseHeader } from '@tanstack/react-start/server'
import { z } from 'zod'

import type { ImportBatchView } from '~/domain/types'

import { requireSessionUser } from '../auth'
import {
  applySuggestedSlugs,
  commitImport,
  createImportBatch,
  getImportBatch,
  previewImport,
  setImportRowExcluded,
  updateImportRow,
} from '../imports'
import { rateLimitOrThrow } from '../rate-limit'
import { actionError, ok, type ActionResult } from './result'

const batchIdSchema = z.object({ batchId: z.string().min(3).max(100) })

const mappingSchema = z.record(z.string().max(40), z.union([z.string().max(200), z.null()]))

export const createImportFn = createServerFn({ method: 'POST' })
  .validator((input: unknown) =>
    z
      .object({ csv: z.string().min(1).max(1_000_000), filename: z.string().max(200).optional() })
      .parse(input),
  )
  .handler(async ({ data }): Promise<ActionResult<{ batchId: string }>> => {
    try {
      const user = requireSessionUser()
      rateLimitOrThrow('import-create-user', user.id, 12, 60 * 60 * 1000)
      rateLimitOrThrow(
        'import-create-ip',
        getRequestIP({ xForwardedFor: true }) ?? 'local',
        30,
        60 * 60 * 1000,
      )
      const batch = createImportBatch({ user, csv: data.csv, filename: data.filename })
      return ok(batch)
    } catch (error) {
      return actionError(error, 'createImport')
    }
  })

export const getImportFn = createServerFn({ method: 'GET' })
  .validator((input: unknown) => batchIdSchema.parse(input))
  .handler(async ({ data }) => {
    setResponseHeader('Cache-Control', 'private, no-store')
    const user = requireSessionUser()
    return getImportBatch(user.workspaceId, data.batchId)
  })

export const previewImportFn = createServerFn({ method: 'POST' })
  .validator((input: unknown) =>
    batchIdSchema
      .extend({ mapping: mappingSchema, domainId: z.string().max(100).optional() })
      .parse(input),
  )
  .handler(async ({ data }): Promise<ActionResult<ImportBatchView>> => {
    try {
      const user = requireSessionUser()
      const batch = previewImport({
        user,
        batchId: data.batchId,
        mapping: data.mapping as Record<string, string | null>,
        domainId: data.domainId,
      })
      return ok(batch)
    } catch (error) {
      return actionError(error, 'previewImport')
    }
  })

export const updateImportRowFn = createServerFn({ method: 'POST' })
  .validator((input: unknown) =>
    batchIdSchema
      .extend({
        rowId: z.string().min(3).max(100),
        values: z.object({
          slug: z.string().max(100).optional(),
          destinationUrl: z.string().max(3_000).optional(),
          campaignName: z.string().max(200).optional(),
          note: z.string().max(1_000).optional(),
          expiresAt: z.string().max(50).optional(),
          enabled: z.boolean().optional(),
        }),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<ActionResult<ImportBatchView>> => {
    try {
      const user = requireSessionUser()
      const batch = updateImportRow({
        user,
        batchId: data.batchId,
        rowId: data.rowId,
        values: data.values,
      })
      return ok(batch)
    } catch (error) {
      return actionError(error, 'updateImportRow')
    }
  })

export const setImportRowExcludedFn = createServerFn({ method: 'POST' })
  .validator((input: unknown) =>
    batchIdSchema.extend({ rowId: z.string().min(3).max(100), excluded: z.boolean() }).parse(input),
  )
  .handler(async ({ data }): Promise<ActionResult<ImportBatchView>> => {
    try {
      const user = requireSessionUser()
      return ok(
        setImportRowExcluded({
          user,
          batchId: data.batchId,
          rowId: data.rowId,
          excluded: data.excluded,
        }),
      )
    } catch (error) {
      return actionError(error, 'setImportRowExcluded')
    }
  })

export const applySuggestedSlugsFn = createServerFn({ method: 'POST' })
  .validator((input: unknown) => batchIdSchema.parse(input))
  .handler(async ({ data }): Promise<ActionResult<ImportBatchView>> => {
    try {
      const user = requireSessionUser()
      return ok(applySuggestedSlugs({ user, batchId: data.batchId }))
    } catch (error) {
      return actionError(error, 'applySuggestedSlugs')
    }
  })

export const commitImportFn = createServerFn({ method: 'POST' })
  .validator((input: unknown) =>
    batchIdSchema.extend({ commitToken: z.string().min(10).max(200) }).parse(input),
  )
  .handler(
    async ({
      data,
    }): Promise<ActionResult<{ links: Array<{ id: string; slug: string; shortUrl: string }> }>> => {
      try {
        const user = requireSessionUser()
        rateLimitOrThrow('import-commit-user', user.id, 20, 60 * 60 * 1000)
        const result = commitImport({ user, batchId: data.batchId, commitToken: data.commitToken })
        return ok({ links: result.links })
      } catch (error) {
        return actionError(error, 'commitImport')
      }
    },
  )
