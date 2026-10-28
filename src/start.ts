import { randomUUID } from 'node:crypto'

import { createCsrfMiddleware, createMiddleware, createStart } from '@tanstack/react-start'

import { errorDetails, logger, runWithCorrelationId } from './server/log'

const requestLogger = createMiddleware().server(async ({ request, next, handlerType }) => {
  const supplied = request.headers.get('x-request-id')
  const correlationId =
    supplied && /^[a-zA-Z0-9_-]{8,100}$/.test(supplied) ? supplied : randomUUID()
  return runWithCorrelationId(correlationId, async () => {
    const started = performance.now()
    const path = new URL(request.url).pathname
    try {
      const result = await next()
      result.response.headers.set('x-request-id', correlationId)
      result.response.headers.set('x-content-type-options', 'nosniff')
      result.response.headers.set('x-frame-options', 'DENY')
      if (!result.response.headers.has('referrer-policy')) {
        result.response.headers.set('referrer-policy', 'strict-origin-when-cross-origin')
      }
      result.response.headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()')
      if (handlerType === 'serverFn' || path.startsWith('/app') || path === '/login') {
        result.response.headers.set('cache-control', 'private, no-store')
      }
      logger.info('request completed', {
        method: request.method,
        path,
        status: result.response.status,
        durationMs: Math.round(performance.now() - started),
        handlerType,
      })
      return result
    } catch (error) {
      logger.error('request failed', {
        method: request.method,
        path,
        durationMs: Math.round(performance.now() - started),
        handlerType,
        ...errorDetails(error),
      })
      throw error
    }
  })
})

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
})

export const startInstance = createStart(() => ({
  requestMiddleware: [requestLogger, csrfMiddleware],
}))
