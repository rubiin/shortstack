import { ZodError } from 'zod'

import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from '~/domain/authz'

import { logger } from '../log'

export type ActionFailure = {
  ok: false
  message: string
  fields?: Record<string, string>
  retryAfter?: number
}

export type ActionResult<T = undefined> = { ok: true; data: T } | ActionFailure

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data }
}

export function fail(message: string, fields?: Record<string, string>): ActionFailure {
  return { ok: false, message, ...(fields ? { fields } : {}) }
}

export function fieldErrors(error: ZodError): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form'
    if (!fields[key]) fields[key] = issue.message
  }
  return fields
}

export function actionError(error: unknown, context: string): ActionFailure {
  if (error instanceof ZodError) {
    return fail('Check the highlighted fields.', fieldErrors(error))
  }
  if (error instanceof ValidationError) {
    return fail(error.message, error.fields)
  }
  if (error instanceof ConflictError) {
    return fail(error.message)
  }
  if (error instanceof RateLimitError) {
    return { ...fail(error.message), retryAfter: error.retryAfterSeconds }
  }
  if (error instanceof AuthorizationError) {
    return fail(error.message)
  }
  if (error instanceof NotFoundError) {
    return fail(error.message)
  }
  logger.error('unexpected action failure', {
    context,
    ...(error instanceof Error
      ? { errorName: error.name, message: error.message }
      : { error: String(error) }),
  })
  return fail('Something went wrong on our side. Nothing was changed. Please try again.')
}
