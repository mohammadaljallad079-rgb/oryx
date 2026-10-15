'use client';

import { useState } from 'react';
import { useUi } from '@/lib/ui-context';
import { customerApi, SERVICE_CATEGORIES } from '@/lib/api';
import { messageOf, useAsync } from '@/lib/hooks';
import { RequireCustomer } from '@/components/require-customer';
import { Alert, Button, Card, EmptyState, Field, Loading, StatusBadge, Stars } from '@/components/ui';

/**
 * Customer support: service requests, reviews and complaints.
 *
 * A review may only be written against a completed request, and a complaint is
 * opened against a request the caller owns — both rules are enforced by the API,
 * so the UI simply surfaces the refusal.
 */
export default function SupportPage() {
  return (
    <RequireCustomer>
      <SupportContent />
    </RequireCustomer>
  );
}

function SupportContent() {
  const { t, locale } = useUi();
  const requests = useAsync(() => customerApi.serviceRequests(), []);
  const disputes = useAsync(() => customerApi.disputes(), []);
  const vehicles = useAsync(() => customerApi.vehicles(), []);

  const [categoryKey, setCategoryKey] = useState<string>(SERVICE_CATEGORIES[0].key);
  const [description, setDescription] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [reviewFor, setReviewFor] = useState<string | null>(null);
  const [rating, setRating] = useState('5');
  const [comment, setComment] = useState('');

  const [disputeFor, setDisputeFor] = useState<string | null>(null);
  const [disputeSubject, setDisputeSubject] = useState('');
  const [disputeBody, setDisputeBody] = useState('');

  async function submitRequest(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const created = await customerApi.createServiceRequest({
        categoryKey,
        ...(description ? { description } : {}),
        ...(vehicleId ? { vehicleId } : {}),
      });
      setNotice(`${created.requestNumber} — ${t('support.submit')}`);
      setDescription('');
      await requests.reload();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitReview(event: React.FormEvent) {
    event.preventDefault();
    if (!reviewFor) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await customerApi.submitReview({
        serviceRequestId: reviewFor,
        rating: Number(rating),
        ...(comment ? { comment } : {}),
      });
      setNotice(t('support.submitReview'));
      setReviewFor(null);
      setComment('');
      await requests.reload();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitDispute(event: React.FormEvent) {
    event.preventDefault();
    if (!disputeFor) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await customerApi.openDispute({
        serviceRequestId: disputeFor,
        ...(disputeSubject ? { subject: disputeSubject } : {}),
        description: disputeBody,
      });
      setNotice(t('support.disputes'));
      setDisputeFor(null);
      setDisputeSubject('');
      setDisputeBody('');
      await disputes.reload();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="oryx-container">
      <h1 className="oryx-section-title">{t('support.title')}</h1>
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

      <div className="oryx-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
        <Card title={t('support.new')}>
          <form onSubmit={submitRequest}>
            <Field label={t('support.category')}>
              <select
                className="oryx-select"
                value={categoryKey}
                onChange={(e) => setCategoryKey(e.target.value)}
                data-testid="request-category"
              >
                {SERVICE_CATEGORIES.map((category) => (
                  <option key={category.key} value={category.key}>
                    {locale === 'ar' ? category.nameAr : category.nameEn}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('bookings.pickVehicle')} hint={t('common.optional')}>
              <select
                className="oryx-select"
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
              >
                <option value="">—</option>
                {vehicles.data?.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.make} {vehicle.model}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('support.description')}>
              <textarea
                className="oryx-textarea"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                data-testid="request-description"
              />
            </Field>
            <Button type="submit" variant="primary" disabled={busy} className="oryx-btn-primary">
              {t('support.submit')}
            </Button>
          </form>
        </Card>

        <Card title={t('support.requests')}>
          {requests.loading ? (
            <Loading />
          ) : (requests.data?.items.length ?? 0) === 0 ? (
            <EmptyState message={t('support.none')} />
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {requests.data?.items.map((request) => (
                <li
                  key={request.id}
                  style={{ padding: '12px 0', borderBottom: '1px solid var(--border-soft)' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <strong dir="ltr">{request.requestNumber}</strong>
                    <StatusBadge status={request.status} />
                  </div>
                  <div className="oryx-muted">{request.description ?? request.categoryKey}</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="oryx-btn oryx-btn-ghost"
                      onClick={() => setReviewFor(request.id)}
                    >
                      {t('support.review')}
                    </button>
                    <button
                      type="button"
                      className="oryx-btn oryx-btn-ghost"
                      onClick={() => setDisputeFor(request.id)}
                    >
                      {t('support.disputes')}
                    </button>
                    {request.status !== 'CANCELLED' && request.status !== 'COMPLETED' && (
                      <button
                        type="button"
                        className="oryx-btn oryx-btn-danger"
                        onClick={() =>
                          void customerApi.cancelServiceRequest(request.id).then(() => requests.reload())
                        }
                      >
                        {t('common.cancel')}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {reviewFor && (
        <div style={{ marginTop: 20 }}>
          <Card title={t('support.review')}>
            <form onSubmit={submitReview}>
              <Field label={t('support.rating')}>
                <select
                  className="oryx-select"
                  value={rating}
                  onChange={(e) => setRating(e.target.value)}
                  data-testid="review-rating"
                >
                  {[5, 4, 3, 2, 1].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
                <span style={{ display: 'block', marginTop: 6 }}>
                  <Stars rating={Number(rating)} />
                </span>
              </Field>
              <Field label={t('support.comment')} hint={t('common.optional')}>
                <textarea
                  className="oryx-textarea"
                  rows={3}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              </Field>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button type="submit" variant="primary" disabled={busy}>
                  {t('support.submitReview')}
                </Button>
                <Button variant="ghost" onClick={() => setReviewFor(null)}>
                  {t('common.cancel')}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {disputeFor && (
        <div style={{ marginTop: 20 }}>
          <Card title={t('support.disputes')}>
            <form onSubmit={submitDispute}>
              <Field label={t('common.status')} hint={t('common.optional')}>
                <input
                  className="oryx-input"
                  value={disputeSubject}
                  onChange={(e) => setDisputeSubject(e.target.value)}
                />
              </Field>
              <Field label={t('support.description')}>
                <textarea
                  className="oryx-textarea"
                  rows={4}
                  value={disputeBody}
                  onChange={(e) => setDisputeBody(e.target.value)}
                  required
                  data-testid="dispute-description"
                />
              </Field>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button type="submit" variant="primary" disabled={busy}>
                  {t('common.save')}
                </Button>
                <Button variant="ghost" onClick={() => setDisputeFor(null)}>
                  {t('common.cancel')}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        <Card title={t('support.disputes')}>
          {disputes.loading ? (
            <Loading />
          ) : (disputes.data?.items.length ?? 0) === 0 ? (
            <EmptyState message={t('support.none')} />
          ) : (
            <table className="oryx-table">
              <thead>
                <tr>
                  <th>{t('common.date')}</th>
                  <th>{t('support.description')}</th>
                  <th>{t('common.status')}</th>
                </tr>
              </thead>
              <tbody>
                {disputes.data?.items.map((dispute) => (
                  <tr key={dispute.id}>
                    <td>{new Date(dispute.createdAt).toLocaleDateString('en-GB')}</td>
                    <td>{dispute.subject ?? '—'}</td>
                    <td>
                      <StatusBadge status={dispute.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
