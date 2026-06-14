import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  RadialLinearScale,
  Tooltip,
} from 'chart.js';
import { useMemo } from 'react';
import { Bar, Doughnut, Line, Radar, Scatter } from 'react-chartjs-2';
import type { ChartItem, RadarAxis, ScatterPoint } from '../../lib/collectionInsights';
import { baseChartOptions, chartFont, useChartTheme, withAlpha } from '../../hooks/useChartTheme';
import { InsightPanel } from './InsightCharts';

ChartJS.register(
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  RadialLinearScale,
  Filler,
  Legend,
  Tooltip
);

type ClickHandler<T> = (item: T, index: number) => void;

function panelEmpty(title: string, subtitle?: string) {
  return (
    <InsightPanel title={title} subtitle={subtitle}>
      <p className="insights-card__empty">Not enough data yet.</p>
    </InsightPanel>
  );
}

export function ChartDoughnut({
  title,
  subtitle,
  items,
  onSliceClick,
  cutout = '62%',
}: {
  title: string;
  subtitle?: string;
  items: ChartItem[];
  onSliceClick?: ClickHandler<ChartItem>;
  cutout?: string;
}) {
  const theme = useChartTheme();
  if (items.length === 0) return panelEmpty(title, subtitle);

  const total = items.reduce((s, i) => s + i.count, 0);
  const data = useMemo(
    () => ({
      labels: items.map((i) => i.label),
      datasets: [
        {
          data: items.map((i) => i.count),
          backgroundColor: items.map((_, i) => withAlpha(theme.palette[i % theme.palette.length], 0.88)),
          borderColor: theme.elevated,
          borderWidth: 2,
          hoverOffset: 6,
        },
      ],
    }),
    [items, theme]
  );

  const options = useMemo(
    () => ({
      ...baseChartOptions(theme),
      cutout,
      onClick: (_: unknown, elements: { index: number }[]) => {
        const idx = elements[0]?.index;
        if (idx != null && onSliceClick) onSliceClick(items[idx], idx);
      },
      plugins: {
        ...baseChartOptions(theme).plugins,
        tooltip: {
          ...baseChartOptions(theme).plugins?.tooltip,
          callbacks: {
            label: (ctx: { label?: string; parsed?: number }) => {
              const count = ctx.parsed ?? 0;
              const share = total > 0 ? Math.round((count / total) * 100) : 0;
              return `${ctx.label}: ${count} (${share}%)`;
            },
          },
        },
      },
    }),
    [items, onSliceClick, theme, total, cutout]
  );

  return (
    <InsightPanel title={title} subtitle={subtitle} className="insights-chart-panel">
      <div className="insights-chart-panel__canvas insights-chart-panel__canvas--doughnut">
        <Doughnut data={data} options={options as object} />
      </div>
      <ul className="insights-chart-legend" role="list">
        {items.map((item, i) => (
          <li key={item.label}>
            <button
              type="button"
              className="insights-chart-legend__item"
              onClick={() => onSliceClick?.(item, i)}
              disabled={!onSliceClick}
            >
              <span
                className="insights-chart-legend__swatch"
                style={{ background: theme.palette[i % theme.palette.length] }}
                aria-hidden
              />
              <span className="insights-chart-legend__label">{item.label}</span>
              <span className="insights-chart-legend__value tabular-nums">{item.count}</span>
            </button>
          </li>
        ))}
      </ul>
    </InsightPanel>
  );
}

export function ChartBar({
  title,
  subtitle,
  items,
  horizontal = true,
  onBarClick,
  accentIndex = 0,
  large = false,
}: {
  title: string;
  subtitle?: string;
  items: ChartItem[];
  horizontal?: boolean;
  onBarClick?: ClickHandler<ChartItem>;
  accentIndex?: number;
  large?: boolean;
}) {
  const theme = useChartTheme();
  if (items.length === 0) return panelEmpty(title, subtitle);

  const accent = theme.palette[accentIndex % theme.palette.length];

  const data = useMemo(
    () => ({
      labels: items.map((i) => i.label),
      datasets: [
        {
          data: items.map((i) => i.count),
          backgroundColor: items.map((_, i) =>
            withAlpha(theme.palette[(accentIndex + i) % theme.palette.length], horizontal ? 0.75 : 0.88)
          ),
          borderRadius: horizontal ? { topRight: 6, bottomRight: 6 } : { topLeft: 6, topRight: 6 },
          borderSkipped: false,
          maxBarThickness: horizontal ? (large ? 28 : 22) : large ? 48 : 40,
        },
      ],
    }),
    [items, theme, horizontal, accentIndex]
  );

  const options = useMemo(
    () => ({
      ...baseChartOptions(theme),
      indexAxis: horizontal ? ('y' as const) : ('x' as const),
      onClick: (_: unknown, elements: { index: number }[]) => {
        const idx = elements[0]?.index;
        if (idx != null && onBarClick) onBarClick(items[idx], idx);
      },
      scales: horizontal
        ? {
            x: {
              ...baseChartOptions(theme).scales?.x,
              grid: { display: false },
              ticks: { color: theme.textMuted, font: chartFont(10) },
            },
            y: {
              ...baseChartOptions(theme).scales?.y,
              grid: { display: false },
              ticks: {
                color: theme.text,
                font: chartFont(11, 500),
                autoSkip: false,
              },
            },
          }
        : {
            x: {
              ...baseChartOptions(theme).scales?.x,
              grid: { display: false },
              ticks: { color: theme.text, font: chartFont(10) },
            },
            y: {
              ...baseChartOptions(theme).scales?.y,
              beginAtZero: true,
              ticks: { color: theme.textMuted, font: chartFont(10), precision: 0 },
            },
          },
      plugins: {
        ...baseChartOptions(theme).plugins,
        tooltip: {
          ...baseChartOptions(theme).plugins?.tooltip,
          callbacks: {
            label: (ctx: { parsed: { x?: number; y?: number } }) => {
              const val = horizontal ? ctx.parsed.x : ctx.parsed.y;
              return `${val ?? 0} releases`;
            },
          },
        },
      },
    }),
    [horizontal, items, onBarClick, theme, accent]
  );

  return (
    <InsightPanel title={title} subtitle={subtitle} className="insights-chart-panel">
      <div
        className={`insights-chart-panel__canvas${horizontal ? ' insights-chart-panel__canvas--bar-h' : ' insights-chart-panel__canvas--bar-v'}`}
        style={{
          height: horizontal
            ? `${Math.max(large ? 240 : 200, items.length * (large ? 46 : 38))}px`
            : large
              ? '300px'
              : '240px',
        }}
      >
        <Bar data={data} options={options as object} />
      </div>
    </InsightPanel>
  );
}

export function ChartValueBar({
  title,
  subtitle,
  items,
  currency = 'USD',
  horizontal = true,
  accentIndex = 4,
}: {
  title: string;
  subtitle?: string;
  items: ChartItem[];
  currency?: string;
  horizontal?: boolean;
  accentIndex?: number;
}) {
  const theme = useChartTheme();
  if (items.length === 0) return panelEmpty(title, subtitle);

  const formatMoney = (value: number) => {
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
        maximumFractionDigits: 0,
      }).format(value);
    } catch {
      return `${currency} ${value.toFixed(0)}`;
    }
  };

  const data = useMemo(
    () => ({
      labels: items.map((i) => i.label),
      datasets: [
        {
          data: items.map((i) => i.count),
          backgroundColor: items.map((_, i) =>
            withAlpha(theme.palette[(accentIndex + i) % theme.palette.length], horizontal ? 0.82 : 0.9)
          ),
          borderRadius: horizontal ? { topRight: 8, bottomRight: 8 } : { topLeft: 8, topRight: 8 },
          borderSkipped: false,
          maxBarThickness: horizontal ? 26 : 44,
        },
      ],
    }),
    [items, theme, horizontal, accentIndex]
  );

  const options = useMemo(
    () => ({
      ...baseChartOptions(theme),
      indexAxis: horizontal ? ('y' as const) : ('x' as const),
      scales: horizontal
        ? {
            x: {
              ...baseChartOptions(theme).scales?.x,
              grid: { color: withAlpha(theme.border, 0.55) },
              ticks: {
                color: theme.textMuted,
                font: chartFont(10),
                callback: (value: string | number) => formatMoney(Number(value)),
              },
            },
            y: {
              ...baseChartOptions(theme).scales?.y,
              grid: { display: false },
              ticks: {
                color: theme.text,
                font: chartFont(11, 500),
                autoSkip: false,
              },
            },
          }
        : {
            x: {
              ...baseChartOptions(theme).scales?.x,
              grid: { display: false },
              ticks: { color: theme.text, font: chartFont(10) },
            },
            y: {
              ...baseChartOptions(theme).scales?.y,
              beginAtZero: true,
              grid: { color: withAlpha(theme.border, 0.55) },
              ticks: {
                color: theme.textMuted,
                font: chartFont(10),
                callback: (value: string | number) => formatMoney(Number(value)),
              },
            },
          },
      plugins: {
        ...baseChartOptions(theme).plugins,
        tooltip: {
          ...baseChartOptions(theme).plugins?.tooltip,
          callbacks: {
            label: (ctx: { parsed: { x?: number; y?: number } }) => {
              const val = horizontal ? ctx.parsed.x : ctx.parsed.y;
              return formatMoney(val ?? 0);
            },
          },
        },
      },
    }),
    [horizontal, theme, currency]
  );

  return (
    <InsightPanel title={title} subtitle={subtitle} className="insights-chart-panel">
      <div
        className={`insights-chart-panel__canvas${horizontal ? ' insights-chart-panel__canvas--bar-h' : ''}`}
        style={{
          height: horizontal
            ? `${Math.max(220, items.length * 42)}px`
            : '280px',
        }}
      >
        <Bar data={data} options={options as object} />
      </div>
    </InsightPanel>
  );
}

export function ChartDecadeLine({
  title,
  subtitle,
  items,
  onPointClick,
}: {
  title: string;
  subtitle?: string;
  items: ChartItem[];
  onPointClick?: ClickHandler<ChartItem>;
}) {
  const theme = useChartTheme();
  if (items.length === 0) return panelEmpty(title, subtitle);

  const data = useMemo(
    () => ({
      labels: items.map((i) => i.label),
      datasets: [
        {
          data: items.map((i) => i.count),
          borderColor: theme.accent,
          backgroundColor: withAlpha(theme.accent, 0.12),
          fill: true,
          tension: 0.35,
          pointRadius: 5,
          pointHoverRadius: 7,
          pointBackgroundColor: theme.accent,
          pointBorderColor: theme.elevated,
          pointBorderWidth: 2,
        },
      ],
    }),
    [items, theme]
  );

  const options = useMemo(
    () => ({
      ...baseChartOptions(theme),
      onClick: (_: unknown, elements: { index: number }[]) => {
        const idx = elements[0]?.index;
        if (idx != null && onPointClick) onPointClick(items[idx], idx);
      },
      scales: {
        x: {
          ...baseChartOptions(theme).scales?.x,
          grid: { display: false },
        },
        y: {
          ...baseChartOptions(theme).scales?.y,
          beginAtZero: true,
          ticks: { precision: 0 },
        },
      },
    }),
    [items, onPointClick, theme]
  );

  return (
    <InsightPanel title={title} subtitle={subtitle} className="insights-chart-panel">
      <div className="insights-chart-panel__canvas insights-chart-panel__canvas--line">
        <Line data={data} options={options as object} />
      </div>
    </InsightPanel>
  );
}

export function ChartScatterBpm({
  title,
  subtitle,
  points,
  selectedId,
  onPointSelect,
}: {
  title: string;
  subtitle?: string;
  points: ScatterPoint[];
  selectedId?: string | null;
  onPointSelect?: (point: ScatterPoint) => void;
}) {
  const theme = useChartTheme();
  if (points.length === 0) return panelEmpty(title, subtitle);

  const data = useMemo(
    () => ({
      datasets: [
        {
          label: 'Releases',
          data: points.map((p) => ({ x: p.year, y: p.bpm, id: p.id, label: p.label })),
          backgroundColor: points.map((p) =>
            p.id === selectedId ? theme.violet : withAlpha(theme.accent, 0.65)
          ),
          pointRadius: points.map((p) => (p.id === selectedId ? 8 : 5)),
          pointHoverRadius: 9,
        },
      ],
    }),
    [points, selectedId, theme]
  );

  const options = useMemo(
    () => ({
      ...baseChartOptions(theme),
      onClick: (_: unknown, elements: { index: number }[]) => {
        const idx = elements[0]?.index;
        if (idx != null && onPointSelect) onPointSelect(points[idx]);
      },
      scales: {
        x: {
          ...baseChartOptions(theme).scales?.x,
          title: { display: true, text: 'Year', color: theme.textMuted, font: chartFont(10) },
        },
        y: {
          ...baseChartOptions(theme).scales?.y,
          title: { display: true, text: 'BPM', color: theme.textMuted, font: chartFont(10) },
          beginAtZero: false,
        },
      },
      plugins: {
        ...baseChartOptions(theme).plugins,
        tooltip: {
          ...baseChartOptions(theme).plugins?.tooltip,
          callbacks: {
            title: (items: { raw: { label?: string } }[]) => items[0]?.raw?.label ?? '',
            label: (ctx: { parsed: { x: number; y: number } }) =>
              `${ctx.parsed.x} · ${ctx.parsed.y} BPM`,
          },
        },
      },
    }),
    [onPointSelect, points, theme]
  );

  return (
    <InsightPanel title={title} subtitle={subtitle} className="insights-chart-panel">
      <div className="insights-chart-panel__canvas insights-chart-panel__canvas--scatter">
        <Scatter data={data} options={options as object} />
      </div>
    </InsightPanel>
  );
}

export function ChartVibeRadar({
  title,
  subtitle,
  axes,
  onAxisClick,
}: {
  title: string;
  subtitle?: string;
  axes: RadarAxis[];
  onAxisClick?: (axis: RadarAxis) => void;
}) {
  const theme = useChartTheme();
  if (axes.length < 3) return panelEmpty(title, subtitle);

  const data = useMemo(
    () => ({
      labels: axes.map((a) => a.label),
      datasets: [
        {
          data: axes.map((a) => a.value),
          backgroundColor: withAlpha(theme.violet, 0.22),
          borderColor: theme.violet,
          borderWidth: 2,
          pointBackgroundColor: theme.violet,
          pointBorderColor: theme.elevated,
          pointRadius: 4,
        },
      ],
    }),
    [axes, theme]
  );

  const options = useMemo(
    () => ({
      ...baseChartOptions(theme),
      scales: {
        r: {
          angleLines: { color: withAlpha(theme.border, 0.5) },
          grid: { color: withAlpha(theme.border, 0.4) },
          pointLabels: { color: theme.text, font: chartFont(10, 500) },
          ticks: { display: false },
          suggestedMin: 0,
        },
      },
      onClick: (_: unknown, elements: { index: number }[]) => {
        const idx = elements[0]?.index;
        if (idx != null && onAxisClick) onAxisClick(axes[idx]);
      },
    }),
    [axes, onAxisClick, theme]
  );

  return (
    <InsightPanel title={title} subtitle={subtitle} className="insights-chart-panel">
      <div className="insights-chart-panel__canvas insights-chart-panel__canvas--radar">
        <Radar data={data} options={options as object} />
      </div>
    </InsightPanel>
  );
}

export function ChartCompletionRing({
  title,
  subtitle,
  segments,
}: {
  title: string;
  subtitle?: string;
  segments: { label: string; value: number; color?: string }[];
}) {
  const theme = useChartTheme();
  const data = useMemo(
    () => ({
      labels: segments.map((s) => s.label),
      datasets: [
        {
          data: segments.map((s) => s.value),
          backgroundColor: segments.map(
            (s, i) => s.color ?? withAlpha(theme.palette[i % theme.palette.length], 0.85)
          ),
          borderWidth: 0,
        },
      ],
    }),
    [segments, theme]
  );

  const options = useMemo(
    () => ({
      ...baseChartOptions(theme),
      cutout: '72%',
      plugins: {
        ...baseChartOptions(theme).plugins,
        tooltip: {
          ...baseChartOptions(theme).plugins?.tooltip,
          callbacks: {
            label: (ctx: { label?: string; parsed?: number }) => `${ctx.label}: ${ctx.parsed}%`,
          },
        },
      },
    }),
    [theme]
  );

  return (
    <InsightPanel title={title} subtitle={subtitle} className="insights-chart-panel">
      <div className="insights-chart-panel__canvas insights-chart-panel__canvas--ring">
        <Doughnut data={data} options={options as object} />
      </div>
      <ul className="insights-chart-legend insights-chart-legend--compact" role="list">
        {segments.map((seg, i) => (
          <li key={seg.label} className="insights-chart-legend__stat">
            <span
              className="insights-chart-legend__swatch"
              style={{ background: seg.color ?? theme.palette[i % theme.palette.length] }}
              aria-hidden
            />
            <span className="insights-chart-legend__label">{seg.label}</span>
            <span className="insights-chart-legend__value tabular-nums">{seg.value}%</span>
          </li>
        ))}
      </ul>
    </InsightPanel>
  );
}