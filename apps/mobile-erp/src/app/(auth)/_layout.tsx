import { Redirect, Stack } from 'expo-router';

import { useApp } from '../../lib/app-context';

/**
 * The unauthenticated shell.
 *
 * A signed-in user who lands here is sent to the app, so the back gesture cannot
 * return to the login form after a successful sign-in.
 */
export default function AuthLayout() {
  const { ready, user } = useApp();
  if (ready && user) return <Redirect href="/(app)" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
