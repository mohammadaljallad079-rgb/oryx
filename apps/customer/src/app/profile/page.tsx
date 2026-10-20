'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_COUNTRY_CODE } from '@oryx/shared';
import { useUi } from '@/lib/ui-context';
import { useCustomerAuth } from '@/lib/auth-context';
import { customerApi, type Address, type NotificationPreference, type PrivacySettings } from '@/lib/api';
import { messageOf, useAsync } from '@/lib/hooks';
import { RequireCustomer } from '@/components/require-customer';
import { Alert, Button, Card, Field } from '@/components/ui';
import { LoadingPanel, PageHeader, StatePanel } from '@/components/premium';
import { Icon } from '@/components/icons';

/** Profile, addresses, notification preferences and privacy controls. */
export default function ProfilePage() {
  return (
    <RequireCustomer>
      <ProfileContent />
    </RequireCustomer>
  );
}

function ProfileContent() {
  const { t } = useUi();
  const { profile, refreshProfile } = useCustomerAuth();

  const addresses = useAsync(() => customerApi.addresses(), []);
  const privacy = useAsync(() => customerApi.privacy(), []);
  const preferences = useAsync(() => customerApi.notificationPreferences(), []);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [privacyState, setPrivacyState] = useState<PrivacySettings | null>(null);
  const [preferenceState, setPreferenceState] = useState<NotificationPreference[]>([]);

  const [label, setLabel] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [city, setCity] = useState('');
  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY_CODE);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (profile) {
      setFullName(profile.fullName);
      setPhone(profile.phone ?? '');
    }
  }, [profile]);

  useEffect(() => {
    if (privacy.data) setPrivacyState(privacy.data);
  }, [privacy.data]);

  useEffect(() => {
    if (preferences.data) setPreferenceState(preferences.data);
  }, [preferences.data]);

  function flash(message: string) {
    setNotice(message);
    setError(null);
  }

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await customerApi.updateProfile({ fullName, phone });
      await refreshProfile();
      flash(t('common.save'));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function addAddress(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await customerApi.addAddress({
        addressLine1,
        city,
        countryCode,
        ...(label ? { label } : {}),
      });
      setLabel('');
      setAddressLine1('');
      setCity('');
      await addresses.reload();
      flash(t('common.save'));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function savePrivacy(event: React.FormEvent) {
    event.preventDefault();
    if (!privacyState) return;
    setBusy(true);
    try {
      const saved = await customerApi.updatePrivacy(privacyState);
      setPrivacyState(saved);
      flash(t('common.save'));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function savePreferences(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const saved = await customerApi.updateNotificationPreferences(preferenceState);
      setPreferenceState(saved);
      flash(t('common.save'));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function requestExport() {
    setBusy(true);
    try {
      await customerApi.requestDataExport();
      flash(t('profile.exportRequested'));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function requestDeletion() {
    setBusy(true);
    try {
      await customerApi.requestDeletion();
      flash(t('profile.deletionRequested'));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="oryx-container">
      <PageHeader
        eyebrow={t('brand.tagline')}
        title={t('profile.title')}
        subtitle={t('profile.subtitle')}
        art="/art/service-bodywork.svg"
      />
      {error && (
        <div style={{ marginBottom: 16 }}>
          <Alert>{error}</Alert>
        </div>
      )}
      {notice && (
        <div style={{ marginBottom: 16 }}>
          <Alert tone="success">{notice}</Alert>
        </div>
      )}

      <div className="oryx-grid oryx-split">
        <Card title={t('profile.title')} subtitle={t('profile.identityHint')}>
          <form onSubmit={saveProfile}>
            <Field label={t('profile.name')}>
              <input
                className="oryx-input"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </Field>
            <Field label={t('profile.phone')} hint={t('common.optional')}>
              <input
                className="oryx-input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                dir="ltr"
              />
            </Field>
            <Field label={t('auth.email')}>
              <input className="oryx-input" value={profile?.email ?? ''} readOnly dir="ltr" />
            </Field>
            <Button type="submit" variant="primary" disabled={busy}>
              <Icon name="check" size={16} />
              {busy ? t('common.saving') : t('common.save')}
            </Button>
          </form>
        </Card>

        <Card title={t('addresses.title')} subtitle={t('addresses.subtitle')}>
          <form onSubmit={addAddress} style={{ marginBottom: 18 }}>
            <Field label={t('addresses.label')} hint={t('common.optional')}>
              <input className="oryx-input" value={label} onChange={(e) => setLabel(e.target.value)} />
            </Field>
            <Field label={t('addresses.line1')}>
              <input
                className="oryx-input"
                value={addressLine1}
                onChange={(e) => setAddressLine1(e.target.value)}
                required
              />
            </Field>
            <Field label={t('addresses.city')}>
              <input
                className="oryx-input"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                required
              />
            </Field>
            <Field label={t('addresses.country')}>
              <input
                className="oryx-input"
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
                maxLength={2}
                dir="ltr"
                required
              />
            </Field>
            <Button type="submit" disabled={busy}>
              {t('addresses.add')}
            </Button>
          </form>

          {addresses.loading ? (
            <LoadingPanel rows={3} />
          ) : (addresses.data?.length ?? 0) === 0 ? (
            <StatePanel icon="user" title={t('addresses.none')} message={t('addresses.noneHint')} />
          ) : (
            <ul className="oryx-list">
              {addresses.data?.map((address: Address) => (
                <li key={address.id} className="oryx-address">
                  <span className="oryx-address__icon" aria-hidden>
                    <Icon name="user" size={16} />
                  </span>
                  <div className="oryx-address__body">
                    <div>{address.addressLine1}</div>
                    <div className="oryx-muted">
                      {address.city}, {address.countryCode}
                      {address.isDefault ? ` · ${t('addresses.default')}` : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="oryx-btn oryx-btn-danger"
                    onClick={() => void customerApi.removeAddress(address.id).then(() => addresses.reload())}
                  >
                    {t('common.delete')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="oryx-grid oryx-split" style={{ marginTop: 20 }}>
        <Card title={t('profile.preferences')} subtitle={t('profile.preferencesHint')}>
          {preferences.loading || !preferenceState ? (
            <LoadingPanel rows={3} />
          ) : preferenceState.length === 0 ? (
            <StatePanel icon="bell" title={t('profile.noPreferences')} />
          ) : (
            <form onSubmit={savePreferences}>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 14px' }}>
                {preferenceState.map((preference, index) => (
                  <li
                    key={`${preference.channel}-${preference.category}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 0',
                      borderBottom: '1px solid var(--border-soft)',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={preference.enabled}
                      onChange={(e) => {
                        const next = [...preferenceState];
                        next[index] = { ...preference, enabled: e.target.checked };
                        setPreferenceState(next);
                      }}
                    />
                    <span className="oryx-mono" dir="ltr">
                      {preference.channel} · {preference.category}
                    </span>
                  </li>
                ))}
              </ul>
              <Button type="submit" variant="primary" disabled={busy}>
                {t('common.save')}
              </Button>
            </form>
          )}
        </Card>

        <Card title={t('profile.privacy')} subtitle={t('profile.privacyHint')}>
          {privacy.loading || !privacyState ? (
            <LoadingPanel rows={3} />
          ) : (
            <>
              <form onSubmit={savePrivacy}>
                <label style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0' }}>
                  <input
                    type="checkbox"
                    checked={privacyState.allowMarketingEmails}
                    onChange={(e) =>
                      setPrivacyState({ ...privacyState, allowMarketingEmails: e.target.checked })
                    }
                  />
                  <span>{t('profile.marketingEmails')}</span>
                </label>
                <label style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0' }}>
                  <input
                    type="checkbox"
                    checked={privacyState.shareContactWithProvider}
                    onChange={(e) =>
                      setPrivacyState({ ...privacyState, shareContactWithProvider: e.target.checked })
                    }
                  />
                  <span>{t('profile.shareContact')}</span>
                </label>
                <Button type="submit" variant="primary" disabled={busy}>
                  {t('common.save')}
                </Button>
              </form>

              <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
                <Button onClick={() => void requestExport()}>{t('profile.dataExport')}</Button>
                <Button variant="danger" onClick={() => void requestDeletion()}>
                  {t('profile.deletion')}
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
