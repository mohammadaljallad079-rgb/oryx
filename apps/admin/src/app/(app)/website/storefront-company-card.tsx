'use client';

import { useEffect, useState } from 'react';

import { Button, Card, ErrorBanner, Field } from '@/components/ui';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { useUi } from '@/lib/ui-context';

/**
 * The company the public website trades for.
 *
 * A Super Admin names one company here. The storefront API resolves every
 * public request against it — context, parts, services and the product
 * catalogue the site asks for — so the website never mixes tenants. The card
 * also shows the company the site is actually serving right now, read from the
 * public `GET /storefront/context`, so the choice on screen cannot disagree
 * with what a visitor sees.
 */
export function StorefrontCompanyCard() {
  const { t } = useUi();
  const settings = useAsync(() => api.platformSettings(), []);
  const companies = useAsync(() => api.listCompanies({ pageSize: 100, status: 'ACTIVE' }), []);
  const context = useAsync(() => api.storefrontContext(), []);

  const [selected, setSelected] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings.data) setSelected(settings.data.storefrontCompany?.id ?? '');
  }, [settings.data]);

  const save = async (companyId: string) => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api.updatePlatformSettings({ storefrontCompanyId: companyId || null });
      await Promise.all([settings.reload(), context.reload()]);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const serving = context.data;

  return (
    <Card data-testid="storefront-company-card">
      <div className="flex flex-col gap-3">
        <div>
          <h3 className="text-[15px] font-bold">{t('website.storefrontCompany.title')}</h3>
          <p className="oryx-faint mt-1 text-[12px]">{t('website.storefrontCompany.hint')}</p>
        </div>

        {error ? <ErrorBanner message={error} /> : null}

        <Field
          label={t('website.storefrontCompany.label')}
          hint={
            serving
              ? `${t('website.storefrontCompany.current')}: ${serving.nameAr} — ${serving.nameEn}`
              : undefined
          }
        >
          <select
            className="oryx-input"
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
            disabled={saving || companies.loading}
            data-testid="storefront-company-select"
          >
            <option value="">{t('website.storefrontCompany.none')}</option>
            {(companies.data?.items ?? []).map((company) => (
              <option key={company.id} value={company.id}>
                {company.nameAr} — {company.nameEn} ({company.code})
              </option>
            ))}
          </select>
        </Field>

        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            onClick={() => save(selected)}
            disabled={saving || settings.loading}
            data-testid="storefront-company-save"
          >
            {t('website.storefrontCompany.save')}
          </Button>
          {saved ? (
            <span className="oryx-faint text-[12px]" data-testid="storefront-company-saved">
              {t('website.storefrontCompany.saved')}
            </span>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
