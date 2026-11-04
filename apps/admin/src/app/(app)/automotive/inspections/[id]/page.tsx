'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { inspectionSectionSpec, type InspectionSectionKey } from '@oryx/shared';
import type {
  InspectionSessionDto,
  InspectionProgressDto,
  InspectionItemResultDto,
  InspectionResultValue,
  InspectionAttachmentDto,
} from '@oryx/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { Icon } from '@/components/icons';
import { Badge, Button, Card, ErrorBanner, Field, Modal, SectionHeader, Skeleton, StatusBadge } from '@/components/ui';
import { BodyDiagram, ChassisDiagram, type ChassisRegionValue, type PaintMarker } from '@/components/inspection/diagrams';

/**
 * The inspection workspace.
 *
 * One page per inspection, with a rail of the sections the customer actually
 * bought. A section that was not selected is never rendered and never sent, which
 * is what keeps a paint-only job from asking about the engine.
 */
export default function InspectionWorkspacePage() {
  const { t } = useUi();
  const { can } = useAuth();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [session, setSession] = useState<InspectionSessionDto | null>(null);
  const [progress, setProgress] = useState<InspectionProgressDto | null>(null);
  const [active, setActive] = useState<InspectionSectionKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewOpen, setReviewOpen] = useState(false);

  const canWrite = can('erp.inspection.write');
  const canApprove = can('erp.inspection.report.approve');
  const editable = session ? ['DRAFT', 'IN_PROGRESS', 'REJECTED'].includes(session.status) : false;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, p] = await Promise.all([api.inspectionSession(id), api.inspectionProgress(id)]);
      setSession(s);
      setProgress(p);
      setActive((prev) => prev ?? s.selectedAreas[0] ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const applySession = useCallback(
    (s: InspectionSessionDto) => {
      setSession(s);
      void api
        .inspectionProgress(id)
        .then(setProgress)
        .catch(() => undefined);
    },
    [id],
  );

  if (loading && !session) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton height={40} />
        <Skeleton height={280} />
      </div>
    );
  }

  if (!session) {
    return <ErrorBanner message={error ?? t('common.error')} onRetry={load} retryLabel={t('common.retry')} />;
  }

  const spec = active ? inspectionSectionSpec(active) : null;
  const section = session.sections.find((s) => s.area === active) ?? null;

  return (
    <div className="flex flex-col gap-4" data-testid="inspection-workspace">
      <SectionHeader
        title={session.jobNumber}
        subtitle={`${session.make} ${session.model} · ${session.modelYear} · ${session.vin}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={session.status} label={t(`inspection.status.${session.status}`)} />
            <Button onClick={load} data-testid="inspection-refresh">
              <Icon name="search" size={14} />
              {t('common.refresh')}
            </Button>
          </div>
        }
      />

      {error ? <ErrorBanner message={error} /> : null}

      <IdentityCard session={session} />

      {progress ? <ProgressRail progress={progress} active={active} onSelect={setActive} /> : null}

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          {spec && section ? (
            <SectionEditor
              key={spec.key}
              sessionId={id}
              area={spec.key}
              spec={spec}
              section={section}
              editable={editable && canWrite}
              onSaved={applySession}
              onError={setError}
            />
          ) : (
            <Card>{t('inspection.noSections')}</Card>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <AttachmentsPanel
            sessionId={id}
            attachments={session.attachments}
            areas={session.selectedAreas}
            editable={editable && canWrite}
            onSaved={applySession}
            onError={setError}
          />
          <WorkflowPanel
            session={session}
            progress={progress}
            canWrite={canWrite}
            canApprove={canApprove}
            onReview={() => setReviewOpen(true)}
            onChanged={applySession}
            onError={setError}
          />
        </div>
      </div>

      {reviewOpen ? (
        <ReviewModal
          sessionId={id}
          onClose={() => setReviewOpen(false)}
          onDone={(s) => {
            applySession(s);
            setReviewOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

/** The identification header, repeated on every printed section. */
function IdentityCard({ session }: { session: InspectionSessionDto }) {
  const { t } = useUi();
  const rows: Array<[string, string]> = [
    [t('inspection.customer'), session.customerName],
    [t('inspection.contact'), session.contactNumber ?? '—'],
    [t('inspection.plate'), session.plateNumber ?? '—'],
    [t('inspection.vin'), session.vin],
    [t('inspection.year'), String(session.modelYear)],
    [t('inspection.odometer'), session.odometer !== null ? `${session.odometer.toLocaleString()} km` : '—'],
    [t('inspection.inspectedAt'), new Date(session.inspectedAt).toLocaleString()],
  ];
  return (
    <Card>
      <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-4" data-testid="inspection-identity">
        {rows.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <div className="oryx-label">{label}</div>
            <div className="truncate text-[13.5px] font-medium" title={value}>
              {value}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** The rail of selected sections, with their completion state. */
function ProgressRail({
  progress,
  active,
  onSelect,
}: {
  progress: InspectionProgressDto;
  active: InspectionSectionKey | null;
  onSelect: (area: InspectionSectionKey) => void;
}) {
  const { t, locale } = useUi();
  return (
    <div className="flex flex-wrap items-center gap-2" role="tablist" data-testid="inspection-rail">
      {progress.sections.map((s) => (
        <button
          key={s.area}
          type="button"
          role="tab"
          aria-selected={active === s.area}
          className={`oryx-rail-item${active === s.area ? ' is-active' : ''}${s.complete ? ' is-complete' : ''}`}
          onClick={() => onSelect(s.area)}
          data-testid={`inspection-rail-${s.area}`}
          data-complete={s.complete}
        >
          <span className="oryx-rail-item__dot" aria-hidden="true">
            {s.complete ? '✓' : ''}
          </span>
          <span className="oryx-rail-item__label">{locale === 'ar' ? s.labelAr : s.labelEn}</span>
          <span className="oryx-rail-item__count">{s.totalItems > 0 ? `${s.completedItems}/${s.totalItems}` : s.recorded}</span>
        </button>
      ))}
      {progress.complete ? <Badge tone="success">{t('inspection.progressComplete')}</Badge> : null}
    </div>
  );
}

/**
 * One section's editor.
 *
 * The section kind decides the interface: a checklist for the item sections, the
 * body diagram for the paint section, the chassis diagram for the chassis
 * section, and the diagnostic list for the computer unit. The section's own
 * remarks box is present on all of them, because the report prints remarks for
 * every section.
 */
function SectionEditor({
  sessionId,
  area,
  spec,
  section,
  editable,
  onSaved,
  onError,
}: {
  sessionId: string;
  area: InspectionSectionKey;
  spec: ReturnType<typeof inspectionSectionSpec>;
  section: InspectionSessionDto['sections'][number];
  editable: boolean;
  onSaved: (s: InspectionSessionDto) => void;
  onError: (message: string) => void;
}) {
  const { t, locale } = useUi();
  const [busy, setBusy] = useState(false);
  const [remarks, setRemarks] = useState(section.remarks ?? '');
  const [noFindings, setNoFindings] = useState(section.noFindings ?? false);
  const [results, setResults] = useState<Record<string, InspectionItemResultDto>>(() =>
    Object.fromEntries(section.items.map((i) => [i.itemKey, i])),
  );
  const [markers, setMarkers] = useState<PaintMarker[]>(() =>
    section.markers.map((m) => ({ id: m.id, condition: m.condition, x: m.x, y: m.y, panelKey: m.panelKey, note: m.note })),
  );
  const [regions, setRegions] = useState<ChassisRegionValue[]>(() =>
    section.chassisRegions.map((r) => ({
      regionKey: r.regionKey as ChassisRegionValue['regionKey'],
      condition: r.condition,
      note: r.note,
    })),
  );

  // Re-sync when the server returns a fresh section (a save, or a reload).
  useEffect(() => {
    setRemarks(section.remarks ?? '');
    setNoFindings(section.noFindings ?? false);
    setResults(Object.fromEntries(section.items.map((i) => [i.itemKey, i])));
    setMarkers(
      section.markers.map((m) => ({ id: m.id, condition: m.condition, x: m.x, y: m.y, panelKey: m.panelKey, note: m.note })),
    );
    setRegions(
      section.chassisRegions.map((r) => ({
        regionKey: r.regionKey as ChassisRegionValue['regionKey'],
        condition: r.condition,
        note: r.note,
      })),
    );
  }, [section]);

  const run = async (fn: () => Promise<InspectionSessionDto>) => {
    setBusy(true);
    try {
      onSaved(await fn());
    } catch (e) {
      onError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const setResult = (itemKey: string, result: InspectionResultValue) =>
    setResults((prev) => ({ ...prev, [itemKey]: { itemKey, result, note: prev[itemKey]?.note ?? null } }));

  const saveItems = () =>
    run(() =>
      api.saveInspectionSection(sessionId, area, {
        remarks,
        noFindings,
        items: spec.items.map(
          (item) => results[item.key] ?? { itemKey: item.key, result: 'UNSET' as InspectionResultValue, note: null },
        ),
      }),
    );

  const saveMarkers = () => run(() => api.saveInspectionMarkers(sessionId, markers));
  const saveRegions = () => run(() => api.saveInspectionChassis(sessionId, regions));
  const save = spec.kind === 'DIAGRAM_PAINT' ? saveMarkers : spec.kind === 'DIAGRAM_CHASSIS' ? saveRegions : saveItems;

  return (
    <Card data-testid={`inspection-section-${area}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="oryx-h2 m-0">{locale === 'ar' ? spec.labelAr : spec.labelEn}</h2>
          <p className="oryx-faint m-0 text-[12px]">{locale === 'ar' ? spec.summaryAr : spec.summaryEn}</p>
        </div>
        <Badge tone={section.completedAt ? 'success' : 'neutral'}>
          {section.completedAt ? t('inspection.sectionComplete') : t('inspection.sectionIncomplete')}
        </Badge>
      </div>

      {spec.kind === 'ITEMS' ? (
        <div className="oryx-checklist" data-testid={`checklist-${area}`}>
          {spec.items.map((item) => {
            const current = results[item.key]?.result ?? 'UNSET';
            const options: InspectionResultValue[] = spec.resultSet === 'PASS_FAIL' ? ['PASS', 'FAIL'] : ['PASS', 'FAIL', 'NA'];
            return (
              <div key={item.key} className="oryx-checklist__row" data-testid={`item-${item.key}`} data-result={current}>
                <span className="oryx-checklist__label">{locale === 'ar' ? item.labelAr : item.labelEn}</span>
                <div className="flex gap-1" role="group" aria-label={item.labelEn}>
                  {options.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      className={`oryx-result-btn oryx-result-btn--${opt.toLowerCase()}${current === opt ? ' is-active' : ''}`}
                      aria-pressed={current === opt}
                      disabled={!editable || busy}
                      onClick={() => setResult(item.key, opt)}
                      data-testid={`item-${item.key}-${opt}`}
                    >
                      {t(`inspection.result.${opt}`)}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {spec.kind === 'DIAGRAM_PAINT' ? (
        <BodyDiagram
          value={markers}
          onChange={setMarkers}
          disabled={!editable || busy}
          labels={{
            tools: t('inspection.paintTools'),
            selected: t('inspection.selectedMarker'),
            remove: t('inspection.removeMarker'),
            empty: t('inspection.paintHint'),
            condition: t('inspection.condition'),
          }}
        />
      ) : null}

      {spec.kind === 'DIAGRAM_CHASSIS' ? (
        <ChassisDiagram
          value={regions}
          onChange={setRegions}
          disabled={!editable || busy}
          labels={{ ok: t('inspection.result.OK'), damage: t('inspection.result.DAMAGE'), clear: t('common.close') }}
        />
      ) : null}

      {spec.kind === 'DIAGNOSTIC' ? (
        <DiagnosticList sessionId={sessionId} entries={section.diagnostics} editable={editable && !busy} onChanged={onSaved} onError={onError} />
      ) : null}

      {spec.kind !== 'ITEMS' ? (
        <label className="mt-3 flex items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={noFindings}
            disabled={!editable || busy}
            onChange={(e) => setNoFindings(e.target.checked)}
            data-testid={`no-findings-${area}`}
          />
          {t('inspection.nothingToReport')}
        </label>
      ) : null}

      <Field label={locale === 'ar' ? spec.remarksLabelAr : spec.remarksLabelEn}>
        <textarea
          className="oryx-input oryx-textarea"
          rows={3}
          value={remarks}
          disabled={!editable || busy}
          onChange={(e) => setRemarks(e.target.value)}
          data-testid={`remarks-${area}`}
        />
      </Field>

      {editable ? (
        <div className="mt-3 flex justify-end">
          <Button variant="primary" disabled={busy} onClick={save} data-testid={`save-section-${area}`}>
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

/** The computer-unit fault records: added one at a time, removed one at a time. */
function DiagnosticList({
  sessionId,
  entries,
  editable,
  onChanged,
  onError,
}: {
  sessionId: string;
  entries: InspectionSessionDto['sections'][number]['diagnostics'];
  editable: boolean;
  onChanged: (s: InspectionSessionDto) => void;
  onError: (m: string) => void;
}) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ module: '', faultCode: '', description: '', observation: '', severity: 'INFO' });

  const add = async () => {
    if (!form.module.trim() || !form.description.trim()) {
      onError(t('inspection.diagnosticRequired'));
      return;
    }
    setBusy(true);
    try {
      await api.addInspectionDiagnostic(sessionId, {
        module: form.module.trim(),
        faultCode: form.faultCode.trim() || undefined,
        description: form.description.trim(),
        observation: form.observation.trim() || undefined,
        severity: form.severity,
      });
      setForm({ module: '', faultCode: '', description: '', observation: '', severity: 'INFO' });
      onChanged(await api.inspectionSession(sessionId));
    } catch (e) {
      onError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (entryId: string) => {
    setBusy(true);
    try {
      await api.removeInspectionDiagnostic(sessionId, entryId);
      onChanged(await api.inspectionSession(sessionId));
    } catch (e) {
      onError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3" data-testid="diagnostic-list">
      {entries.length === 0 ? <p className="oryx-faint m-0 text-[12.5px]">{t('inspection.noDiagnostics')}</p> : null}
      {entries.map((e) => (
        <div key={e.id} className="oryx-diagnostic-row" data-testid={`diagnostic-${e.id}`}>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold">
              {e.module}
              {e.faultCode ? <span className="oryx-faint"> · {e.faultCode}</span> : null}
            </div>
            <div className="text-[12.5px]">{e.description}</div>
            {e.observation ? <div className="oryx-faint text-[12px]">{e.observation}</div> : null}
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={e.severity === 'CRITICAL' || e.severity === 'MAJOR' ? 'danger' : e.severity === 'MINOR' ? 'warning' : 'neutral'}>
              {t(`inspection.severity.${e.severity}`)}
            </Badge>
            {editable ? (
              <button
                type="button"
                className="oryx-btn oryx-btn--sm oryx-btn--ghost"
                onClick={() => remove(e.id)}
                disabled={busy}
                aria-label={t('common.delete')}
                data-testid={`diagnostic-remove-${e.id}`}
              >
                <Icon name="close" size={14} />
              </button>
            ) : null}
          </div>
        </div>
      ))}

      {editable ? (
        <div className="grid gap-2 sm:grid-cols-2" data-testid="diagnostic-form">
          <Field label={t('inspection.module')}>
            <input className="oryx-input" value={form.module} onChange={(e) => setForm({ ...form, module: e.target.value })} data-testid="diagnostic-module" />
          </Field>
          <Field label={t('inspection.faultCode')}>
            <input className="oryx-input" value={form.faultCode} onChange={(e) => setForm({ ...form, faultCode: e.target.value })} data-testid="diagnostic-code" />
          </Field>
          <Field label={t('inspection.description')}>
            <input
              className="oryx-input"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              data-testid="diagnostic-description"
            />
          </Field>
          <Field label={t('inspection.observation')}>
            <input
              className="oryx-input"
              value={form.observation}
              onChange={(e) => setForm({ ...form, observation: e.target.value })}
              data-testid="diagnostic-observation"
            />
          </Field>
          <div className="flex justify-end sm:col-span-2">
            <Button onClick={add} disabled={busy} data-testid="diagnostic-add">
              <Icon name="plus" size={14} />
              {t('common.create')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Photographs attached to the inspection, optionally tied to a section. */
function AttachmentsPanel({
  sessionId,
  attachments,
  areas,
  editable,
  onSaved,
  onError,
}: {
  sessionId: string;
  attachments: InspectionAttachmentDto[];
  areas: InspectionSectionKey[];
  editable: boolean;
  onSaved: (s: InspectionSessionDto) => void;
  onError: (m: string) => void;
}) {
  const { t, locale } = useUi();
  const [busy, setBusy] = useState(false);
  const [area, setArea] = useState<string>('');

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      if (area) form.append('sectionArea', area);
      await api.uploadInspectionAttachment(sessionId, form);
      onSaved(await api.inspectionSession(sessionId));
    } catch (e) {
      onError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (attachmentId: string) => {
    setBusy(true);
    try {
      await api.removeInspectionAttachment(sessionId, attachmentId);
      onSaved(await api.inspectionSession(sessionId));
    } catch (e) {
      onError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card data-testid="inspection-attachments">
      <h2 className="oryx-h2 mb-2">{t('inspection.attachments')}</h2>
      {editable ? (
        <div className="mb-3 flex flex-col gap-2">
          <Field label={t('inspection.attachmentSection')}>
            <select className="oryx-select" value={area} onChange={(e) => setArea(e.target.value)} data-testid="attachment-area">
              <option value="">{t('inspection.attachmentGeneral')}</option>
              {areas.map((a) => {
                const s = inspectionSectionSpec(a);
                return (
                  <option key={a} value={a}>
                    {locale === 'ar' ? s.labelAr : s.labelEn}
                  </option>
                );
              })}
            </select>
          </Field>
          <input
            type="file"
            accept="image/*,application/pdf"
            className="oryx-input"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
              e.target.value = '';
            }}
            data-testid="attachment-input"
          />
        </div>
      ) : null}

      {attachments.length === 0 ? (
        <p className="oryx-faint m-0 text-[12.5px]">{t('inspection.noAttachments')}</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {attachments.map((a) => (
            <div key={a.id} className="oryx-attachment" data-testid={`attachment-${a.id}`}>
              {a.mimeType.startsWith('image/') && a.url ? (
                // The media route is authorised; no public storage URL is exposed.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={api.resolveImage(a.url) ?? undefined} alt={a.caption ?? a.originalName} className="oryx-attachment__thumb" />
              ) : (
                <div className="oryx-attachment__file">
                  <Icon name="scroll" size={18} />
                </div>
              )}
              {editable ? (
                <button
                  type="button"
                  className="oryx-attachment__remove"
                  onClick={() => remove(a.id)}
                  disabled={busy}
                  aria-label={t('common.delete')}
                  data-testid={`attachment-remove-${a.id}`}
                >
                  <Icon name="close" size={12} />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/** Submit, approve, return and cancel. */
function WorkflowPanel({
  session,
  progress,
  canWrite,
  canApprove,
  onReview,
  onChanged,
  onError,
}: {
  session: InspectionSessionDto;
  progress: InspectionProgressDto | null;
  canWrite: boolean;
  canApprove: boolean;
  onReview: () => void;
  onChanged: (s: InspectionSessionDto) => void;
  onError: (m: string) => void;
}) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);

  const act = async (fn: () => Promise<InspectionSessionDto>) => {
    setBusy(true);
    try {
      onChanged(await fn());
    } catch (e) {
      onError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const editable = ['DRAFT', 'IN_PROGRESS', 'REJECTED'].includes(session.status);
  const canSubmit = editable && (progress?.complete ?? false);

  return (
    <Card data-testid="inspection-workflow">
      <h2 className="oryx-h2 mb-2">{t('inspection.workflow')}</h2>
      <div className="flex flex-col gap-2 text-[12.5px]">
        <div className="flex items-center justify-between">
          <span className="oryx-faint">{t('inspection.progress')}</span>
          <span>{progress ? `${progress.sections.filter((s) => s.complete).length}/${progress.sections.length}` : '—'}</span>
        </div>
        {progress && !progress.complete ? (
          <p className="oryx-faint m-0" data-testid="inspection-outstanding">
            {t('inspection.outstanding')}: {progress.outstanding.length}
          </p>
        ) : null}
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {editable && canWrite ? (
          <Button
            variant="primary"
            disabled={busy || !canSubmit}
            onClick={() => act(() => api.submitInspectionSession(session.id))}
            data-testid="inspection-submit"
          >
            <Icon name="check" size={14} />
            {t('inspection.submit')}
          </Button>
        ) : null}
        {session.status === 'PENDING_REVIEW' && canApprove ? (
          <Button variant="primary" disabled={busy} onClick={onReview} data-testid="inspection-review-open">
            <Icon name="clipboardCheck" size={14} />
            {t('inspection.review')}
          </Button>
        ) : null}
        {session.status !== 'APPROVED' && session.status !== 'CANCELLED' && canWrite ? (
          <Button disabled={busy} onClick={() => act(() => api.cancelInspectionSession(session.id))} data-testid="inspection-cancel">
            {t('inspection.cancel')}
          </Button>
        ) : null}
        {session.status === 'PENDING_REVIEW' && !canApprove ? (
          <p className="oryx-faint m-0 text-[12px]">{t('inspection.awaitingApprover')}</p>
        ) : null}
      </div>
    </Card>
  );
}

function ReviewModal({
  sessionId,
  onClose,
  onDone,
}: {
  sessionId: string;
  onClose: () => void;
  onDone: (s: InspectionSessionDto) => void;
}) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const decide = async (decision: 'APPROVE' | 'REJECT') => {
    setBusy(true);
    setError(null);
    try {
      onDone(await api.reviewInspectionSession(sessionId, decision, notes || undefined));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={t('inspection.review')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button disabled={busy} onClick={() => decide('REJECT')} data-testid="inspection-return">
            {t('inspection.return')}
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => decide('APPROVE')} data-testid="inspection-approve">
            {t('inspection.approve')}
          </Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <Field label={t('inspection.reviewNotes')}>
        <textarea
          className="oryx-input oryx-textarea"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          data-testid="inspection-review-notes"
        />
      </Field>
    </Modal>
  );
}
