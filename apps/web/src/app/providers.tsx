'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api-client';
import { restoreSession } from '@/lib/api-client';
import { getAccessToken, subscribeToSession } from '@/lib/auth-store';
import { DEMO_MODE } from '@/lib/config';

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: (failureCount, error) =>
              !(error instanceof ApiError) && failureCount < 2,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/**
 * Restores the session from the refresh cookie on a cold load, then sends an
 * unauthenticated visitor to the login screen.
 */
export function useSessionGate() {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'ready' | 'anonymous'>(() =>
    getAccessToken() ? 'ready' : 'loading',
  );

  useEffect(() => {
    const unsubscribe = subscribeToSession(() =>
      setStatus(getAccessToken() ? 'ready' : 'anonymous'),
    );
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (getAccessToken()) {
      setStatus('ready');
      return;
    }
    void restoreSession().then((ok) => {
      if (cancelled) return;
      if (ok) {
        setStatus('ready');
      } else {
        setStatus('anonymous');
        router.replace(DEMO_MODE ? '/start' : '/login');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  return status;
}
