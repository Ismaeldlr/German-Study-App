import { useNetInfo } from '@react-native-community/netinfo';

/** False only when we know the phone is offline; unknown counts as online. */
export function useOnline(): boolean {
  const info = useNetInfo();
  return info.isConnected !== false && info.isInternetReachable !== false;
}
