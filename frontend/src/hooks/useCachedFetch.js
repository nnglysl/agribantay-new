import { useState, useEffect, useRef } from 'react'
import api from '../api/axios'

const cache = new Map()

export function useCachedFetch(url, params = {}) {
  const cacheKey = url + JSON.stringify(params)
  const hasCached = cache.has(cacheKey)

  const [data, setData] = useState(hasCached ? cache.get(cacheKey) : null)
  const [loading, setLoading] = useState(!hasCached)
  const [error, setError] = useState('')
  const paramsRef = useRef(params)
  paramsRef.current = params

  useEffect(() => {
    let cancelled = false

    api.get(url, { params: paramsRef.current })
      .then(res => {
        if (cancelled) return
        cache.set(cacheKey, res.data.data)
        setData(res.data.data)
        setError('')
      })
      .catch(err => {
        if (cancelled) return
        setError(err.response?.data?.message || 'Failed to load data.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [cacheKey])

  const refetch = () => {
    cache.delete(cacheKey)
    setLoading(true)
  }

  return { data, loading, error, refetch }
}