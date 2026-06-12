import { useMemo, useState, type ReactNode } from 'react';
import { chartColor } from '../../lib/collectionInsights';
import type { ChartItem, RadarAxis, ScatterPoint, TreemapCell } from '../../lib/collectionInsights';

function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
  return {
    x: cx + r * Math.cos(angle),
    y: cy + r * Math.sin(angle),
  };
}

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
): string {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const large = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y} Z`;
}

type PanelProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  id?: string;
};

export function InsightPanel({ title, subtitle, children, className = '', id }: PanelProps) {
  return (
    <article className={`insights-card ${className}`.trim()} id={id}>
      <header className="insights-card__head">
        <h3 className="insights-card__title">{title}</h3>
        {subtitle ? <p className="insights-card__subtitle">{subtitle}</p> : null}
      </header>
      <div className="insights-card__body">{children}</div>
    </article>
  );
}

type DonutProps = {
  title: string;
  subtitle?: string;
  items: ChartItem[];
  onSliceClick?: (item: ChartItem) => void;
};

export function InsightDonutChart({ title, subtitle, items, onSliceClick }: DonutProps) {
  const [active, setActive] = useState<number | null>(null);
  const total = Math.max(1, items.reduce((s, i) => s + i.count, 0));
  const size = 168;
  const cx = size / 2;
  const cy = size / 2;
  const r = 72;

  const slices = useMemo(() => {
    let angle = -Math.PI / 2;
    return items.map((item, index) => {
      const slice = (item.count / total) * Math.PI * 2;
      const start = angle;
      const end = angle + slice;
      angle = end;
      return { item, index, d: describeArc(cx, cy, r, start, end) };
    });
  }, [items, total, cx, cy, r]);

  if (items.length === 0) {
    return (
      <InsightPanel title={title} subtitle={subtitle}>
        <p className="insights-card__empty">Not enough data yet.</p>
      </InsightPanel>
    );
  }

  const focusIndex = active ?? 0;
  const focus = items[focusIndex];

  return (
    <InsightPanel title={title} subtitle={subtitle} className="insights-card--donut">
      <div className="insights-donut">
        <svg viewBox={`0 0 ${size} ${size}`} className="insights-donut__svg" role="img" aria-label={title}>
          {slices.map(({ item, index, d }) => (
            <path
              key={item.label}
              d={d}
              fill={chartColor(index)}
              className={`insights-donut__slice${onSliceClick ? ' insights-donut__slice--clickable' : ''}`}
              style={{ opacity: active == null || active === index ? 1 : 0.38 }}
              onMouseEnter={() => setActive(index)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(index)}
              onBlur={() => setActive(null)}
              onClick={() => onSliceClick?.(item)}
              tabIndex={onSliceClick ? 0 : undefined}
              role={onSliceClick ? 'button' : undefined}
              aria-label={`${item.label}: ${item.count}`}
            />
          ))}
          <circle cx={cx} cy={cy} r={42} className="insights-donut__hole" />
          <text x={cx} y={cy - 5} textAnchor="middle" className="insights-donut__center-value">
            {focus.count}
          </text>
          <text x={cx} y={cy + 10} textAnchor="middle" className="insights-donut__center-label">
            {focus.label}
          </text>
        </svg>
        <ul className="insights-donut__legend" role="list">
          {items.map((item, index) => (
            <li key={item.label}>
              <button
                type="button"
                className="insights-donut__legend-row"
                onMouseEnter={() => setActive(index)}
                onMouseLeave={() => setActive(null)}
                onClick={() => onSliceClick?.(item)}
                disabled={!onSliceClick}
              >
                <span className="insights-donut__swatch" style={{ background: chartColor(index) }} />
                <span className="insights-donut__legend-label">{item.label}</span>
                <span className="insights-donut__legend-value tabular-nums">
                  {Math.round((item.count / total) * 100)}%
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </InsightPanel>
  );
}

type ScatterProps = {
  title: string;
  subtitle?: string;
  points: ScatterPoint[];
  selectedId?: string | null;
  onPointSelect?: (point: ScatterPoint) => void;
};

export function InsightScatterChart({
  title,
  subtitle,
  points,
  selectedId,
  onPointSelect,
}: ScatterProps) {
  const [focus, setFocus] = useState<ScatterPoint | null>(null);
  const w = 400;
  const h = 200;
  const pad = { l: 40, r: 16, t: 14, b: 30 };
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;

  const { minYear, maxYear, minBpm, maxBpm } = useMemo(() => {
    if (points.length === 0) {
      return { minYear: 1970, maxYear: 2024, minBpm: 80, maxBpm: 140 };
    }
    const years = points.map((p) => p.year);
    const bpms = points.map((p) => p.bpm);
    return {
      minYear: Math.min(...years) - 2,
      maxYear: Math.max(...years) + 2,
      minBpm: Math.max(60, Math.min(...bpms) - 8),
      maxBpm: Math.min(180, Math.max(...bpms) + 8),
    };
  }, [points]);

  const toX = (year: number) => pad.l + ((year - minYear) / (maxYear - minYear || 1)) * plotW;
  const toY = (bpm: number) =>
    pad.t + plotH - ((bpm - minBpm) / (maxBpm - minBpm || 1)) * plotH;

  if (points.length === 0) {
    return (
      <InsightPanel title={title} subtitle={subtitle}>
        <p className="insights-card__empty">Add year and BPM on releases to map tempo against era.</p>
      </InsightPanel>
    );
  }

  const active =
    (selectedId ? points.find((p) => p.id === selectedId) : null) ?? focus ?? points[0];

  return (
    <InsightPanel title={title} subtitle={subtitle} className="insights-card--scatter">
      <div className="insights-scatter-wrap">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="insights-scatter"
          role="img"
          aria-label={`${title}: ${points.length} points`}
        >
          {[0.25, 0.5, 0.75].map((level) => (
            <line
              key={level}
              x1={pad.l}
              y1={pad.t + plotH * (1 - level)}
              x2={pad.l + plotW}
              y2={pad.t + plotH * (1 - level)}
              className="insights-scatter__grid"
            />
          ))}
          <line
            x1={pad.l}
            y1={pad.t + plotH}
            x2={pad.l + plotW}
            y2={pad.t + plotH}
            className="insights-scatter__axis"
          />
          <line
            x1={pad.l}
            y1={pad.t}
            x2={pad.l}
            y2={pad.t + plotH}
            className="insights-scatter__axis"
          />
          <text x={pad.l + plotW / 2} y={h - 6} textAnchor="middle" className="insights-scatter__axis-label">
            Year
          </text>
          <text
            x={12}
            y={pad.t + plotH / 2}
            textAnchor="middle"
            transform={`rotate(-90 12 ${pad.t + plotH / 2})`}
            className="insights-scatter__axis-label"
          >
            BPM
          </text>
          {points.map((p, i) => {
            const selected = active?.id === p.id;
            return (
              <circle
                key={`${p.id}-${i}`}
                cx={toX(p.year)}
                cy={toY(p.bpm)}
                r={selected ? 5.5 : 3.5}
                className={`insights-scatter__dot${selected ? ' insights-scatter__dot--active' : ''}`}
                onMouseEnter={() => setFocus(p)}
                onMouseLeave={() => setFocus(null)}
                onClick={() => {
                  setFocus(p);
                  onPointSelect?.(p);
                }}
                onTouchStart={() => {
                  setFocus(p);
                  onPointSelect?.(p);
                }}
              />
            );
          })}
        </svg>
        <div className="insights-scatter__detail" aria-live="polite">
          <span className="insights-scatter__detail-title">{active.label}</span>
          <span className="insights-scatter__detail-meta tabular-nums">
            {active.year} · {active.bpm} BPM
          </span>
        </div>
        <p className="insights-scatter__hint tabular-nums">
          {points.length} releases · tap a dot to explore
        </p>
      </div>
    </InsightPanel>
  );
}

type TreemapProps = {
  title: string;
  subtitle?: string;
  cells: TreemapCell[];
  onCellClick?: (cell: TreemapCell) => void;
};

export function InsightTreemapChart({ title, subtitle, cells, onCellClick }: TreemapProps) {
  if (cells.length === 0) {
    return (
      <InsightPanel title={title} subtitle={subtitle}>
        <p className="insights-card__empty">Not enough data yet.</p>
      </InsightPanel>
    );
  }

  const maxCount = Math.max(...cells.map((c) => c.count));

  return (
    <InsightPanel title={title} subtitle={subtitle} className="insights-card--treemap">
      <div className="insights-treemap">
        {cells.map((cell, index) => (
          <button
            key={cell.label}
            type="button"
            className="insights-treemap__cell"
            style={{
              flexGrow: cell.count,
              minHeight: `${3 + (cell.count / maxCount) * 2.5}rem`,
              background: `color-mix(in srgb, ${chartColor(index)} ${22 + cell.share}%, var(--bg-elevated))`,
              borderColor: `color-mix(in srgb, ${chartColor(index)} 38%, var(--border))`,
            }}
            onClick={() => onCellClick?.(cell)}
            disabled={!onCellClick}
          >
            <span className="insights-treemap__label">{cell.label}</span>
            <span className="insights-treemap__meta tabular-nums">
              {cell.count}
              <span className="insights-treemap__share">{cell.share}%</span>
            </span>
          </button>
        ))}
      </div>
    </InsightPanel>
  );
}

type RadarProps = {
  title: string;
  subtitle?: string;
  axes: RadarAxis[];
  onAxisClick?: (axis: RadarAxis) => void;
};

export function InsightRadarChart({ title, subtitle, axes, onAxisClick }: RadarProps) {
  const [active, setActive] = useState<number | null>(null);
  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = 68;

  if (axes.length < 3) {
    return (
      <InsightPanel title={title} subtitle={subtitle}>
        <p className="insights-card__empty">Tag more vibes to unlock the radar.</p>
      </InsightPanel>
    );
  }

  const n = axes.length;
  const angleStep = (Math.PI * 2) / n;
  const gridLevels = [0.25, 0.5, 0.75, 1];

  const dataPoints = axes.map((axis, i) => {
    const angle = i * angleStep - Math.PI / 2;
    const r = (axis.value / (axis.max || 1)) * maxR;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle), axis, i };
  });
  const polygon = dataPoints.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <InsightPanel title={title} subtitle={subtitle} className="insights-card--radar">
      <div className="insights-radar-wrap">
        <svg viewBox={`0 0 ${size} ${size}`} className="insights-radar" role="img" aria-label={title}>
          {gridLevels.map((level) => {
            const pts = axes
              .map((_, i) => {
                const angle = i * angleStep - Math.PI / 2;
                const r = maxR * level;
                return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
              })
              .join(' ');
            return <polygon key={level} points={pts} className="insights-radar__grid" />;
          })}
          {axes.map((_, i) => {
            const angle = i * angleStep - Math.PI / 2;
            return (
              <line
                key={i}
                x1={cx}
                y1={cy}
                x2={cx + maxR * Math.cos(angle)}
                y2={cy + maxR * Math.sin(angle)}
                className="insights-radar__spoke"
              />
            );
          })}
          <polygon points={polygon} className="insights-radar__fill" />
          {dataPoints.map((p) => (
            <circle
              key={p.axis.label}
              cx={p.x}
              cy={p.y}
              r={active === p.i ? 4.5 : 3}
              className="insights-radar__vertex"
              onMouseEnter={() => setActive(p.i)}
              onMouseLeave={() => setActive(null)}
              onClick={() => onAxisClick?.(p.axis)}
            />
          ))}
        </svg>
        <ul className="insights-radar__legend" role="list">
          {axes.map((axis, i) => (
            <li key={axis.label}>
              <button
                type="button"
                className="insights-radar__legend-row"
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                onClick={() => onAxisClick?.(axis)}
                disabled={!onAxisClick}
              >
                <span>{axis.label}</span>
                <span className="tabular-nums">{axis.value}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </InsightPanel>
  );
}