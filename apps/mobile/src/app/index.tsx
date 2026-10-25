import { Redirect } from 'expo-router';

import { useApp } from '../lib/app-context';
import { Screen, StateView } from '../components/ui';

/**
 * Entry gate.
 *
 * Waits for the stored session to be read before routing, so a returning user is
 * not bounced to the sign-in screen for a frame. A merchant lands on the store
 * dashboard and a customer on the marketplace, which is the only place the two
 * roles diverge at the top level.
 */
export default function Index() {
  const { ready, account } = useApp();

  if (!ready) {
    return (
      <Screen scroll={false}>
        <StateView kind="loading" />
      </Screen>
    );
  }
  if (!account) return <Redirect href="/onboarding" />;
  return <Redirect href={account.role === 'merchant' ? '/merchant/dashboard' : '/(tabs)/home'} />;
}
