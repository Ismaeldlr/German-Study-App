import { useEffect } from 'react';

import { runPrefetch } from '@/jobs/prefetch';

import { useServices } from './services';
import { useOnline } from './use-online';

let toppedUpThisLaunch = false;

/** Top up the exercise cache once per app launch, as soon as the phone is online. */
export function usePrefetchOnOpen(): void {
  const services = useServices();
  const online = useOnline();
  useEffect(() => {
    if (!online || toppedUpThisLaunch) return;
    toppedUpThisLaunch = true;
    void runPrefetch(services);
  }, [online, services]);
}
