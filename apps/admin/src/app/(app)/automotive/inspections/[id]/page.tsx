'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { INSPECTION_TYPES, inspectionSectionSpec, sectionsForReportPage, type InspectionSectionKey, type InspectionTypeKey } from '@oryx/shared';
import type {
  InspectionSessionDto,
  InspectionProgressDto,
  InspectionItemResultDto,
  InspectionResultValue,
  InspectionAttachmentDto,
  InspectionServiceDto,
} from '@oryx/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { Icon } from '@/components/icons';
import { Badge, Button, Card, ErrorBanner, Field, Modal, SectionHeader, Skeleton, StatusBadge } from '@/components/ui';
import { BodyDiagram, ChassisDiagram, type ChassisRegionValue, type PaintMarker } from '@/components/inspection/diagrams';
import { DocumentsPanel } from '@/components/documents-panel';
import { inspectionFieldLabelParts, INSPECTION_COVER_ROWS, INSPECTION_VEHICLE_INFO, type InspectionIdentityKey } from '@/lib/inspection-fields';

/**
 * The sections the report's shared interior/exterior/engine/road page carries.
 *
 * Derived from the report's own page plan rather than a second list, so the
 * general-remarks input appears exactly when the printed document carries the
 * remarks block it feeds.
 */
const GROUP_PAGE_AREAS = sectionsForReportPage(4).map((s) => s.key);

/**
 * The inspection workspace.
 *
 * One page per inspection, with a rail of the sections the customer actually
 * bought. A section that was not selected is never rendered and never sent, which
 * is what keeps a paint-only job from asking about the engine.
 */
export default function InspectionWorkspacePage() {
  const { t, locale } = useUi();
  const { can } = useAuth();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [session, setSession] = useState<InspectionSessionDto | null>(null);
  const [progress, setProgress] = useState<InspectionProgressDto | null>(null);
  const [active, setActive] = useState<InspectionSectionKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [bundleLoading, setBundleLoading] = useState(false);
  const [billingOpen, setBillingOpen] = useState(false);
  const [billingServices, setBillingServices] = useState<InspectionServiceDto[]>([]);
  const [selectedBillingIds, setSelectedBillingIds] = useState<string[]>([]);
  const [billingSaving, setBillingSaving] = useState(false);
  const [docsKey, setDocsKey] = useState(0);

  useEffect(() => {
    if (!billingOpen) return;
    let active = true;
    void api.inspectionServices().then(result => {
      if (active) setBillingServices(result.items.filter(item => item.isActive && item.priceMinor > 0));
    }).catch(err => {
      if (active) setError(err instanceof Error ? err.message : t('common.error'));
    });
    return () => { active = false; };
  }, [billingOpen, t]);

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
            {!session.bookingId && !session.invoiceId && ['PENDING_REVIEW', 'APPROVED'].includes(session.status) && canApprove ? (
              <Button onClick={() => { setSelectedBillingIds(session.billingServiceIds ?? []); setBillingOpen(true); }}
                data-testid="inspection-set-billing-services">
                {locale === 'ar' ? 'تحديد خدمات الفاتورة' : 'Set invoice services'}
              </Button>
            ) : null}
            {session.status === 'APPROVED' && can('erp.sales.read') && can('erp.inspection.read') ? (
              <Button disabled={bundleLoading} data-testid="inspection-download-bundle" onClick={async () => {
                setBundleLoading(true);
                setError(null);
                try {
                  const url = await api.inspectionBundleBlobUrl(id);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${session.jobNumber}-invoice-and-inspection.pdf`;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
                } catch (e) {
                  setError(e instanceof Error ? e.message : t('common.error'));
                } finally {
                  setBundleLoading(false);
                }
              }}>
                <Icon name="file" size={14} />
                {bundleLoading ? t('common.loading') : 'Invoice + Inspection PDF'}
              </Button>
            ) : null}
            <Button onClick={load} data-testid="inspection-refresh">
              <Icon name="refresh" size={14} />
              {t('common.refresh')}
            </Button>
          </div>
        }
      />

      {error ? <ErrorBanner message={error} /> : null}
      {billingOpen ? (
        <Modal open title={locale === 'ar' ? 'خدمات الفحص للفاتورة' : 'Inspection invoice services'}
          onClose={() => setBillingOpen(false)}
          footer={<>
            <Button onClick={() => setBillingOpen(false)}>{t('common.cancel')}</Button>
            <Button variant="primary" disabled={billingSaving || selectedBillingIds.length === 0}
              data-testid="inspection-save-billing-services"
              onClick={async () => {
                setBillingSaving(true);
                setError(null);
                try {
                  const updated = await api.setInspectionBillingServices(id, selectedBillingIds);
                  applySession(updated);
                  setBillingOpen(false);
                } catch (err) { setError(err instanceof Error ? err.message : t('common.error')); }
                finally { setBillingSaving(false); }
              }}>{billingSaving ? t('common.loading') : t('common.save')}</Button>
          </>}>
          <p className="oryx-faint text-xs">{locale === 'ar'
            ? 'حدد الخدمات والأسعار الفعلية قبل إصدار الفاتورة. لا تُقبل خدمات بلا سعر.'
            : 'Select actual priced services before invoicing. Unpriced services cannot be billed.'}</p>
          <div className="flex flex-col gap-2">
            {billingServices.map(service => (
              <label key={service.id} className="flex items-center gap-2 rounded-lg border border-[var(--border)] p-3">
                <input className="oryx-checkbox" type="checkbox" checked={selectedBillingIds.includes(service.id)}
                  onChange={event => setSelectedBillingIds(current => event.target.checked
                    ? [...current, service.id] : current.filter(value => value !== service.id))} />
                <span>{locale === 'ar' ? service.nameAr || service.nameEn : service.nameEn || service.nameAr} — {service.priceMinor / 1000} BHD</span>
              </label>
            ))}
          </div>
        </Modal>
      ) : null}

      <IdentityCard session={session} />

      {progress ? <ProgressRail progress={progress} active={active} onSelect={setActive} /> : null}

      <TypesCard
        session={session}
        editable={editable && canWrite}
        onSaved={(s) => {
          applySession(s);
          setActive((prev) => (prev && s.selectedAreas.includes(prev) ? prev : s.selectedAreas[0] ?? null));
        }}
        onError={setError}
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          {spec && section ? (
            GROUP_PAGE_AREAS.includes(spec.key) ? (
              // The four grouped checks share one form and one Save; the rail
              // selection opens the group rather than a single section.
              <GroupedSectionsEditor
                key="group"
                sessionId={id}
                areas={GROUP_PAGE_AREAS.filter((a) => session.selectedAreas.includes(a))}
                session={session}
                editable={editable && canWrite}
                onSaved={applySession}
                onError={setError}
              />
            ) : (
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
            )
          ) : (
            <Card>{t('inspection.noSections')}</Card>
          )}
          {/* Each selected inspection section owns its notes and Save action.
              Do not render a second global notes box below the active form. */}
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

      {session.status === 'APPROVED' ? (
        <DocumentsPanel
          sourceType="InspectionSession"
          sourceId={id}
          refreshKey={docsKey}
          actions={
            canWrite ? (
              <Button
                variant="primary"
                size="sm"
                disabled={issuing}
                data-testid="inspection-issue-report"
                onClick={async () => {
                  setIssuing(true);
                  setIssueError(null);
                  try {
                    await api.issueInspectionDocument(id);
                    setDocsKey((k) => k + 1);
                  } catch (e) {
                    setIssueError(e instanceof Error ? e.message : t('common.error'));
                  } finally {
                    setIssuing(false);
                  }
                }}
              >
                <Icon name="scroll" size={14} />
                {t('documents.issueReport')}
              </Button>
            ) : null
          }
        />
      ) : (
        <Card>
          <p className="oryx-faint m-0 text-[12.5px]" data-testid="inspection-report-locked">
            {t('documents.approvedOnly')}
          </p>
        </Card>
      )}

      {issueError ? <ErrorBanner message={issueError} /> : null}

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

/**
 * The identification panel, laid out as the report's cover prints it.
 *
 * The report's cover is the source of truth for this block: it carries eleven
 * fields (Customer Name, Contact No., Date & Time, Job No., Plate No., Car
 * Make, Car Model, Car Year, ODO Meter, Car Color, VIN Number). The workspace
 * shows the same eleven values under the same bilingual labels, so an operator
 * reads on screen exactly the identification the issued report will carry.
 */
function IdentityCard({ session }: { session: InspectionSessionDto }) {
  const values: Record<InspectionIdentityKey, string> = {
    customerName: session.customerName,
    contactNumber: session.contactNumber ?? '—',
    inspectedAt: new Date(session.inspectedAt).toLocaleString(),
    jobNumber: session.jobNumber,
    plateNumber: session.plateNumber ?? '—',
    make: session.make,
    model: session.model,
    modelYear: String(session.modelYear),
    odometer: session.odometer !== null ? `${session.odometer.toLocaleString()} km` : '—',
    color: session.color ?? '—',
    vin: session.vin,
  };
  return (
    <div className="oryx-doc-form__cover">
      <div className="oryx-doc-form__cover-band">
        <span>
          {INSPECTION_VEHICLE_INFO.ar}
          <span className="ltr">{INSPECTION_VEHICLE_INFO.en}</span>
        </span>
      </div>
      <div className="oryx-doc-form__cover-grid" data-testid="inspection-identity">
        {INSPECTION_COVER_ROWS.flat().map(({ key, span }) => {
          const label = inspectionFieldLabelParts(key);
          const wide = span === 2 ? ' oryx-doc-form__cover-cell--wide' : '';
          const value = values[key];
          return (
            <div key={key} className={`oryx-doc-form__cover-cell${wide}`}>
              <span className="oryx-doc-form__cover-label">
                <span className="ltr">{label.en}</span>
                <span className="var">{label.ar}</span>
              </span>
              <span className="truncate text-[13.5px] font-semibold" title={value}>
                {value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The inspection types the job covers, editable while it is still a draft.
 *
 * A job is created from a set of types, but the operator often learns about an
 * extra check after the customer arrives. Adding a type here extends the stored
 * areas (`updateInspectionSession`) and the API creates the new sections with
 * their own empty data, so the rail, the progress and the report all pick them up.
 * A type can only be added or removed before approval — an approved report is a
 * frozen document.
 */
function TypesCard({
  session,
  editable,
  onSaved,
  onError,
}: {
  session: InspectionSessionDto;
  editable: boolean;
  onSaved: (s: InspectionSessionDto) => void;
  onError: (message: string) => void;
}) {
  const { t, locale } = useUi();
  const [busy, setBusy] = useState(false);
  const selected = new Set<InspectionTypeKey>(session.selectedTypes);

  const persist = async (nextTypes: InspectionTypeKey[]) => {
    if (nextTypes.length === 0) {
      onError(t('inspection.selectTypesHint'));
      return;
    }
    setBusy(true);
    try {
      onSaved(await api.updateInspectionSession(session.id, { selectedTypes: nextTypes }));
    } catch (e) {
      onError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (key: InspectionTypeKey) => {
    const next = new Set(selected);
    if (next.has(key)) {
      if (!window.confirm(t('inspection.removeTypeConfirm'))) return;
      next.delete(key);
    } else {
      next.add(key);
    }
    void persist(INSPECTION_TYPES.filter((spec) => next.has(spec.key)).map((spec) => spec.key));
  };

  return (
    <Card data-testid="inspection-types">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="oryx-h2 m-0">{t('inspection.addTypes')}</h2>
        <span className="oryx-faint text-[12px]">{t('inspection.addTypesHint')}</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2" data-testid="inspection-types-list">
        {INSPECTION_TYPES.map((spec) => {
          const on = selected.has(spec.key);
          return (
            <label
              key={spec.key}
              className={`oryx-job-type${on ? ' is-selected' : ''}`}
              data-testid={`type-${spec.key}`}
              data-selected={on}
            >
              <input
                type="checkbox"
                checked={on}
                disabled={!editable || busy}
                onChange={() => toggle(spec.key)}
                data-testid={`type-toggle-${spec.key}`}
              />
              <span>
                <span className="block font-semibold">{locale === 'ar' ? spec.labelAr : spec.labelEn}</span>
                <span className="oryx-faint block text-[11.5px]">{locale === 'ar' ? spec.summaryAr : spec.summaryEn}</span>
              </span>
            </label>
          );
        })}
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
 * The combined form for the report's shared interior/exterior/engine/road page.
 *
 * The approved report prints those four checks on one sheet, so the operator
 * fills them in as one form and expects one Save. Each area keeps its own
 * checklist, "nothing to report" checkbox and remarks box, but the four are
 * written by a single request (`saveInspectionSections`), which the API applies
 * in one transaction — a partially answered form can never be left half-saved.
 */
function GroupedSectionsEditor({
  sessionId,
  areas,
  session,
  editable,
  onSaved,
  onError,
}: {
  sessionId: string;
  areas: InspectionSectionKey[];
  session: InspectionSessionDto;
  editable: boolean;
  onSaved: (s: InspectionSessionDto) => void;
  onError: (message: string) => void;
}) {
  const { t, locale } = useUi();
  const [busy, setBusy] = useState(false);
  type AreaState = { remarks: string; noFindings: boolean; results: Record<string, InspectionItemResultDto> };
  const initial = (): Record<string, AreaState> =>
    Object.fromEntries(
      areas.map((area) => {
        const section = session.sections.find((s) => s.area === area);
        return [
          area,
          {
            remarks: section?.remarks ?? '',
            noFindings: section?.noFindings ?? false,
            results: Object.fromEntries((section?.items ?? []).map((i) => [i.itemKey, i])),
          },
        ];
      }),
    );
  const [state, setState] = useState<Record<string, AreaState>>(initial);

  useEffect(() => {
    setState(initial());
    // Re-sync when the server returns a fresh session (a save, or a reload).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const emptyAreaState = (): AreaState => ({ remarks: '', noFindings: false, results: {} });

  const patch = (area: InspectionSectionKey, next: Partial<AreaState>) =>
    setState((prev) => ({ ...prev, [area]: { ...(prev[area] ?? emptyAreaState()), ...next } }));

  const setResult = (area: InspectionSectionKey, itemKey: string, result: InspectionResultValue) =>
    setState((prev) => ({
      ...prev,
      [area]: {
        ...(prev[area] ?? emptyAreaState()),
        results: {
          ...(prev[area] ?? emptyAreaState()).results,
          [itemKey]: { itemKey, result, note: (prev[area] ?? emptyAreaState()).results[itemKey]?.note ?? null },
        },
      },
    }));

  const saveAll = async () => {
    setBusy(true);
    try {
      const payload = areas.map((area) => {
        const spec = inspectionSectionSpec(area);
        return {
          area,
          remarks: state[area].remarks,
          noFindings: state[area].noFindings,
          items: spec.items.map(
            (item) =>
              state[area].results[item.key] ?? { itemKey: item.key, result: 'UNSET' as InspectionResultValue, note: null },
          ),
        };
      });
      onSaved(await api.saveInspectionSections(sessionId, payload));
    } catch (e) {
      onError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card data-testid="inspection-group-form">
      <div className="mb-3">
        <h2 className="oryx-h2 m-0">{t('inspection.groupTitle')}</h2>
        <p className="oryx-faint m-0 text-[12px]">{t('inspection.groupHint')}</p>
      </div>

      <div className="flex flex-col gap-5">
        {areas.map((area) => {
          const spec = inspectionSectionSpec(area);
          const section = session.sections.find((s) => s.area === area);
          // The selected-area set can grow while this editor is mounted. React
          // renders once before the session-sync effect runs, so supply an empty
          // state for newly added sections instead of dereferencing undefined.
          const areaState = state[area] ?? emptyAreaState();
          return (
            <div key={area} className="oryx-group-section" data-testid={`group-section-${area}`}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="m-0 text-[14px] font-semibold">{locale === 'ar' ? spec.labelAr : spec.labelEn}</h3>
                  <p className="oryx-faint m-0 text-[11.5px]">{locale === 'ar' ? spec.summaryAr : spec.summaryEn}</p>
                </div>
                {section?.completedAt ? <Badge tone="success">{t('inspection.sectionComplete')}</Badge> : null}
              </div>

              <div className="oryx-checklist" data-testid={`checklist-${area}`}>
                {spec.items.map((item) => {
                  const current = areaState.results[item.key]?.result ?? 'UNSET';
                  const options: InspectionResultValue[] =
                    spec.resultSet === 'PASS_FAIL' ? ['PASS', 'FAIL'] : ['PASS', 'FAIL', 'NA'];
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
                            onClick={() => setResult(area, item.key, opt)}
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

              <label className="mt-3 flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={areaState.noFindings}
                  disabled={!editable || busy}
                  onChange={(e) => patch(area, { noFindings: e.target.checked })}
                  data-testid={`no-findings-${area}`}
                />
                {t('inspection.nothingToReport')}
              </label>

              <Field label={locale === 'ar' ? spec.remarksLabelAr : spec.remarksLabelEn}>
                <textarea
                  className="oryx-input oryx-textarea"
                  rows={2}
                  value={areaState.remarks}
                  disabled={!editable || busy}
                  onChange={(e) => patch(area, { remarks: e.target.value })}
                  data-testid={`remarks-${area}`}
                />
              </Field>
            </div>
          );
        })}
      </div>

      {editable ? (
        <div className="mt-4 flex justify-end">
          <Button variant="primary" disabled={busy} onClick={saveAll} data-testid="save-sections-group">
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        </div>
      ) : null}
    </Card>
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
    run(async () => {
      const saved = await api.saveInspectionSection(sessionId, area, {
        remarks,
        noFindings,
        items: spec.items.map(
          (item) => results[item.key] ?? { itemKey: item.key, result: 'UNSET' as InspectionResultValue, note: null },
        ),
      });
      // The computer-unit form is notes-only. When the operator saves the final
      // completed section, submit it for review as part of this same action.
      // Keep the saved draft if other selected inspection areas are incomplete.
      if (spec.kind === 'DIAGNOSTIC') {
        const latest = await api.inspectionProgress(sessionId);
        if (latest.complete && ['DRAFT', 'IN_PROGRESS', 'REJECTED'].includes(saved.status)) {
          return api.submitInspectionSession(sessionId);
        }
      }
      return saved;
    });

  // One Save persists BOTH the diagram and its notes; previously the diagram
  // actions silently dropped remarks and the printed PDF could not show them.
  const saveDiagram = (diagram: 'paint' | 'chassis') => run(async () => {
    await api.saveInspectionSection(sessionId, area, { remarks, noFindings, items: [] });
    return diagram === 'paint'
      ? api.saveInspectionMarkers(sessionId, markers)
      : api.saveInspectionChassis(sessionId, regions);
  });
  const save = spec.kind === 'DIAGRAM_PAINT' ? () => saveDiagram('paint')
    : spec.kind === 'DIAGRAM_CHASSIS' ? () => saveDiagram('chassis') : saveItems;

  return (
    <Card data-testid={`inspection-section-${area}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="oryx-h2 m-0">{locale === 'ar' ? spec.labelAr : spec.labelEn}</h2>
          <p className="oryx-faint m-0 text-[12px]">{locale === 'ar' ? spec.summaryAr : spec.summaryEn}</p>
        </div>
        {section.completedAt ? <Badge tone="success">{t('inspection.sectionComplete')}</Badge> : null}
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
            undo: t('inspection.undo'),
            redo: t('inspection.redo'),
            clear: t('inspection.clearMarkers'),
            clearConfirm: t('inspection.clearMarkersConfirm'),
            canvas: t('inspection.bodyDiagram'),
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

      {/* The computer-unit section is a notes-and-upload form only. Attachments
          are provided by the existing AttachmentsPanel alongside this editor. */}
      {spec.kind !== 'DIAGNOSTIC' ? <label className="mt-3 flex items-center gap-2 text-[13px]">
        <input
          type="checkbox"
          checked={noFindings}
          disabled={!editable || busy}
          onChange={(e) => setNoFindings(e.target.checked)}
          data-testid={`no-findings-${area}`}
        />
        {t('inspection.nothingToReport')}
      </label> : null}

      <Field label={spec.kind === 'DIAGNOSTIC'
        ? (locale === 'ar' ? 'ملاحظات فحص وحدة الكمبيوتر' : 'Computer unit inspection notes')
        : (locale === 'ar' ? spec.remarksLabelAr : spec.remarksLabelEn)}>
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

  const upload = async (files: File[]) => {
    if (files.length === 0) return;
    const limit = 12 * 1024 * 1024;
    const supported = files.every((file) =>
      file.type === 'application/pdf' || file.type.startsWith('image/'));
    if (!supported) {
      onError(locale === 'ar' ? 'المرفقات المسموحة صور أو ملفات PDF فقط.' : 'Only images and PDF documents are allowed.');
      return;
    }
    if (files.some((file) => file.size > limit)) {
      onError(locale === 'ar'
        ? 'حجم الملف يتجاوز 12 ميغابايت. قم بتصغيره قبل الرفع.'
        : 'File exceeds the 12 MB upload limit. Please reduce the file size.');
      return;
    }
    setBusy(true);
    try {
      // One request per attachment: a multi-file multipart body must not
      // exceed the reverse proxy's request-size limit.
      for (const file of files) {
        const form = new FormData();
        form.append('file', file);
        if (area) form.append('sectionArea', area);
        await api.uploadInspectionAttachment(sessionId, form);
      }
      onSaved(await api.inspectionSession(sessionId));
    } catch (e) {
      const status = e instanceof Error ? e.message : '';
      onError(status.includes('413')
        ? (locale === 'ar'
          ? 'السيرفر رفض حجم الطلب (413). يجب مراجعة حد رفع الملفات في Nginx.'
          : 'The server rejected the upload (413). Check the Nginx body-size limit.')
        : e instanceof Error ? e.message : t('common.error'));
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
            accept="image/png,image/jpeg,image/webp,image/avif,application/pdf,.pdf"
            multiple
            className="oryx-input"
            disabled={busy}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length > 0) void upload(files);
              e.target.value = '';
            }}
            data-testid="attachment-input"
          />
          <p className="oryx-muted m-0 text-xs">
            {locale === 'ar' ? 'صور وملفات PDF، حتى 12 ميغابايت لكل ملف. يمكن اختيار عدة ملفات.' : 'Images and PDF files, up to 12 MB each. Multiple files supported.'}
          </p>
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
              ) : a.url ? (
                // A non-image attachment (a scanned diagnostic PDF, say) opens
                // from the list instead of rendering as a broken thumbnail.
                <a
                  className="oryx-attachment__file"
                  href={api.resolveImage(a.url) ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={a.originalName}
                  data-testid={`attachment-open-${a.id}`}
                >
                  <Icon name="scroll" size={18} />
                  <span className="truncate">{a.originalName}</span>
                </a>
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
