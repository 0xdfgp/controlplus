import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Where the API lives.
 *
 * On a real device, localhost is the device itself, so the host running Metro is
 * used instead. Set EXPO_PUBLIC_API_URL to override.
 */
export function apiBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (configured !== undefined && configured.length > 0) {
    return configured;
  }

  const port = 3000;

  if (Platform.OS === 'android') {
    return `http://10.0.2.2:${port}`;
  }

  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return host === undefined
    ? `http://localhost:${port}`
    : `http://${host}:${port}`;
}
