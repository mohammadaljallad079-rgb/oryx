import { Redirect } from 'expo-router';

import { useApp } from '../lib/app-context';
import { Screen, StateView } from '../components/ui';

/**
 * Entry gate.
 *
 * Waits for the session restore to finish before routing, so a returning customer
 * is not bounced to the sign-in screen for a frame while the keychain is read.
 */
export default function Index() {
  const { ready, profile } = useApp();

  if (!ready) return <Screen scroll={false}><StateView kind="loading" /></Screen>;
  return <Redirect href={profile ? '/(app)' : '/(auth)/login'} />;
}
