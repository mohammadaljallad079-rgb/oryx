import React, { useCallback, useEffect, useState } from 'react';
import { Redirect } from 'expo-router';

import { useApp } from '../lib/app-context';
import { useLiveSession } from '../lib/live-session';
import { LaunchScreen } from '../components/launch';

/**
 * Entry gate.
 *
 * The approved sequence is exactly three steps and nothing else:
 *
 *     ANDROID LAUNCH  ->  ORYX PHOTOGRAPHIC SPLASH  ->  HOMEPAGE
 *
 * Three conditions must all hold before the gate navigates:
 *
 *   1. the stored demo session has been read;
 *   2. the stored customer session has been checked against the API (so a
 *      returning customer lands signed in rather than as a guest);
 *   3. the splash has been on screen for its minimum duration, measured from the
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
  const { status } = useLiveSession();
  /** True once the splash has been visible for its minimum duration. */
  const [splashDone, setSplashDone] = useState(false);

  // A first run has no stored demo session. Enter the demo account so the
  // marketplace is what the owner sees. `signInAs` writes the demo session only;
  // it is not a network call, and it never sets the live token.
  useEffect(() => {
    if (ready && !account) {
      void signInAs('customer');
    }
  }, [ready, account, signInAs]);

  // Stable identity, so the splash's timer effect does not restart on each
  // render and reset the two seconds.
  const handleSplashReady = useCallback(() => setSplashDone(true), []);

  // `restoring` means the stored customer session has not been checked yet; the
  // gate waits so a returning customer is not briefly shown a guest homepage.
  const sessionSettled = status !== 'restoring';

  if (!splashDone || !ready || !account || !sessionSettled) {
    return <LaunchScreen onReady={handleSplashReady} />;
  }

  return <Redirect href={account.role === 'merchant' ? '/merchant/dashboard' : '/(tabs)/home'} />;
}
