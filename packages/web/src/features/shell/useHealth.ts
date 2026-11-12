import type { Health } from '@statecraft/protocol';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export type ServerStatus =
  | { state: 'checking' }
  | { state: 'connected'; health: Health }
  | { state: 'offline'; message: string };

/** Asks the server how it is, on load and every few seconds after. */
export function useHealth(refreshKey: number): ServerStatus {
  const [status, setStatus] = useState<ServerStatus>({ state: 'checking' });
  useEffect(() => {
    let cancelled = false;
    const check = () =>
      api.health().then(
        (health) => !cancelled && setStatus({ state: 'connected', health }),
        (error: unknown) =>
          !cancelled &&
          setStatus({
            state: 'offline',
            message: error instanceof Error ? error.message : 'Server unreachable.',
          }),
      );
    void check();
    const timer = setInterval(check, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [refreshKey]);
  return status;
}
