import { useEffect, useState } from 'react'
import { useCachedFetch } from './useCachedFetch'

// Associate each response with its exact table view. An earlier page/filter
// response must never supply rows or totals while the next view is loading.
export function useTableFetch(url, filters, page, pageSize, setPage, options = {}) {
  const signature = JSON.stringify([url, filters, pageSize])
  const [previous, setPrevious] = useState(signature)
  if (previous !== signature) {
    setPrevious(signature)
    if (page !== 1) setPage(1)
  }
  const queryKey = JSON.stringify([url, filters, page, pageSize])
  const result = useCachedFetch(url, { ...filters, page, per_page: pageSize, query_key: queryKey }, options)
  const data = result.data?.query_key === queryKey ? result.data : null
  useEffect(() => {
    const actual = data?.page ?? data?.current_page
    if (actual && actual !== page) setPage(actual)
  }, [data, page, setPage])
  return { ...result, data, loading: !!url && (result.loading || (!data && !result.error)) }
}
