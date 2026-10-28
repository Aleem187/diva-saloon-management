import { useEffect, useState } from "react";

/** How long typing must pause before a search reacts to it. */
export const SEARCH_DEBOUNCE_MS = 300;

/**
 * `value`, but only once it has stopped changing for `delay` ms. The input stays
 * bound to the live value so typing never lags; only the work that follows it
 * (filtering, navigating) reads the debounced one.
 */
export function useDebouncedValue<T>(value: T, delay: number = SEARCH_DEBOUNCE_MS): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
