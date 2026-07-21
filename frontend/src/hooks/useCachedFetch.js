import { useState, useEffect, useRef } from 'react'
import api from '../api/axios'

const cache = new Map()

export function useCachedFetch(url, params = {}) {
  // url can now be falsy (null/undefined/'') to mean "don't fetch at all" —
  // e.g. a component conditionally fetching a second resource only for
  // certain roles. Every existing caller passes a real url string, so
  // this doesn't change behavior for anything already using this hook.
  const cacheKey = url ? url + JSON.stringify(params) : null
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