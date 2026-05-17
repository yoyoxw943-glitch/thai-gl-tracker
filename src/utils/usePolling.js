import { useEffect, useRef } from 'react'

export function usePolling(callback, intervalMs = 300000) {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    const intervalId = setInterval(() => {
      if (document.visibilityState === 'visible') {
        callbackRef.current()
      }
    }, intervalMs)

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        callbackRef.current()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [intervalMs])
}
