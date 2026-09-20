import { useState, useEffect } from 'react'

// The fixed 250px sidebar plus page padding leaves too little room for the
// data tables below this width, so the whole dashboard chrome switches to the
// off-canvas drawer here — that covers tablets in portrait and split-screen
// laptop windows, not just phones. Pages keep the 768px default for their own
// internal stacking.
export const LAYOUT_BREAKPOINT = 1024

export function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth <= breakpoint : false
  )

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth <= breakpoint)
    }

    window.addEventListener('resize', handleResize)
    handleResize()

    return () => window.removeEventListener('resize', handleResize)
  }, [breakpoint])

  return isMobile
}