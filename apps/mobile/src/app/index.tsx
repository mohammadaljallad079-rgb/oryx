import React, { useEffect } from 'react';
import { Redirect } from 'expo-router';

import { useApp } from '../lib/app-context';
import { LaunchScreen } from '../components/launch';

/**
 * Entry gate.
 *
 * The owner's approved sequence is exactly three steps and nothing else:
 *
 *     APP LAUNCH  ->  APPROVED SPLASH  ->  HOMEPAGE
 *
 * There is deliberately no onboarding carousel, welcome page or second branding
 * screen in this path. A returning user already has a stored session and goes
 * straight to their shell; a first-time user is signed in as the demo customer so
 * the marketplace opens, which is what this demo build is for.
 *
 * `LaunchScreen` is the approved cinematic splash. It is rendered here while the
 * stored session is read, so the splash stays up for the whole of start-up rather
 * than for a frame — an earlier build showed it only briefly and then flashed the
 * onboarding screen, which the owner rejected.
 *
 * The onboarding and sign-in routes still exist and are still reachable from the
 * account screen, so signing out and switching roles keep working. They are simply
 * not part of the automatic start-up path.
 */
export default function Index() {
  const { ready, account, signInAs } = useApp();

  // A first run has no stored session. Sign in as the demo customer so the
  // approved homepage is what the owner sees on launch. `signInAs` only writes
  // the demo session; it is not a network call.
  useEffect(() => {
    if (ready && !account) {
      void signInAs('customer');
    }
  }, [ready, account, signInAs]);

  if (!ready) {
    return <LaunchScreen />;
  }

  if (!account) {
    // The effect above is settling. Keep the approved splash on screen rather
    // than flashing an empty themed page.
    return <LaunchScreen />;
  }

  return <Redirect href={account.role === 'merchant' ? '/merchant/dashboard' : '/(tabs)/home'} />;
}
