import { Redirect } from 'expo-router';

import { useApp } from '../lib/app-context';
import { Screen, StateView } from '../components/ui';

/**
 * Entry point.
 *
 * Waits for the session restore to settle, then sends the user to the dashboard
 * or the sign-in screen. Rendering a spinner in between avoids flashing the
 * login form at an already-authenticated user.
 */
export default function Index() {
  const { ready, user } = useApp();
  if (!ready) {
    return (
      <Screen scroll={false}>
        <StateView kind="loading" />
      </Screen>
    );
  }
  return <Redirect href={user ? '/(app)' : '/(auth)/login'} />;
}
