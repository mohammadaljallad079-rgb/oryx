'use client';

import { PermissionGate } from '@/components/permission-gate';
import { SiteContentEditor } from '../site-content-editor';

/**
 * Website Settings.
 *
 * The sidebar entry that the Super Admin uses to edit the public website.
 * It reuses the existing site-content editor and its API endpoints, so the
 * saved document is the same one the public site renders.
 */
export default function Page() {
  return (
    <PermissionGate anyOf={['platform.cms.manage']}>
      <div data-testid="website-settings-page">
        <SiteContentEditor />
      </div>
    </PermissionGate>
  );
}
