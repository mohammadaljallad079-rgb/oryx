'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  BODY_DIAGRAM_ID,
  BODY_GLASS_PATHS,
  BODY_PANELS,
  BODY_SEAM_PATHS,
  BODY_SILHOUETTE,
  BODY_VIEWBOX,
  BODY_WHEELS,
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

/** The drawn vehicle elevation, shared with the printed report. */
function BodyArt() {
  return (
    <svg viewBox={`0 0 ${BODY_VIEWBOX.width} ${BODY_VIEWBOX.height}`} className="oryx-diagram__svg" aria-hidden="true">
      <path className="oryx-diagram__body" d={BODY_SILHOUETTE} />
      {BODY_GLASS_PATHS.map((d) => (
        <path key={d} className="oryx-diagram__glass" d={d} />
      ))}
      {BODY_PANELS.map((p) => (
        <path key={p.key} className="oryx-diagram__panel" d={p.d} />
      ))}
      {BODY_WHEELS.map((w) => (
        <g key={`${w.cx}-${w.cy}`}>
          <circle className="oryx-diagram__wheel" cx={w.cx} cy={w.cy} r={w.r} />
          <circle className="oryx-diagram__rim" cx={w.cx} cy={w.cy} r={w.r * 0.45} />
        </g>
      ))}
      {BODY_SEAM_PATHS.map((d) => (
        <path key={d} className="oryx-diagram__seam" d={d} />
      ))}
    </svg>
  );
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
    const panel = bodyPanelAt(x, y);
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
      const panel = bodyPanelAt(x, y);
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
