export const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/\/$/, '')

/**
 * The victim is vulnerable by default so the proxy demo has something to
 * block. Set VICTIM_VULNERABLE=false to compare against the hardened build.
 */
export const VULNERABLE = process.env.VICTIM_VULNERABLE !== 'false'

export function appUrl(path: string): string {
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${BASE_PATH}${suffix}`
}

export function cookiePath(): string {
  return BASE_PATH || '/'
}

export function isHttps(request: Request): boolean {
  const forwarded = request.headers.get('x-forwarded-proto')
  if (forwarded) return forwarded.split(',')[0].trim() === 'https'
  return new URL(request.url).protocol === 'https:'
}
