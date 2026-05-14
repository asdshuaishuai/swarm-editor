import { useEffect } from 'react'

export function useWindowEvent(
  event: string,
  handler: (ev: Event) => any,
  deps: React.DependencyList = [],
  options?: AddEventListenerOptions,
) {
  useEffect(() => {
    window.addEventListener(event, handler, options)
    return () => window.removeEventListener(event, handler, options)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
