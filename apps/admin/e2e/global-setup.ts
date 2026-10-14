import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * Playwright global setup.
 *
 * Restores the documented MFA baseline on the seeded development accounts
 * before the UI suites run, so a previously interrupted run cannot leave an
 * account stuck behind a second factor that the tests do not know about.
 */
export default function globalSetup() {
  const script = path.resolve(__dirname, '../../../scripts/reset-seed-mfa.mjs');
  const output = execFileSync('node', [script], {
    cwd: path.resolve(__dirname, '../../..'),
    env: process.env,
    encoding: 'utf8',
  });
  // eslint-disable-next-line no-console
  console.log(output.trim());
}
