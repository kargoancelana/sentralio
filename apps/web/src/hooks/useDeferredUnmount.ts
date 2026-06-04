import { useState, useEffect, useRef } from 'react';

/**
 * Defers unmounting a component until an exit animation completes.
 *
 * - visible false → true: immediately set shouldRender=true, let CSS animate entry
 * - visible true → false: keep shouldRender=true for exitMs ms, then set false to remove from DOM (Req 1.2, 1.3)
 * - If visible becomes true again before timer fires: clear timer, keep shouldRender=true
 */
export function useDeferredUnmount(visible: boolean, exitMs: number): boolean {
  const [shouldRender, setShouldRender] = useState(visible);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      // Clear any pending removal timer
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setShouldRender(true);
    } else {
      // Delay removal from DOM
      timerRef.current = setTimeout(() => {
        setShouldRender(false);
        timerRef.current = null;
      }, exitMs);
    }

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, [visible, exitMs]);

  return shouldRender;
}
