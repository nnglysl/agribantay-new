import { useCallback, useEffect, useState } from 'react'
import api from '../api/axios'
import { BACKGROUND_POLL_MS } from '../constants/polling'

// Shared existing HouseMonitoring resource: identity-scoped, abortable reads;
// a failed refresh clears current data instead of retaining stale measurements.
export function useMonitoringResource(url, params, farmId) {
  const key = url + JSON.stringify(params)
  const [state, setState] = useState(null)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!url) return
    let active = true, controller, timer
    const read = async () => {
      controller?.abort(); controller = new AbortController()
      const request = controller
      try {
        const response = await api.get(url, { params: JSON.parse(key.slice(url.length)), signal: request.signal })
        if (!active || request.signal.aborted) return
        if (String(response.data?.data?.farm_id) !== String(farmId)) throw Error('Monitoring response did not match the selected farm.')
        setState({ key, data: response.data.data })
      } catch (failure) {
        if (active && !request.signal.aborted) setState({ key, error: failure.response?.data?.message || failure.message || 'Monitoring could not be loaded.' })
      }
    }
    Promise.resolve().then(() => { if (active) read() })
    timer = setInterval(() => { if (!document.hidden) read() }, BACKGROUND_POLL_MS)
    return () => { active = false; controller?.abort(); clearInterval(timer) }
  }, [url, key, farmId, revision])
  const refresh = useCallback(() => setRevision(value => value + 1), [])
  return { data: state?.key === key ? state.data : null, error: state?.key === key ? state.error : '', loading: !!url && state?.key !== key, refresh }
}
