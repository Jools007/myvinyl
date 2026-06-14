import { useMemo, useState } from 'react';
import type { CollectionInsights } from '../../lib/collectionInsights';
import { getHarmonicPartners, isHarmonicPartner } from '../../lib/insightInteractions';
import { InsightPanel } from './InsightCharts';

export function CamelotWheel({
  wheel,
  selectedCode,
  onKeySelect,
}: {
  wheel: CollectionInsights['camelotWheel'];
  selectedCode?: string | null;
  onKeySelect?: (code: string) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const focus = hover ?? selectedCode ?? wheel.find((c) => c.count > 0)?.code ?? null;
  const wheelCounts = useMemo(() => new Map(wheel.map((c) => [c.code, c.count])), [wheel]);
  const partners = focus ? getHarmonicPartners(focus, wheelCounts) : [];

  const size = 280;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = 116;
  const innerR = 52;

  return (
    <InsightPanel
      title="Harmonic map"
      subtitle="Camelot wheel — compatible keys glow when selected"
      className="insights-card--wheel"
    >
      <div className="insights-wheel-wrap">
        <svg viewBox={`0 0 ${size} ${size}`} className="insights-wheel" role="img" aria-label="Camelot wheel">
          <circle cx={cx} cy={cy} r={outerR + 4} className="insights-wheel__ring" />
          {wheel.map((cell, index) => {
            const angle = (index / wheel.length) * Math.PI * 2 - Math.PI / 2;
            const midR = (outerR + innerR) / 2;
            const x = cx + Math.cos(angle) * midR;
            const y = cy + Math.sin(angle) * midR;
            const slotW = 26;
            const slotH = 14 + cell.intensity * 18;
            const hasData = cell.count > 0;
            const isSelected = selectedCode === cell.code;
            const isPartner = selectedCode ? isHarmonicPartner(selectedCode, cell.code) : false;
            const isHover = hover === cell.code;
            let opacity = 0.14;
            if (hasData) {
              if (isSelected) opacity = 1;
              else if (isPartner) opacity = 0.72;
              else if (isHover) opacity = 0.95;
              else opacity = 0.38 + cell.intensity * 0.5;
            }
            return (
              <g
                key={cell.code}
                transform={`translate(${x}, ${y}) rotate(${(angle * 180) / Math.PI + 90})`}
                className={hasData && onKeySelect ? 'insights-wheel__cell-group--clickable' : undefined}
                onMouseEnter={() => setHover(cell.code)}
                onMouseLeave={() => setHover(null)}
                onClick={() => hasData && onKeySelect?.(cell.code)}
              >
                <rect
                  x={-slotW / 2}
                  y={-slotH / 2}
                  width={slotW}
                  height={slotH}
                  rx={4}
                  className={`insights-wheel__cell${isPartner ? ' insights-wheel__cell--partner' : ''}${isSelected ? ' insights-wheel__cell--selected' : ''}`}
                  style={{ opacity }}
                />
                <text
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="insights-wheel__label"
                  style={{ opacity: hasData ? 1 : 0.4 }}
                >
                  {cell.code}
                </text>
              </g>
            );
          })}
          <circle cx={cx} cy={cy} r={innerR - 2} className="insights-wheel__core" />
          <text x={cx} y={cy - 5} textAnchor="middle" className="insights-wheel__core-title">
            {focus ?? '—'}
          </text>
          <text x={cx} y={cy + 12} textAnchor="middle" className="insights-wheel__core-sub">
            {focus
              ? `${wheel.find((c) => c.code === focus)?.count ?? 0} tracks`
              : `${wheel.filter((c) => c.count > 0).length} keys`}
          </text>
        </svg>
      </div>
      {focus && partners.some((p) => p.trackCount > 0) ? (
        <div className="insights-wheel__partners">
          {partners
            .filter((p) => p.trackCount > 0)
            .map((p) => (
              <button
                key={p.code}
                type="button"
                className="insights-wheel__partner-chip"
                onClick={() => onKeySelect?.(p.code)}
              >
                <span className="tabular-nums">{p.code}</span>
                <span className="insights-wheel__partner-meta">{p.relationship}</span>
              </button>
            ))}
        </div>
      ) : null}
    </InsightPanel>
  );
}