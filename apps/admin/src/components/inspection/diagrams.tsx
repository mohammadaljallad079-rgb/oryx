'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  BODY_DIAGRAM_ID,
  CHASSIS_DIAGRAM_ID,
  CHASSIS_OUTLINE,
  CHASSIS_REGIONS,
  CHASSIS_STRUCTURE_PATHS,
  CHASSIS_VIEWBOX,
  CHASSIS_ZONE_COLORS,
  CHASSIS_ZONES,
  INSPECTION_MARKER_COLORS,
  PAINT_CONDITIONS,
  bodyPanelAt,
  paintConditionSpec,
  type ChassisRegionKey,
  type PaintCondition,
} from '@oryx/shared';
import { Icon } from '@/components/icons';

/**
 * The two interactive inspection diagrams.
 *
 * Both drawings come from `@oryx/shared/inspection-diagram`, the same geometry
 * the official PDF template renders. That is the invariant that matters: a
 * marker the inspector places on screen lands on the same panel of the same
 * drawing in the printed report, because there is only one drawing.
 *
 * Positions are stored as normalised coordinates (0–1 of the drawing's viewBox)
 * rather than pixels, so a marker placed on a phone sits on the same panel on a
 * tablet and reopens at the exact position it was saved at, whatever the zoom,
 * the window size or the text direction.
 *
 * Both are controlled components: the parent owns the value and persists it, so
 * there is one source of truth. Undo/redo is kept here, next to the edits it
 * reverses, because the parent never needs to know a drag happened in steps.
 *
 * Pointer events are used throughout, which covers mouse, pen and touch with one
 * code path — an inspector may be working on a tablet in the workshop.
 */

const clamp01 = (v: number) => (Number.isNaN(v) ? 0 : Math.min(1, Math.max(0, v)));

/**
 * The marker colours are the fixed technical inspection indicators, shared with
 * the PDF. They deliberately do not follow the theme: a green paint dot must
 * read green on a light form, a dark form and the printed page alike.
 */
const conditionColor = (key: PaintCondition) => INSPECTION_MARKER_COLORS[paintConditionSpec(key).color];

export interface PaintMarker {
  id?: string;
  condition: PaintCondition;
  x: number;
  y: number;
  panelKey?: string | null;
  note?: string | null;
}

const markerKey = (m: PaintMarker, i: number) => m.id ?? `local-${i}`;

/**
 * A small undo/redo history over an immutable list value.
 *
 * A drag emits a stream of intermediate positions, so the caller commits a
 * transaction once at the end rather than on every pointer move; otherwise a
 * single drag would fill the history and undo would walk back pixel by pixel.
 */
function useHistory<T>(value: T, apply: (next: T) => void) {
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const [, bump] = useState(0);
  const valueRef = useRef(value);
  valueRef.current = value;

  const commit = useCallback(
    (next: T) => {
      past.current = [...past.current, valueRef.current];
      future.current = [];
      apply(next);
      bump((n) => n + 1);
    },
    [apply],
  );

  /** Snapshot the value before a multi-step gesture (a drag). */
  const begin = useCallback(() => valueRef.current, []);
  const end = useCallback((before: T) => {
    if (before === valueRef.current) return;
    past.current = [...past.current, before];
    future.current = [];
    bump((n) => n + 1);
  }, []);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (prev === undefined) return;
    future.current = [valueRef.current, ...future.current];
    apply(prev);
    bump((n) => n + 1);
  }, [apply]);

  const redo = useCallback(() => {
    const [next, ...rest] = future.current;
    if (next === undefined) return;
    future.current = rest;
    past.current = [...past.current, valueRef.current];
    apply(next);
    bump((n) => n + 1);
  }, [apply]);

  return { commit, begin, end, undo, redo, canUndo: past.current.length > 0, canRedo: future.current.length > 0 };
}

/**
 * The approved ORYX body-panel diagnostic scheme, from the owner's reference
 * form (`oryx out put.pdf` page 2).
 *
 * This is the authentic artwork itself, not a reconstruction: the file is the
 * approved image extracted from the reference PDF (with its alpha mask), so the
 * form and the reference document show the same vehicle. It is served from
 * `/inspection/body-scheme.png` and drawn with `object-fit: contain`, which
 * keeps the approved proportions at any screen size.
 */
const BODY_SCHEME_SRC = '/inspection/body-scheme.png';

function BodyArt() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="oryx-diagram__art" src={BODY_SCHEME_SRC} alt="" aria-hidden="true" draggable={false} />
  );
}

/**
 * Map a point on the authentic artwork to the shared panel geometry.
 *
 * The canvas shows the approved drawing edge to edge, so a normalised point is
 * a fraction of the artwork. `bodyPanelAt` was authored against the older
 * `BODY_VIEWBOX`, where the vehicle sat inside a margin, so the point is remapped
 * from the artwork's vehicle box onto that viewBox's vehicle box before the hit
 * test. The marker itself keeps its artwork coordinates, so it reopens exactly
 * where the inspector dropped it.
 */
const ART_VEHICLE = { x0: 0.0186, x1: 0.9783, y0: 0.0138, y1: 0.9839 } as const;
const VB_VEHICLE = { x0: 0.0885, x1: 0.9038, y0: 0.058, y1: 0.858 } as const;

function artworkToPanelSpace(x: number, y: number): { x: number; y: number } {
  const mx =
    VB_VEHICLE.x0 +
    ((x - ART_VEHICLE.x0) / (ART_VEHICLE.x1 - ART_VEHICLE.x0)) * (VB_VEHICLE.x1 - VB_VEHICLE.x0);
  const my =
    VB_VEHICLE.y0 +
    ((y - ART_VEHICLE.y0) / (ART_VEHICLE.y1 - ART_VEHICLE.y0)) * (VB_VEHICLE.y1 - VB_VEHICLE.y0);
  return { x: mx, y: my };
}

export function BodyDiagram({
  value,
  onChange,
  disabled,
  labels,
}: {
  value: PaintMarker[];
  onChange: (next: PaintMarker[]) => void;
  disabled?: boolean;
  labels: {
    tools: string;
    selected: string;
    remove: string;
    empty: string;
    condition: string;
    undo: string;
    redo: string;
    clear: string;
    clearConfirm: string;
    canvas: string;
  };
}) {
  const [tool, setTool] = useState<PaintCondition>('PAINT');
  const [selected, setSelected] = useState<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const { commit, begin, end, undo, redo, canUndo, canRedo } = useHistory(value, onChange);

  const pointFrom = (clientX: number, clientY: number) => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return { x: 0, y: 0 };
    return { x: clamp01((clientX - box.left) / box.width), y: clamp01((clientY - box.top) / box.height) };
  };

  const addAt = (clientX: number, clientY: number) => {
    if (disabled) return;
    const { x, y } = pointFrom(clientX, clientY);
    const p = artworkToPanelSpace(x, y);
    const panel = bodyPanelAt(p.x, p.y);
    const next = [...valueRef.current, { condition: tool, x, y, panelKey: panel?.key ?? null }];
    commit(next);
    setSelected(next.length - 1);
  };

  const startDrag = (index: number) => (e: React.PointerEvent) => {
    if (disabled) return;
    e.stopPropagation();
    e.preventDefault();
    setSelected(index);
    const before = begin();
    const onMove = (ev: PointerEvent) => {
      const { x, y } = pointFrom(ev.clientX, ev.clientY);
      const p = artworkToPanelSpace(x, y);
      const panel = bodyPanelAt(p.x, p.y);
      onChange(valueRef.current.map((m, i) => (i === index ? { ...m, x, y, panelKey: panel?.key ?? null } : m)));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      end(before);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const setSelectedCondition = (condition: PaintCondition) => {
    if (selected === null) return;
    commit(value.map((m, i) => (i === selected ? { ...m, condition } : m)));
  };

  const removeSelected = () => {
    if (selected === null) return;
    commit(value.filter((_, i) => i !== selected));
    setSelected(null);
  };

  const clearAll = () => {
    if (disabled || value.length === 0) return;
    if (!window.confirm(labels.clearConfirm)) return;
    commit([]);
    setSelected(null);
  };

  return (
    <div className="oryx-diagram" data-testid="paint-diagram" data-diagram-id={BODY_DIAGRAM_ID}>
      <div className="oryx-diagram__tools" role="group" aria-label={labels.tools}>
        {PAINT_CONDITIONS.map((c) => (
          <button
            key={c.key}
            type="button"
            className={`oryx-paint-tool${tool === c.key ? ' is-active' : ''}`}
            aria-pressed={tool === c.key}
            onClick={() => setTool(c.key)}
            disabled={disabled}
            data-testid={`paint-tool-${c.key}`}
          >
            <span className="oryx-paint-tool__dot" style={{ background: conditionColor(c.key) }}>
              {c.cross ? '✕' : ''}
            </span>
            <span className="oryx-paint-tool__label">{c.labelEn}</span>
            <span className="oryx-paint-tool__label-rtl">{c.labelAr}</span>
          </button>
        ))}
        <span className="oryx-diagram__spacer" />
        <button
          type="button"
          className="oryx-btn oryx-btn--sm oryx-btn--ghost"
          onClick={undo}
          disabled={disabled || !canUndo}
          aria-label={labels.undo}
          title={labels.undo}
          data-testid="paint-undo"
        >
          <Icon name="chevronsLeft" size={14} />
          {labels.undo}
        </button>
        <button
          type="button"
          className="oryx-btn oryx-btn--sm oryx-btn--ghost"
          onClick={redo}
          disabled={disabled || !canRedo}
          aria-label={labels.redo}
          title={labels.redo}
          data-testid="paint-redo"
        >
          <Icon name="chevronsRight" size={14} />
          {labels.redo}
        </button>
        <button
          type="button"
          className="oryx-btn oryx-btn--sm oryx-btn--ghost"
          onClick={clearAll}
          disabled={disabled || value.length === 0}
          aria-label={labels.clear}
          title={labels.clear}
          data-testid="paint-clear"
        >
          <Icon name="close" size={14} />
          {labels.clear}
        </button>
      </div>

      <div
        className="oryx-diagram__canvas oryx-diagram__canvas--body"
        ref={boxRef}
        onPointerDown={(e) => addAt(e.clientX, e.clientY)}
        data-testid="paint-canvas"
        role="application"
        aria-label={labels.canvas}
      >
        <BodyArt />
        {value.map((m, i) => (
          <button
            key={markerKey(m, i)}
            type="button"
            className={`oryx-diagram__marker${selected === i ? ' is-selected' : ''}`}
            style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%`, background: conditionColor(m.condition) }}
            onPointerDown={startDrag(i)}
            onFocus={() => setSelected(i)}
            disabled={disabled}
            aria-label={`${m.condition} at ${(m.x * 100).toFixed(0)}%, ${(m.y * 100).toFixed(0)}%`}
            data-testid={`paint-marker-${i}`}
            data-condition={m.condition}
            data-panel={m.panelKey ?? ''}
          >
            {paintConditionSpec(m.condition).cross ? '✕' : ''}
          </button>
        ))}
      </div>

      <div className="oryx-diagram__footer">
        <span className="oryx-faint text-[11.5px]">{labels.empty}</span>
        {selected !== null ? (
          <div className="oryx-diagram__selected" data-testid="paint-marker-editor">
            <span className="oryx-label m-0">{labels.selected}</span>
            <select
              className="oryx-select"
              value={value[selected]?.condition ?? 'PAINT'}
              onChange={(e) => setSelectedCondition(e.target.value as PaintCondition)}
              disabled={disabled}
              aria-label={labels.condition}
              data-testid="paint-marker-condition"
            >
              {PAINT_CONDITIONS.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.labelEn} / {c.labelAr}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="oryx-btn oryx-btn--sm oryx-btn--ghost"
              onClick={removeSelected}
              disabled={disabled}
              data-testid="paint-marker-remove"
            >
              <Icon name="close" size={14} />
              {labels.remove}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export interface ChassisRegionValue {
  regionKey: ChassisRegionKey;
  condition: 'UNSET' | 'OK' | 'DAMAGE';
  note?: string | null;
}

/** Plan view of the underbody with the eight assessed zones, drawn from shared geometry. */
export function ChassisDiagram({
  value,
  onChange,
  disabled,
  labels,
}: {
  value: ChassisRegionValue[];
  onChange: (next: ChassisRegionValue[]) => void;
  disabled?: boolean;
  labels: { ok: string; damage: string; clear: string };
}) {
  const [tool, setTool] = useState<'OK' | 'DAMAGE'>('OK');
  const byKey = useMemo(() => new Map(value.map((r) => [r.regionKey, r])), [value]);

  const apply = (regionKey: ChassisRegionKey, condition: 'UNSET' | 'OK' | 'DAMAGE') => {
    if (disabled) return;
    const existing = byKey.get(regionKey);
    const next = existing
      ? value.map((r) => (r.regionKey === regionKey ? { ...r, condition } : r))
      : [...value, { regionKey, condition }];
    onChange(next);
  };

  const regionFill = (key: ChassisRegionKey) => {
    const c = byKey.get(key)?.condition ?? 'UNSET';
    return CHASSIS_ZONE_COLORS[c] ?? undefined;
  };

  return (
    <div className="oryx-diagram" data-testid="chassis-diagram" data-diagram-id={CHASSIS_DIAGRAM_ID}>
      <div className="oryx-diagram__tools" role="group">
        <button
          type="button"
          className={`oryx-paint-tool${tool === 'OK' ? ' is-active' : ''}`}
          aria-pressed={tool === 'OK'}
          onClick={() => setTool('OK')}
          disabled={disabled}
          data-testid="chassis-tool-OK"
        >
          <span className="oryx-paint-tool__dot" style={{ background: INSPECTION_MARKER_COLORS.green }} />
          <span className="oryx-paint-tool__label">{labels.ok}</span>
        </button>
        <button
          type="button"
          className={`oryx-paint-tool${tool === 'DAMAGE' ? ' is-active' : ''}`}
          aria-pressed={tool === 'DAMAGE'}
          onClick={() => setTool('DAMAGE')}
          disabled={disabled}
          data-testid="chassis-tool-DAMAGE"
        >
          <span className="oryx-paint-tool__dot" style={{ background: INSPECTION_MARKER_COLORS.red }} />
          <span className="oryx-paint-tool__label">{labels.damage}</span>
        </button>
      </div>

      <div className="oryx-chassis" data-testid="chassis-canvas">
        <svg viewBox={`0 0 ${CHASSIS_VIEWBOX.width} ${CHASSIS_VIEWBOX.height}`} className="oryx-diagram__svg">
          <path className="oryx-chassis__outline" d={CHASSIS_OUTLINE} />
          {CHASSIS_STRUCTURE_PATHS.map((d) => (
            <path key={d} className="oryx-diagram__seam" d={d} />
          ))}
          {CHASSIS_ZONES.map((z, idx) => {
            const condition = byKey.get(z.key)?.condition ?? 'UNSET';
            const spec = CHASSIS_REGIONS.find((r) => r.key === z.key);
            return (
              <g
                key={z.key}
                className={`oryx-chassis-zone is-${condition.toLowerCase()}`}
                data-testid={`chassis-region-${z.key}`}
                data-condition={condition}
                role="button"
                tabIndex={disabled ? -1 : 0}
                aria-label={`${spec?.labelEn ?? z.key}: ${condition}`}
                onClick={() => apply(z.key as ChassisRegionKey, tool)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    apply(z.key as ChassisRegionKey, tool);
                  }
                }}
                style={{ cursor: disabled ? 'default' : 'pointer' }}
              >
                <path d={z.d} fill={regionFill(z.key as ChassisRegionKey) ?? 'transparent'} />
                <text x={z.labelX} y={z.labelY} className="oryx-chassis-zone__num">
                  {idx + 1}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="oryx-chassis-list" data-testid="chassis-controls">
        {CHASSIS_REGIONS.map((r) => {
          const current = byKey.get(r.key)?.condition ?? 'UNSET';
          return (
            <div key={r.key} className="oryx-chassis-list__row">
              <span className="oryx-chassis-list__name">
                {r.labelEn} <span className="oryx-faint">{r.labelAr}</span>
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  className={`oryx-btn oryx-btn--sm${current === 'OK' ? ' oryx-btn--primary' : ''}`}
                  onClick={() => apply(r.key, 'OK')}
                  disabled={disabled}
                  data-testid={`chassis-ok-${r.key}`}
                >
                  {labels.ok}
                </button>
                <button
                  type="button"
                  className={`oryx-btn oryx-btn--sm${current === 'DAMAGE' ? ' oryx-btn--primary' : ''}`}
                  onClick={() => apply(r.key, 'DAMAGE')}
                  disabled={disabled}
                  data-testid={`chassis-damage-${r.key}`}
                >
                  {labels.damage}
                </button>
                <button
                  type="button"
                  className="oryx-btn oryx-btn--sm oryx-btn--ghost"
                  onClick={() => apply(r.key, 'UNSET')}
                  disabled={disabled || current === 'UNSET'}
                  aria-label={`${labels.clear} ${r.labelEn}`}
                  data-testid={`chassis-clear-${r.key}`}
                >
                  <Icon name="close" size={12} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
