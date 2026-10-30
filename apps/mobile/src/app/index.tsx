import React, { useCallback, useEffect, useState } from 'react';
import { Redirect } from 'expo-router';

import { useApp } from '../lib/app-context';
import { LaunchScreen } from '../components/launch';

/**
 * Entry gate.
 *
 * The approved sequence is exactly three steps and nothing else:
 *
 *     ANDROID LAUNCH  ->  ORYX PHOTOGRAPHIC SPLASH  ->  HOMEPAGE
 *
 * Two conditions must both be met before the gate navigates:
 *
 *   1. the stored session has been read, so the destination is known;
 *   2. the splash has been on screen for its minimum duration, measured from the
 *      moment its photograph rendered.
 *
 * The earlier build only waited for (1). On a fast device the session read
 * finished in a few milliseconds, so the splash was replaced before it had
 * painted and the owner saw it as skipped. `LaunchScreen` now reports back
 * through `onReady`, which fires 2s after its image loads, and the gate holds
 * until that arrives.
 *
 * The splash is not replayed on resume: this component only mounts on a cold
 * start of the route, and a backgrounded app resumes on the same route without
 * remounting it.
 */
export default function Index() {
  const { ready, account, signInAs } = useApp();
  /** True once the splash has been visible for its minimum duration. */
  const [splashDone, setSplashDone] = useState(false);

  // A first run has no stored session. Sign in as the demo customer so the
  // marketplace is what the owner sees. `signInAs` writes the demo session only;
  // it is not a network call.
  useEffect(() => {
    if (ready && !account) {
      void signInAs('customer');
    }
  }, [ready, account, signInAs]);

  // Stable identity, so the splash's timer effect does not restart on each
  // render and reset the two seconds.
  const handleSplashReady = useCallback(() => setSplashDone(true), []);

  if (!splashDone || !ready || !account) {
    return <LaunchScreen onReady={handleSplashReady} />;
  }

  return <Redirect href={account.role === 'merchant' ? '/merchant/dashboard' : '/(tabs)/home'} />;
}
