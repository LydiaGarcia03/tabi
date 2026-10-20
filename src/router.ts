// Tiny hash router: URLs look like /tabi/#/trip/<id>. Hash URLs work on
// GitHub Pages (no server rewrites) and offline.

import { useSyncExternalStore } from 'react'

export type Route =
  | { page: 'trips' }
  | { page: 'trip'; tripId: string }
  | { page: 'day'; tripId: string; dayId: string }
  | { page: 'settings' }
  | { page: 'transit-spike' }

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent)
  if (parts[0] === 'trip' && parts[1]) {
    if (parts[2] === 'day' && parts[3]) return { page: 'day', tripId: parts[1], dayId: parts[3] }
    return { page: 'trip', tripId: parts[1] }
  }
  if (parts[0] === 'settings') return { page: 'settings' }
  if (parts[0] === 'dev' && parts[1] === 'transit') return { page: 'transit-spike' }
  return { page: 'trips' }
}

export function href(route: Route): string {
  switch (route.page) {
    case 'trips':
      return '#/'
    case 'trip':
      return `#/trip/${encodeURIComponent(route.tripId)}`
    case 'day':
      return `#/trip/${encodeURIComponent(route.tripId)}/day/${encodeURIComponent(route.dayId)}`
    case 'settings':
      return '#/settings'
    case 'transit-spike':
      return '#/dev/transit'
  }
}

export function navigate(route: Route): void {
  window.location.hash = href(route)
}

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash)
  return parseRoute(hash)
}
