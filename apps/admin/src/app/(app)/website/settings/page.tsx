'use client';

import { PermissionGate } from '@/components/permission-gate';
import { SectionHeader } from '@/components/ui';
import { useUi } from '@/lib/ui-context';
import { SiteContentEditor } from '../site-content-editor';

/**
 * Website Settings.
 *
 * A dedicated entry point for the public-website content editor. It reuses the
 * same `SiteContentEditor` the CMS page embeds under its "content" tab, so both
 * surfaces read and write the one `site-content` record — no second store and
 * no duplicate editor. The route exists so the sidebar can link straight to the
 * settings a website administrator edits most often.
 */
function WebsiteSettingsPageInner() {
  const { t } = useUi();

  return (
    <div className="flex flex-col gap-4" data-testid="website-settings-page">
      <SectionHeader title={t('nav.websiteSettings')} subtitle={t('cms.siteContentHint')} />
      <SiteContentEditor />
    </div>
  );
}

export default function WebsiteSettingsPage() {
  return (
    <PermissionGate anyOf={['platform.cms.manage']}>
      <WebsiteSettingsPageInner />
    </PermissionGate>
  );
}
