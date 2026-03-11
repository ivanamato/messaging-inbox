import { useEffect, useRef, useCallback, useState } from 'react';

type UseAutoPollingOptions = {
  interval?: number;
  enabled?: boolean;
  onPoll: () => void | Promise<void>;
  /** Whether to fire the first poll immediately on start. Defaults to true. */
  fireImmediately?: boolean;
};

export function useAutoPolling({ interval = 5000, enabled = true, onPoll, fireImmediately = true }: UseAutoPollingOptions) {
  const [isPolling, setIsPolling] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRunningRef = useRef(false);
  const stoppedRef = useRef(false);
  const consecutiveErrorsRef = useRef(0);
  const onPollRef = useRef(onPoll);
  const MAX_BACKOFF_MS = 60000;

  // Always keep the ref current — avoids recreating start/stop callbacks
  onPollRef.current = onPoll;

  const stopPolling = useCallback(() => {
    stoppedRef.current = true;
    if (intervalRef.current) {
      clearTimeout(intervalRef.current);
      intervalRef.current = null;
    }
    setIsPolling(false);
  }, []);

  const startPolling = useCallback(() => {
    if (!enabled) return;

    stoppedRef.current = false;
    setIsPolling(true);
    consecutiveErrorsRef.current = 0;

    const poll = async () => {
      if (isRunningRef.current) return;
      isRunningRef.current = true;
      try {
        await onPollRef.current();
        consecutiveErrorsRef.current = 0;
      } catch (error) {
        consecutiveErrorsRef.current++;
        if (process.env.NODE_ENV !== 'production') {
          console.error('Polling error:', error instanceof Error ? error.message : String(error));
        }
      } finally {
        isRunningRef.current = false;
      }
    };

    const scheduleNext = () => {
      if (stoppedRef.current) return;
      const backoff = Math.min(
        interval * Math.pow(2, consecutiveErrorsRef.current),
        MAX_BACKOFF_MS,
      );
      intervalRef.current = setTimeout(async () => {
        await poll();
        if (!stoppedRef.current && intervalRef.current !== null) {
          scheduleNext();
        }
      }, backoff);
    };

    if (fireImmediately) {
      poll().then(() => {
        if (!stoppedRef.current) scheduleNext();
      });
    } else {
      scheduleNext();
    }
  }, [interval, enabled, fireImmediately]);

  // Handle visibility change (pause when tab is hidden)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setIsPaused(true);
        stopPolling();
      } else {
        setIsPaused(false);
        if (enabled) {
          startPolling();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, startPolling, stopPolling]);

  // Start/stop polling based on enabled flag
  useEffect(() => {
    if (enabled && !document.hidden) {
      startPolling();
    } else {
      stopPolling();
    }

    return () => {
      stopPolling();
    };
  }, [enabled, startPolling, stopPolling]);

  return {
    isPolling,
    isPaused
  };
}
