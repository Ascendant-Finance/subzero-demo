'use client';

import { Dashboard } from '@/components/dashboard';
import { Spinner } from '@/components/ui/spinner';
import { useSessionGate } from './providers';

export default function HomePage() {
  const status = useSessionGate();
  if (status !== 'ready') return <Spinner label="Checking your session" />;
  return <Dashboard />;
}
