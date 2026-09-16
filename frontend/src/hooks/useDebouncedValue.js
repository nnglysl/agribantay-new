import { useEffect, useState } from 'react'

// Returns `value` after it has stopped changing for `delay` ms. Used for
// search boxes whose text is sent to the server, so typing "Santos" costs
// one request instead of six. The input itself stays fully controlled and
// instant — only the value handed to the fetch is delayed.
export function useDebouncedValue(value, delay = 350) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])

  return debounced
}
