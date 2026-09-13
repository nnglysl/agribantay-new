import { useState, useEffect, useRef } from 'react'
import api from '../api/axios'

const cache = new Map()

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

export function useCachedFetch(url, params = {}) {
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

    api.get(url, { params: paramsRef.current })
      .then(res => {
        if (cancelled) return
        cache.set(cacheKey, res.data.data)
        setData(res.data.data)
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
