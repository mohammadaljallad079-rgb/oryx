'use client';

import { useRef, useState } from 'react';
import {
  CHASSIS_REGIONS,
  PAINT_CONDITIONS,
  paintConditionSpec,
  type ChassisRegionKey,
  type PaintCondition,
  type PaintConditionSpec,
} from '@oryx/shared';
import { Icon } from '@/components/icons';

/**
 * The two interactive inspection diagrams.
 *
 * Both store positions as normalised coordinates (0–1) rather than pixels, so a
 * marker placed on a phone sits on the same panel on a tablet and reopens at the
 * exact position it was saved at. Both are controlled components: the parent
 * owns the value and persists it, so there is one source of truth.
 *
 * Pointer events are used throughout, which covers mouse, pen and touch with one
 * code path — an inspector may be working on a tablet in the workshop.
 */

const clamp01 = (v: number) => (Number.isNaN(v) ? 0 : Math.min(1, Math.max(0, v)));

/**
 * The marker colours come from the shared condition spec, so the diagram, the
 * legend and the printed report cannot drift apart.
 */
const COLOR_TOKEN: Record<PaintConditionSpec['color'], string> = {
  green: 'var(--success)',
  orange: 'var(--warning)',
  red: 'var(--danger)',
};
const conditionColor = (key: PaintCondition) => COLOR_TOKEN[paintConditionSpec(key).color];

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
 * The body-panels diagnostic scheme.
 *
 * Pick a condition, then tap the panel. The marker appears at that exact point
 * and can be dragged, re-coloured or deleted. The diagram is a drawn side
 * elevation, not a photograph, because a photograph would not let the report
 * place a marker on a named panel.
 */
export function BodyDiagram({
  value,
  onChange,
  disabled,
  labels,
}: {
  value: PaintMarker[];
  onChange: (next: PaintMarker[]) => void;
  disabled?: boolean;
  labels: { tools: string; selected: string; remove: string; empty: string; condition: string };
}) {
  const [tool, setTool] = useState<PaintCondition>('PAINT');
  const [selected, setSelected] = useState<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  // The drag handler lives outside React's render cycle, so it reads the latest
  // value from a ref instead of a stale closure.
  const valueRef = useRef(value);
  valueRef.current = value;

  const pointFrom = (clientX: number, clientY: number) => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return { x: 0, y: 0 };
    return { x: clamp01((clientX - box.left) / box.width), y: clamp01((clientY - box.top) / box.height) };
  };

  const addAt = (clientX: number, clientY: number) => {
    if (disabled) return;
    const { x, y } = pointFrom(clientX, clientY);
    const next = [...valueRef.current, { condition: tool, x, y }];
    setSelected(next.length - 1);
    onChange(next);
  };

  const startDrag = (index: number) => (e: React.PointerEvent) => {
    if (disabled) return;
    e.stopPropagation();
    e.preventDefault();
    setSelected(index);
    const onMove = (ev: PointerEvent) => {
      const { x, y } = pointFrom(ev.clientX, ev.clientY);
      onChange(valueRef.current.map((m, i) => (i === index ? { ...m, x, y } : m)));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const setSelectedCondition = (condition: PaintCondition) => {
    if (selected === null) return;
    onChange(value.map((m, i) => (i === selected ? { ...m, condition } : m)));
  };

  const removeSelected = () => {
    if (selected === null) return;
    onChange(value.filter((_, i) => i !== selected));
    setSelected(null);
  };

  return (
    <div className="oryx-diagram" data-testid="paint-diagram">
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
      </div>

      <div
        className="oryx-diagram__canvas oryx-diagram__canvas--body"
        ref={boxRef}
        onPointerDown={(e) => addAt(e.clientX, e.clientY)}
        data-testid="paint-canvas"
        role="application"
        aria-label="Vehicle body diagram"
      >
        <svg viewBox="0 0 1000 400" className="oryx-diagram__svg" aria-hidden="true">
          {/* Side elevation of a saloon: the panels the report names. */}
          <path
            className="oryx-diagram__body"
            d="M50 300 L50 250 Q50 232 70 225 L180 210 Q240 200 290 160 Q330 130 400 128 L640 128 Q700 130 740 165 L840 205 Q940 215 950 240 L950 300 Q950 320 930 320 L70 320 Q50 320 50 300 Z"
          />
          <path className="oryx-diagram__glass" d="M310 165 Q345 140 400 138 L500 138 L500 205 L300 205 Q300 180 310 165 Z" />
          <path className="oryx-diagram__glass" d="M520 138 L640 138 Q690 142 720 170 L730 205 L520 205 Z" />
          <path className="oryx-diagram__panel" d="M300 210 L500 210 M520 210 L735 210" />
          <circle className="oryx-diagram__wheel" cx="230" cy="318" r="58" />
          <circle className="oryx-diagram__wheel" cx="760" cy="318" r="58" />
          <circle className="oryx-diagram__rim" cx="230" cy="318" r="30" />
          <circle className="oryx-diagram__rim" cx="760" cy="318" r="30" />
          <path className="oryx-diagram__panel" d="M120 232 L120 318 M300 232 L300 318 M500 232 L500 318 M735 232 L735 318 M870 232 L870 318" />
        </svg>

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
            <button type="button" className="oryx-btn oryx-btn--sm oryx-btn--ghost" onClick={removeSelected} disabled={disabled} data-testid="paint-marker-remove">
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

/** Top view of the vehicle with the eight assessed regions. */
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
  const byKey = new Map(value.map((r) => [r.regionKey, r]));

  const apply = (regionKey: ChassisRegionKey, condition: 'UNSET' | 'OK' | 'DAMAGE') => {
    if (disabled) return;
    const existing = byKey.get(regionKey);
    const next = existing
      ? value.map((r) => (r.regionKey === regionKey ? { ...r, condition } : r))
      : [...value, { regionKey, condition }];
    onChange(next);
  };

  const regionClass = (key: ChassisRegionKey) => {
    const c = byKey.get(key)?.condition ?? 'UNSET';
    return `oryx-chassis-region is-${c.toLowerCase()}`;
  };

  return (
    <div className="oryx-diagram" data-testid="chassis-diagram">
      <div className="oryx-diagram__tools" role="group">
        <button
          type="button"
          className={`oryx-paint-tool${tool === 'OK' ? ' is-active' : ''}`}
          aria-pressed={tool === 'OK'}
          onClick={() => setTool('OK')}
          disabled={disabled}
          data-testid="chassis-tool-OK"
        >
          <span className="oryx-paint-tool__dot" style={{ background: 'var(--success)' }} />
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
          <span className="oryx-paint-tool__dot" style={{ background: 'var(--danger)' }} />
          <span className="oryx-paint-tool__label">{labels.damage}</span>
        </button>
      </div>

      <div className="oryx-chassis" data-testid="chassis-canvas">
        <svg viewBox="0 0 400 700" className="oryx-diagram__svg" aria-hidden="true">
          <rect className="oryx-chassis__body" x="78" y="34" width="244" height="632" rx="66" />
          <rect className="oryx-chassis__cabin" x="104" y="186" width="192" height="298" rx="34" />
          <path className="oryx-diagram__panel" d="M104 196 L296 196 M104 474 L296 474" />
          <rect className="oryx-chassis__axle" x="60" y="120" width="30" height="70" rx="12" />
          <rect className="oryx-chassis__axle" x="310" y="120" width="30" height="70" rx="12" />
          <rect className="oryx-chassis__axle" x="60" y="500" width="30" height="70" rx="12" />
          <rect className="oryx-chassis__axle" x="310" y="500" width="30" height="70" rx="12" />
        </svg>

        {CHASSIS_REGIONS.map((r) => (
          <button
            key={r.key}
            type="button"
            className={regionClass(r.key)}
            style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%` }}
            onClick={() => apply(r.key, tool)}
            disabled={disabled}
            data-testid={`chassis-region-${r.key}`}
            data-condition={byKey.get(r.key)?.condition ?? 'UNSET'}
            aria-label={`${r.labelEn}: ${byKey.get(r.key)?.condition ?? 'UNSET'}`}
          >
            <span className="oryx-chassis-region__dot" />
            <span className="oryx-chassis-region__label">{r.labelEn}</span>
          </button>
        ))}
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
