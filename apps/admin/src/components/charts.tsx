'use client';

import { useMemo, useState } from 'react';

/**
 * Lightweight SVG charts. They are drawn inline (no chart runtime dependency
 * for the shell) and read the CSS custom properties so they follow the active
 * theme without re-rendering logic.
 */

export interface SeriesPoint {
  label: string;
  value: number;
}

function niceMax(values: number[]): number {
  const max = Math.max(1, ...values);
  const magnitude = Math.pow(10, Math.floor(Math.log10(max)));
  return Math.ceil(max / magnitude) * magnitude;
}

export function MiniBarChart({
  data,
  height = 190,
  valueFormatter = (v) => String(v),
}: {
  data: SeriesPoint[];
  height?: number;
  valueFormatter?: (v: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = useMemo(() => niceMax(data.map((d) => d.value)), [data]);
  const top = data.slice(0, 12);

  return (
    <div className="w-full min-w-0 overflow-hidden" style={{ height }}>
      <div className="flex h-full min-w-0 items-end gap-2">
        {top.map((d, i) => {
          const pct = max === 0 ? 0 : Math.max(2, Math.round((d.value / max) * 100));
          return (
            <div
              key={`${d.label}-${i}`}
              className="group relative flex min-w-0 flex-1 flex-col items-center justify-end gap-2"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{ height: '100%' }}
            >
              <span
                className="oryx-faint text-[10.5px] tabular-nums"
                style={{ opacity: hover === i ? 1 : 0.75 }}
              >
                {valueFormatter(d.value)}
              </span>
              <span
                className="w-full rounded-t-[6px] transition-all"
                style={{
                  height: `${pct}%`,
                  minHeight: 6,
                  background:
                    hover === i
                      ? 'linear-gradient(180deg, var(--gold-soft), var(--gold))'
                      : 'linear-gradient(180deg, color-mix(in srgb, var(--gold) 55%, transparent), color-mix(in srgb, var(--gold) 22%, transparent))',
                  border: '1px solid color-mix(in srgb, var(--gold) 40%, transparent)',
                  borderBottom: 'none',
                }}
              />
              <span
                className="oryx-faint w-full truncate text-center text-[10px]"
                title={d.label}
              >
                {d.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MiniLineChart({ data, height = 160 }: { data: SeriesPoint[]; height?: number }) {
  const width = 520;
  const pad = 18;
  const max = niceMax(data.map((d) => d.value));
  const step = data.length > 1 ? (width - pad * 2) / (data.length - 1) : 0;

  const points = data.map((d, i) => {
    const x = pad + i * step;
    const y = height - pad - (max === 0 ? 0 : (d.value / max) * (height - pad * 2));
    return { x, y, ...d };
  });

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const area = points.length
    ? `${line} L${points[points.length - 1].x.toFixed(1)} ${height - pad} L${points[0].x.toFixed(1)} ${height - pad} Z`
    : '';

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      role="img"
      aria-label="Trend"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="oryxArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--gold)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <line
          key={f}
          x1={pad}
          x2={width - pad}
          y1={pad + f * (height - pad * 2)}
          y2={pad + f * (height - pad * 2)}
          stroke="var(--border-soft)"
          strokeWidth="1"
        />
      ))}
      {area ? <path d={area} fill="url(#oryxArea)" /> : null}
      {line ? <path d={line} fill="none" stroke="var(--gold)" strokeWidth="2.4" strokeLinecap="round" /> : null}
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill="var(--surface)" stroke="var(--gold)" strokeWidth="2" />
      ))}
    </svg>
  );
}

export function MiniDonut({
  value,
  total,
  height = 190,
  label,
}: {
  value: number;
  total: number;
  height?: number;
  label: string;
}) {
  const pct = total > 0 ? Math.min(1, value / total) : 0;
  const r = 62;
  const circumference = 2 * Math.PI * r;
  const dash = circumference * pct;

  return (
    <div className="flex flex-col items-center justify-center gap-3" style={{ height }}>
      <svg viewBox="0 0 160 160" width={height - 40} height={height - 40} role="img" aria-label={label}>
        <circle cx="80" cy="80" r={r} fill="none" stroke="var(--surface-raised)" strokeWidth="14" />
        <circle
          cx="80"
          cy="80"
          r={r}
          fill="none"
          stroke="var(--gold)"
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          transform="rotate(-90 80 80)"
        />
        <text
          x="80"
          y="76"
          textAnchor="middle"
          fill="var(--text)"
          fontSize="26"
          fontWeight="800"
        >
          {value}
        </text>
        <text x="80" y="98" textAnchor="middle" fill="var(--text-faint)" fontSize="11">
          / {total}
        </text>
      </svg>
      <span className="oryx-muted text-[11.5px] font-semibold">{label}</span>
    </div>
  );
}
