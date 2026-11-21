'use client';

import { PermissionGate } from '@/components/permission-gate';
import { SectionHeader } from '@/components/ui';
import { useUi } from '@/lib/ui-context';
import { SiteContentEditor } from '../site-content-editor';
import { StorefrontCompanyCard } from '../storefront-company-card';

/**
 * Website Settings.
 *
 * A dedicated entry point for the public-website content editor. It reuses the
 * same `SiteContentEditor` the CMS page embeds under its "content" tab, so both
 * surfaces read and write the one `site-content` record — no second store and
 * no duplicate editor. The route exists so the sidebar can link straight to the
 * settings a website administrator edits most often.
 *
 * The trading company is a platform decision, not a content edit, so its card
 * is gated separately on `platform.settings.manage` and a company website
 * administrator never sees it.
 */
function WebsiteSettingsPageInner() {
  const { t } = useUi();

  return (
    <div className="flex flex-col gap-4" data-testid="website-settings-page">
      <SectionHeader title={t('nav.websiteSettings')} subtitle={t('cms.siteContentHint')} />
      <PermissionGate anyOf={['platform.settings.manage']}>
        <StorefrontCompanyCard />
      </PermissionGate>
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
