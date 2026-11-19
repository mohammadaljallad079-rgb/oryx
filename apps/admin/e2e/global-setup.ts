import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * Playwright global setup.
 *
 * Restores the documented MFA baseline on the seeded development accounts and
 * removes fixture rows left behind by an interrupted run, so the suites always
 * start from the seeded tenant.
 */
export default function globalSetup() {
  const root = path.resolve(__dirname, '../../..');
  const scripts = ['reset-seed-mfa.mjs', 'purge-ui-fixtures.mjs'];
  for (const name of scripts) {
    const output = execFileSync('node', [path.resolve(root, 'scripts', name)], {
      cwd: root,
      env: process.env,
      encoding: 'utf8',
    });
    console.log(output.trim());
  }
}
