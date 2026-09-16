import { useState, useEffect, useRef } from 'react'
import api from '../api/axios'

const cache = new Map()

// In-flight GETs keyed the same way as `cache`, so two components mounting
// with the same url+params at the same time (e.g. the dashboard's map and
// the Farms table both wanting /admin/farms-map) share ONE request instead
// of firing duplicates.
const inflight = new Map()

// Several endpoints (e.g. /admin/service-requests) deliberately return
// different data for the same URL depending on who's asking — Admin vs
// Super Admin, for instance. Folding the active session's role into the
// cache key means a response cached under one identity can never be
// served to another, even if some login/logout path forgets to call
// clearAllCache(). Reads storage directly (not utils/auth.js) to avoid a
// circular import, since auth.js itself calls clearAllCache() below.
function currentRoleKey() {
  try {
    return localStorage.getItem('role') || sessionStorage.getItem('role') || ''
  } catch {
    return ''
  }
}

function fetchShared(cacheKey, url, params) {
  if (inflight.has(cacheKey)) return inflight.get(cacheKey)
  const p = api.get(url, { params })
    .then(res => {
      cache.set(cacheKey, res.data.data)
      return res.data.data
    })
    .finally(() => { inflight.delete(cacheKey) })
  inflight.set(cacheKey, p)
  return p
}

/**
 * useCachedFetch(url, params, options)
 *
 * options.pollMs — when set, silently re-fetches the same url+params every
 * `pollMs` while the tab is visible and updates `data` in place. No loading
 * state is toggled, so tables don't flicker and the caller's own filters /
 * search / sort / pagination state is untouched — only the rows change.
 * Polling pauses while the tab is hidden (document.hidden) and fires once
 * immediately when it becomes visible again. Static pages simply don't
 * pass it.
 */
export function useCachedFetch(url, params = {}, options = {}) {
  const { pollMs = 0 } = options

  // url can now be falsy (null/undefined/'') to mean "don't fetch at all" —
  // e.g. a component conditionally fetching a second resource only for
  // certain roles. Every existing caller passes a real url string, so
  // this doesn't change behavior for anything already using this hook.
  const cacheKey = url ? `${currentRoleKey()}::${url}${JSON.stringify(params)}` : null
  const hasCached = cacheKey ? cache.has(cacheKey) : false

  const [data, setData] = useState(hasCached ? cache.get(cacheKey) : null)
  const [loading, setLoading] = useState(!!url && !hasCached)
  // isRefetching covers background refreshes (polling, manual refetch())
  // when we already have data on screen — separate from `loading`, which
  // is reserved for the true first-load-with-nothing-to-show case. Callers
  // that don't care about the distinction can keep ignoring it.
  const [isRefetching, setIsRefetching] = useState(false)
  const [error, setError] = useState('')
  const [refetchTrigger, setRefetchTrigger] = useState(0)
  const paramsRef = useRef(params)
  paramsRef.current = params
  const hasDataRef = useRef(hasCached)

  useEffect(() => {
    if (!url) {
      setData(null)
      setLoading(false)
      setIsRefetching(false)
      setError('')
      hasDataRef.current = false
      return
    }

    let cancelled = false

    // Skip the cache-check on refetch (trigger > 0) so it always hits the network,
    // even if a cached value still technically exists for this key.
    if (refetchTrigger === 0 && cache.has(cacheKey)) {
      setData(cache.get(cacheKey))
      setLoading(false)
      hasDataRef.current = true
      return
    }

    if (hasDataRef.current) {
      setIsRefetching(true)
    } else {
      setLoading(true)
    }

    fetchShared(cacheKey, url, paramsRef.current)
      .then(result => {
        if (cancelled) return
        setData(result)
        hasDataRef.current = true
        setError('')
      })
      .catch(err => {
        if (cancelled) return
        setError(err.response?.data?.message || 'Failed to load data.')
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
          setIsRefetching(false)
        }
      })

    return () => { cancelled = true }
  }, [cacheKey, refetchTrigger, url])

  // Background polling — see the header comment.
  useEffect(() => {
    if (!url || !pollMs) return undefined

    let cancelled = false
    let timer = null

    const tick = async () => {
      if (cancelled || document.hidden) return
      try {
        const result = await fetchShared(cacheKey, url, paramsRef.current)
        if (!cancelled) {
          setData(result)
          hasDataRef.current = true
          setError('')
        }
      } catch {
        // Keep what's on screen; the next tick retries.
      }
    }

    const start = () => {
      if (timer) clearInterval(timer)
      timer = setInterval(tick, pollMs)
    }
    const onVisibility = () => {
      if (!document.hidden) { tick(); start() }
    }

    start()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [cacheKey, url, pollMs])

  const refetch = () => {
    if (!cacheKey) return
    cache.delete(cacheKey)
    setRefetchTrigger(prev => prev + 1)
  }

  return { data, loading, isRefetching, error, refetch }
}

// Clears every cached entry whose URL starts with `prefix`. Use this after a
// mutation so other already-visited pages/components sharing this module's
// cache (e.g. a list view) don't keep serving stale data — refetch() alone
// only clears the cache key for the hook instance that calls it.
// Keys are stored as `${role}::${url}${params}` (see currentRoleKey above),
// so the role prefix has to be stripped before matching against `prefix`.
export function invalidateCache(prefix) {
  for (const key of cache.keys()) {
    const url = key.includes('::') ? key.slice(key.indexOf('::') + 2) : key
    if (url.startsWith(prefix)) cache.delete(key)
  }
}

// Wipes the entire cache — call this on login/logout. Many endpoints (e.g.
// a farm's Service Requests tab) return role-dependent data from the exact
// same URL, so if one user logs out and a different one logs in within the
// same tab without a full page reload, a stale response cached under the
// previous identity would otherwise keep being served.
export function clearAllCache() {
  cache.clear()
}
