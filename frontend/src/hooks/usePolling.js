import { useEffect, useRef } from 'react';

/** Calls `fn` every `interval` ms while `active` is true (e.g. while documents are processing). */
export function usePolling(fn, interval, active) {
  const saved = useRef(fn);
  useEffect(() => {
    saved.current = fn;
  }, [fn]);
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => saved.current(), interval);
    return () => clearInterval(id);
  }, [interval, active]);
}
