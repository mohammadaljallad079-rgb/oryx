/**
 * How long the photographic splash stays on screen, in milliseconds.
 *
 * It lives in its own module, with no React Native import, so the gate and the
 * test can both read it without pulling the component tree in.
 *
 * The timer starts when the splash's photograph has rendered — `onLoad` on the
 * image — not when the app process starts. An earlier build waited only for the
 * stored session, which on a fast device resolved in a few milliseconds, so the
 * splash was replaced before it painted and the owner saw it as skipped.
 */
export const SPLASH_MIN_MS = 2000;
