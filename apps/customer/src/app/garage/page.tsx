'use client';

import { useState } from 'react';
import { useUi } from '@/lib/ui-context';
import { customerApi } from '@/lib/api';
import { messageOf, useAsync } from '@/lib/hooks';
import { RequireCustomer } from '@/components/require-customer';
import { Alert, Button, Card, EmptyState, Field, Loading, StatusBadge, formatDate } from '@/components/ui';

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
  const [busy, setBusy] = useState(false);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<Record<string, unknown>>>([]);

  async function addVehicle(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
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
      <h1 className="oryx-section-title">{t('garage.title')}</h1>
      {error && (
        <div style={{ marginBottom: 16 }}>
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="oryx-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
        <Card title={t('garage.add')}>
          <form onSubmit={addVehicle}>
            <Field label={t('garage.vin')}>
              <input
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
            <Field label={t('garage.color')} hint={t('common.optional')}>
              <input className="oryx-input" value={color} onChange={(e) => setColor(e.target.value)} />
            </Field>
            <Button type="submit" variant="primary" disabled={busy} className="oryx-btn-primary">
              {t('common.save')}
            </Button>
          </form>
        </Card>

        <Card title={t('garage.title')}>
          {vehicles.loading ? (
            <Loading />
          ) : (vehicles.data?.length ?? 0) === 0 ? (
            <EmptyState message={t('garage.none')} />
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {vehicles.data?.map((vehicle) => (
                <li
                  key={vehicle.id}
                  style={{ padding: '12px 0', borderBottom: '1px solid var(--border-soft)' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <strong>
                        {vehicle.make} {vehicle.model} ({vehicle.modelYear})
                      </strong>
                      <div className="oryx-muted" dir="ltr">
                        VIN {vehicle.vin}
                        {vehicle.plateNumber ? ` · ${vehicle.plateNumber}` : ''}
                      </div>
                    </div>
                    <StatusBadge status={vehicle.status} />
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button
                      type="button"
                      className="oryx-btn oryx-btn-ghost"
                      onClick={() => void showHistory(vehicle.id)}
                    >
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
                    <div style={{ marginTop: 10 }}>
                      {history.length === 0 ? (
                        <span className="oryx-muted">{t('common.empty')}</span>
                      ) : (
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
