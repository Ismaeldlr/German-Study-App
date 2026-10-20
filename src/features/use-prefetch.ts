import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { waitingGrades } from '@/data/repos/grading';
import { runPrefetch } from '@/jobs/prefetch';

import { useServices } from './services';
import { useOnline } from './use-online';

let toppedUpThisLaunch = false;

/**
 * Top up the exercise cache once per app launch, as soon as the phone is
 * online. Translations waiting to be graded also get another try whenever
 * the phone comes back online or the app comes back to the front.
 */
export function usePrefetchOnOpen(): void {
  const services = useServices();
  const online = useOnline();
  useEffect(() => {
    if (!online || toppedUpThisLaunch) return;
    toppedUpThisLaunch = true;
    void runPrefetch(services);
  }, [online, services]);

  const wasOnline = useRef(online);
  useEffect(() => {
    const cameOnline = online && !wasOnline.current;
    wasOnline.current = online;
    if (cameOnline && waitingGrades(services.db).length) void runPrefetch(services);
  }, [online, services]);

  const latest = useRef({ online, services });
  useEffect(() => {
    latest.current = { online, services };
  });
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      const { online: isOnline, services: current } = latest.current;
      if (state === 'active' && isOnline && waitingGrades(current.db).length) {
        void runPrefetch(current);
      }
    });
    return () => subscription.remove();
  }, []);
}
