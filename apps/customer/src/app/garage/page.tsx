'use client';

import { useState } from 'react';
import { useUi } from '@/lib/ui-context';
import { customerApi } from '@/lib/api';
import { messageOf, useAsync } from '@/lib/hooks';
import { RequireCustomer } from '@/components/require-customer';
import { Alert, Button, Card, Field, StatusBadge, formatDate } from '@/components/ui';
import { LoadingPanel, PageHeader, StatePanel, TableWrap } from '@/components/premium';
import { Icon } from '@/components/icons';

/** Vehicle garage: list, add and remove the customer's own vehicles. */
export default function GaragePage() {
  return (
    <RequireCustomer>
      <GarageContent />
    </RequireCustomer>
  );
}

function GarageContent() {
  const { t, locale } = useUi();
  const vehicles = useAsync(() => customerApi.vehicles(), []);

  const [vin, setVin] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [modelYear, setModelYear] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [color, setColor] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<Record<string, unknown>>>([]);

  async function addVehicle(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      await customerApi.addVehicle({
        vin: vin.trim().toUpperCase(),
        make: make.trim(),
        model: model.trim(),
        modelYear: Number(modelYear),
        ...(plateNumber ? { plateNumber: plateNumber.trim() } : {}),
        ...(color ? { color: color.trim() } : {}),
      });
      setVin('');
      setMake('');
      setModel('');
      setModelYear('');
      setPlateNumber('');
      setColor('');
      setSaved(true);
      await vehicles.reload();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function removeVehicle(id: string) {
    if (!window.confirm(t('garage.removeConfirm'))) return;
    setError(null);
    try {
      await customerApi.removeVehicle(id);
      await vehicles.reload();
    } catch (err) {
      setError(messageOf(err));
    }
  }

  async function showHistory(id: string) {
    setError(null);
    setHistoryFor(id);
    try {
      const res = await customerApi.vehicleHistory(id);
      setHistory(res.items);
    } catch (err) {
      setError(messageOf(err));
      setHistory([]);
    }
  }

  return (
    <div className="oryx-container">
      <PageHeader
        eyebrow={t('brand.tagline')}
        title={t('garage.title')}
        subtitle={t('garage.subtitle')}
        art="/art/hero-automotive.svg"
        actions={
          <Button variant="primary" onClick={() => document.getElementById('garage-vin')?.focus()}>
            <Icon name="plus" size={16} />
            {t('garage.add')}
          </Button>
        }
      />

      {error && (
        <div style={{ marginBottom: 16 }}>
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="oryx-grid oryx-split">
        <Card title={t('garage.add')} subtitle={t('garage.addHint')}>
          <form onSubmit={addVehicle}>
            <Field label={t('garage.vin')}>
              <input
                id="garage-vin"
                className="oryx-input"
                value={vin}
                onChange={(e) => setVin(e.target.value)}
                minLength={6}
                maxLength={32}
                dir="ltr"
                required
                data-testid="vehicle-vin"
              />
            </Field>
            <div className="oryx-field-row">
              <Field label={t('garage.make')}>
                <input
                  className="oryx-input"
                  value={make}
                  onChange={(e) => setMake(e.target.value)}
                  required
                  data-testid="vehicle-make"
                />
              </Field>
              <Field label={t('garage.model')}>
                <input
                  className="oryx-input"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  required
                  data-testid="vehicle-model"
                />
              </Field>
            </div>
            <div className="oryx-field-row">
              <Field label={t('garage.year')}>
                <input
                  className="oryx-input"
                  type="number"
                  value={modelYear}
                  onChange={(e) => setModelYear(e.target.value)}
                  min={1900}
                  max={2100}
                  dir="ltr"
                  required
                  data-testid="vehicle-year"
                />
              </Field>
              <Field label={t('garage.plate')} hint={t('common.optional')}>
                <input
                  className="oryx-input"
                  value={plateNumber}
                  onChange={(e) => setPlateNumber(e.target.value)}
                />
              </Field>
            </div>
            <Field label={t('garage.color')} hint={t('common.optional')}>
              <input className="oryx-input" value={color} onChange={(e) => setColor(e.target.value)} />
            </Field>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? t('common.saving') : t('common.save')}
            </Button>
            {saved && (
              <div style={{ marginTop: 12 }}>
                <Alert tone="success">{t('garage.added')}</Alert>
              </div>
            )}
          </form>
        </Card>

        <Card
          title={t('garage.title')}
          subtitle={t('garage.count', { count: String(vehicles.data?.length ?? 0) })}
        >
          {vehicles.loading ? (
            <LoadingPanel rows={4} />
          ) : (vehicles.data?.length ?? 0) === 0 ? (
            <StatePanel
              icon="car"
              title={t('garage.none')}
              message={t('garage.noneHint')}
            />
          ) : (
            <ul className="oryx-list">
              {vehicles.data?.map((vehicle) => (
                <li key={vehicle.id} className="oryx-list__item">
                  <div className="oryx-vehicle">
                    <span className="oryx-vehicle__icon" aria-hidden>
                      <Icon name="car" size={20} />
                    </span>
                    <div className="oryx-vehicle__body">
                      <strong className="oryx-vehicle__name">
                        {vehicle.make} {vehicle.model} ({vehicle.modelYear})
                      </strong>
                      <span className="oryx-muted" dir="ltr">
                        VIN {vehicle.vin}
                        {vehicle.plateNumber ? ` · ${vehicle.plateNumber}` : ''}
                      </span>
                    </div>
                    <StatusBadge status={vehicle.status} />
                  </div>
                  <div className="oryx-vehicle__actions">
                    <button
                      type="button"
                      className="oryx-btn oryx-btn-ghost"
                      onClick={() => void showHistory(vehicle.id)}
                    >
                      <Icon name="clock" size={15} />
                      {t('garage.history')}
                    </button>
                    <button
                      type="button"
                      className="oryx-btn oryx-btn-danger"
                      onClick={() => void removeVehicle(vehicle.id)}
                    >
                      {t('garage.remove')}
                    </button>
                  </div>

                  {historyFor === vehicle.id && (
                    <div className="oryx-vehicle__history">
                      {history.length === 0 ? (
                        <StatePanel compact tone="info" title={t('garage.noHistory')} />
                      ) : (
                        <TableWrap>
                          <table className="oryx-table">
                            <thead>
                              <tr>
                                <th>{t('common.date')}</th>
                                <th>{t('common.status')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {history.map((row, index) => (
                                <tr key={String(row.id ?? index)}>
                                  <td>
                                    {row.createdAt
                                      ? formatDate(String(row.createdAt), locale)
                                      : '—'}
                                  </td>
                                  <td>{String(row.status ?? '—')}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </TableWrap>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
