export const CHAT_ONLY_ROUTE_SEGMENTS = ['chat', 'ask', 'qa'] as const

export const readPathSegments = (pathname = window.location.pathname) =>
  pathname
    .split('/')
    .map((segment) => decodeURIComponent(segment).trim())
    .filter(Boolean)

export const splitListParam = (value: string | null) =>
  (value ?? '')
    .split(/[|,\n]/)
    .map((item) => item.trim())
    .filter(Boolean)

export const readBooleanParam = (value: string | null, defaultValue: boolean) => {
  if (value == null || value.trim() === '') {
    return defaultValue
  }

  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false
  }
  return defaultValue
}

export const readFirstParam = (searchParams: URLSearchParams, ...keys: string[]) => {
  for (const key of keys) {
    const value = searchParams.get(key)?.trim()
    if (value) {
      return value
    }
  }
  return ''
}

export const readKnowledgeBaseIdFromNamedPath = (
  routeSegments: readonly string[],
  pathname = window.location.pathname,
) => {
  const pathSegments = readPathSegments(pathname)
  const normalizedRouteSegments = routeSegments.map((segment) => segment.toLowerCase())
  const routeIndex = pathSegments.findIndex((segment) => normalizedRouteSegments.includes(segment.toLowerCase()))

  if (routeIndex < 0) {
    return ''
  }

  return pathSegments[routeIndex + 1]?.trim() ?? ''
}
