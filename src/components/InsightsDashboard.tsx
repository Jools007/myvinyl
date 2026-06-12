import {
  Activity,
  ArrowRight,
  BarChart3,
  ChevronRight,
  Disc3,
  Grid2x2,
  HeartPulse,
  KeyRound,
  Layers,
  Music2,
  Sparkles,
  Users,
  Waves,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  computeCollectionInsights,
  type ActionableInsight,
  type ChartItem,
  type CollectionInsights,
  type InsightFilterAction,
} from '../lib/collectionInsights';
import {
  bpmBucketLens,
  buildCrateJourney,
  getHarmonicPartners,
  isHarmonicPartner,
  spinCrateRoulette,
  type InsightLens,
  type JourneyStep,
  type RouletteBias,
} from '../lib/insightInteractions';
import type { Track, VinylRecord } from '../lib/types';
import {
  InsightDonutChart,
  InsightPanel,
  InsightRadarChart,
  InsightScatterChart,
  InsightTreemapChart,
} from './insights/InsightCharts';
import { InsightExplorer } from './insights/InsightExplorer';
import { PlayfulTools } from './insights/PlayfulTools';

type InsightsDashboardProps = {
  records: VinylRecord[];
  onApplyFilter?: (patch: InsightFilterAction) => void;
  onOpenCollection?: () => void;
  onEnrichTracklists?: () => void;
  onEnrichMetadata?: () => void;
  onPlayNow?: (record: VinylRecord, track: Track) => void;
  onAddToQueue?: (record: VinylRecord, track: Track) => void;
  onQueueMany?: (items: { record: VinylRecord; track: Track }[], label?: string) => void;
  onAddToCrate?: (record: VinylRecord, track: Track) => void;
  onAddManyToCrate?: (items: { record: VinylRecord; track: Track }[], label?: string) => void;
};

type SectionId = 'overview' | 'sound' | 'tempo' | 'harmonic' | 'health';

const SECTIONS: { id: SectionId; label: string; icon: typeof BarChart3 }[] = [
  { id: 'overview', label: 'Overview', icon: Grid2x2 },
  { id: 'sound', label: 'Sound', icon: Waves },
  { id: 'tempo', label: 'Tempo', icon: Activity },
  { id: 'harmonic', label: 'Keys', icon: KeyRound },
  { id: 'health', label: 'Health', icon: HeartPulse },
];

function formatPct(value: number): string {
  return `${value}%`;
}

function lensKey(lens: InsightLens): string {
  switch (lens.kind) {
    case 'genre':
    case 'format':
    case 'vibe':
    case 'artist':
    case 'decade':
    case 'bpm':
      return `${lens.kind}:${lens.label}`;
    case 'camelot':
      return `camelot:${lens.code}`;
    case 'release':
    case 'roulette':
      return `${lens.kind}:${lens.recordId}`;
    case 'journey':
      return `journey:${lens.stepIds.join(',')}`;
    default:
      return 'unknown';
  }
}

function InsightBarChart({
  title,
  subtitle,
  items,
  accent = 'accent',
  selectedLabel,
  onItemClick,
  compact = false,
}: {
  title: string;
  subtitle?: string;
  items: ChartItem[];
  accent?: 'accent' | 'violet' | 'coral';
  selectedLabel?: string | null;
  onItemClick?: (item: ChartItem) => void;
  compact?: boolean;
}) {
  const max = Math.max(1, ...items.map((i) => i.count));

  if (items.length === 0) {
    return (
      <InsightPanel title={title} subtitle={subtitle}>
        <p className="insights-card__empty">Not enough data yet.</p>
      </InsightPanel>
    );
  }

  return (
    <InsightPanel title={title} subtitle={subtitle} className={compact ? 'insights-card--compact' : ''}>
      <ul className="insights-bars" role="list">
        {items.map((item) => {
          const selected = selectedLabel === item.label;
          return (
            <li key={item.label}>
              <button
                type="button"
                className={`insights-bars__row${onItemClick ? ' insights-bars__row--clickable' : ''}${selected ? ' insights-bars__row--selected' : ''}`}
                onClick={() => onItemClick?.(item)}
                disabled={!onItemClick}
                aria-pressed={selected}
              >
                <span className="insights-bars__label">{item.label}</span>
                <span className="insights-bars__track" aria-hidden>
                  <span
                    className={`insights-bars__fill insights-bars__fill--${accent}`}
                    style={{ transform: `scaleX(${item.count / max})` }}
                  />
                </span>
                <span className="insights-bars__value tabular-nums">{item.count}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </InsightPanel>
  );
}

function CamelotWheel({
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

  const size = 260;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = 108;
  const innerR = 48;

  return (
    <InsightPanel
      title="Harmonic map"
      subtitle="Select a key — compatible slots glow, mix partners appear below"
      className="insights-card--wheel"
    >
      <div className="insights-wheel-wrap">
        <svg
          viewBox={`0 0 ${size} ${size}`}
          className="insights-wheel"
          role="img"
          aria-label="Interactive Camelot wheel"
        >
          <circle cx={cx} cy={cy} r={outerR + 4} className="insights-wheel__ring" />
          {wheel.map((cell, index) => {
            const angle = (index / wheel.length) * Math.PI * 2 - Math.PI / 2;
            const midR = (outerR + innerR) / 2;
            const x = cx + Math.cos(angle) * midR;
            const y = cy + Math.sin(angle) * midR;
            const slotW = 24;
            const slotH = 14 + cell.intensity * 16;
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
          <text x={cx} y={cy + 10} textAnchor="middle" className="insights-wheel__core-sub">
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

function HighlightCard({
  insight,
  onAction,
}: {
  insight: ActionableInsight;
  onAction?: (insight: ActionableInsight) => void;
}) {
  const ctaLabel =
    insight.action === 'enrich-metadata'
      ? 'Enrich metadata'
      : insight.action === 'enrich-tracklists'
        ? 'Import tracklists'
        : insight.filter
          ? 'Explore'
          : null;

  return (
    <article className={`insights-highlight insights-highlight--${insight.tone}`}>
      <p className="insights-highlight__title">{insight.title}</p>
      <p className="insights-highlight__body">{insight.body}</p>
      {ctaLabel && onAction ? (
        <button type="button" className="insights-highlight__cta" onClick={() => onAction(insight)}>
          {ctaLabel}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </button>
      ) : null}
    </article>
  );
}

function HealthMeter({
  label,
  value,
  detail,
  emphasis,
}: {
  label: string;
  value: number;
  detail: string;
  emphasis?: boolean;
}) {
  return (
    <div className={`insights-health${emphasis ? ' insights-health--emphasis' : ''}`}>
      <div className="insights-health__head">
        <span>{label}</span>
        <span className="tabular-nums">{formatPct(value)}</span>
      </div>
      <div className="insights-health__track" aria-hidden>
        <div className="insights-health__fill" style={{ transform: `scaleX(${value / 100})` }} />
      </div>
      <p className="insights-health__detail">{detail}</p>
    </div>
  );
}

export function InsightsDashboard({
  records,
  onApplyFilter,
  onOpenCollection,
  onEnrichTracklists,
  onEnrichMetadata,
  onPlayNow,
  onAddToQueue,
  onQueueMany,
  onAddToCrate,
  onAddManyToCrate,
}: InsightsDashboardProps) {
  const insights = useMemo(() => computeCollectionInsights(records), [records]);
  const [activeSection, setActiveSection] = useState<SectionId>('overview');
  const [lens, setLens] = useState<InsightLens | null>(null);
  const [journey, setJourney] = useState<JourneyStep[] | null>(null);
  const [rouletteSpinning, setRouletteSpinning] = useState(false);
  const sectionRefs = useRef<Partial<Record<SectionId, HTMLElement | null>>>({});
  const navRef = useRef<HTMLDivElement>(null);
  const scrollingRef = useRef(false);

  const highlights = insights.actionableInsights.slice(0, 4);
  const heroPct = insights.primaryEnrichmentPct;
  const canBuildJourney = records.filter((r) => {
    const t = r.tracks.find((x) => x.isPrimary) ?? r.tracks[0];
    return t?.bpm != null;
  }).length >= 2;

  const selectedCamelot =
    lens?.kind === 'camelot' ? lens.code : null;
  const selectedBpm =
    lens?.kind === 'bpm' ? lens.label : null;
  const selectedDecade =
    lens?.kind === 'decade' ? lens.label : null;
  const selectedScatterId =
    lens?.kind === 'release' ? lens.recordId : null;

  const setLensFromInsight = useCallback((next: InsightLens | null) => {
    setLens(next);
    if (next?.kind !== 'journey') setJourney(null);
  }, []);

  const handleRoulette = useCallback(
    (bias: RouletteBias) => {
      setRouletteSpinning(true);
      window.setTimeout(() => {
        const result = spinCrateRoulette(records, bias);
        setRouletteSpinning(false);
        if (result) {
          setJourney(null);
          setLens(result.lens);
        }
      }, 420);
    },
    [records]
  );

  const handleBuildJourney = useCallback(() => {
    const steps = buildCrateJourney(records);
    if (!steps) return;
    setJourney(steps);
    setLens({
      kind: 'journey',
      stepIds: steps.map((s) => s.record.id),
    });
  }, [records]);

  const handleInsightAction = useCallback(
    (insight: ActionableInsight) => {
      if (insight.action === 'enrich-metadata') {
        onEnrichMetadata?.();
        return;
      }
      if (insight.action === 'enrich-tracklists') {
        onEnrichTracklists?.();
        return;
      }
      if (insight.filter) {
        if (insight.filter.genre) setLensFromInsight({ kind: 'genre', label: insight.filter.genre });
        else if (insight.filter.camelotKey)
          setLensFromInsight({ kind: 'camelot', code: insight.filter.camelotKey });
        else if (insight.filter.bpmRangeId) {
          const bucket = insights.bpmBuckets.find((b) => {
            const map: Record<string, string> = {
              slow: 'Under 100',
              mid: '100–119',
              dance: '120–129',
              fast: '130+',
            };
            return map[insight.filter!.bpmRangeId!] === b.label;
          });
          const l = bucket ? bpmBucketLens(bucket.label) : null;
          if (l) setLensFromInsight(l);
        } else if (insight.filter.vibe)
          setLensFromInsight({ kind: 'vibe', label: insight.filter.vibe });
        else {
          onApplyFilter?.(insight.filter);
          onOpenCollection?.();
        }
      }
    },
    [insights.bpmBuckets, onApplyFilter, onEnrichMetadata, onEnrichTracklists, onOpenCollection, setLensFromInsight]
  );

  const handleQueueJourney = useCallback(
    (steps: JourneyStep[]) => {
      const items = steps.map((s) => ({ record: s.record, track: s.track }));
      if (onQueueMany) {
        onQueueMany(items, `Set queued · ${steps.length} tracks`);
        return;
      }
      if (!onAddToQueue) return;
      for (const step of steps) onAddToQueue(step.record, step.track);
      toast.success('Set queued', {
        description: `${steps.length} tracks · ${steps[0].role} → ${steps[steps.length - 1].role}`,
      });
    },
    [onAddToQueue, onQueueMany]
  );

  const handleAddJourneyToCrate = useCallback(
    (steps: JourneyStep[]) => {
      const items = steps.map((s) => ({ record: s.record, track: s.track }));
      if (onAddManyToCrate) {
        onAddManyToCrate(
          items,
          `Journey added · ${steps.length} track${steps.length === 1 ? '' : 's'}`
        );
        return;
      }
      if (!onAddToCrate) return;
      for (const step of steps) onAddToCrate(step.record, step.track);
    },
    [onAddToCrate, onAddManyToCrate]
  );

  const scrollToSection = useCallback((id: SectionId) => {
    const el = sectionRefs.current[id];
    if (!el) return;
    scrollingRef.current = true;
    setActiveSection(id);
    const navH = navRef.current?.offsetHeight ?? 0;
    const top = el.getBoundingClientRect().top + window.scrollY - navH - 12;
    window.scrollTo({ top, behavior: 'smooth' });
    window.setTimeout(() => {
      scrollingRef.current = false;
    }, 600);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLensFromInsight(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setLensFromInsight]);

  useEffect(() => {
    const ids = SECTIONS.map((s) => s.id);
    const observer = new IntersectionObserver(
      (entries) => {
        if (scrollingRef.current) return;
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target.id) {
          const id = visible.target.id.replace('insights-', '') as SectionId;
          if (ids.includes(id)) setActiveSection(id);
        }
      },
      { rootMargin: '-30% 0px -55% 0px', threshold: [0, 0.15, 0.4] }
    );

    for (const id of ids) {
      const el = sectionRefs.current[id];
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [records.length]);

  if (records.length === 0) {
    return (
      <section className="insights-page insights-page--empty" aria-label="Collection insights">
        <div className="insights-empty">
          <Sparkles className="insights-empty__icon" strokeWidth={1.25} aria-hidden />
          <h2 className="insights-empty__title">Your insights await</h2>
          <p className="insights-empty__copy">
            Add releases to unlock genre landscapes, BPM profiles, Camelot maps, and set-ready
            recommendations.
          </p>
          {onOpenCollection ? (
            <button type="button" className="btn-primary" onClick={onOpenCollection}>
              Go to collection
            </button>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section className="insights-page" aria-label="Collection insights">
      <div className="insights-shell">
        <header className="insights-topbar">
          <div className="insights-topbar__copy">
            <p className="insights-topbar__kicker">
              <BarChart3 className="h-3.5 w-3.5" aria-hidden />
              Collection analytics
            </p>
            <h1 className="insights-topbar__title">Insights</h1>
          </div>
          <div className="insights-topbar__actions">
            {onOpenCollection ? (
              <button type="button" className="insights-topbar__link" onClick={onOpenCollection}>
                Collection
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </button>
            ) : null}
            {insights.releasesNeedingMetadata > 0 && onEnrichMetadata ? (
              <button type="button" className="insights-topbar__cta" onClick={onEnrichMetadata}>
                <Zap className="h-3.5 w-3.5" aria-hidden />
                Enrich {insights.tracksNeedingMetadata}
              </button>
            ) : null}
          </div>
        </header>

        <div ref={navRef} className="insights-nav" role="tablist" aria-label="Insight sections">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeSection === id}
              className={`insights-nav__tab${activeSection === id ? ' insights-nav__tab--active' : ''}`}
              onClick={() => scrollToSection(id)}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </div>

      {lens ? (
        <InsightExplorer
          key={lensKey(lens)}
          lens={lens}
          records={records}
          journey={journey}
          onClose={() => setLensFromInsight(null)}
          onFilter={onApplyFilter}
          onOpenCollection={onOpenCollection}
          onPlay={onPlayNow}
          onQueue={onAddToQueue}
          onAddToCrate={onAddToCrate}
          onQueueJourney={handleQueueJourney}
          onAddJourneyToCrate={handleAddJourneyToCrate}
          onSelectCamelot={(code) => setLensFromInsight({ kind: 'camelot', code })}
          onSpinAgain={
            lens.kind === 'roulette' ? () => handleRoulette('any') : undefined
          }
        />
      ) : null}

      <div
        id="insights-overview"
        ref={(el) => {
          sectionRefs.current.overview = el;
        }}
        className="insights-section"
      >
        <div className="insights-summary">
          <div className="insights-summary__stats">
            <div className="insights-summary__stat">
              <Disc3 className="insights-summary__icon" aria-hidden />
              <span className="insights-summary__value tabular-nums">{insights.releaseCount}</span>
              <span className="insights-summary__label">Releases</span>
            </div>
            <div className="insights-summary__stat">
              <Music2 className="insights-summary__icon" aria-hidden />
              <span className="insights-summary__value tabular-nums">{insights.trackCount}</span>
              <span className="insights-summary__label">Tracks</span>
            </div>
            <div className="insights-summary__stat">
              <Users className="insights-summary__icon" aria-hidden />
              <span className="insights-summary__value tabular-nums">{insights.artistCount}</span>
              <span className="insights-summary__label">Artists</span>
            </div>
            <div className="insights-summary__stat">
              <Layers className="insights-summary__icon" aria-hidden />
              <span className="insights-summary__value tabular-nums">
                {insights.avgBpm != null ? insights.avgBpm : '—'}
              </span>
              <span className="insights-summary__label">
                Avg BPM
                {insights.medianBpm != null ? ` · med ${insights.medianBpm}` : ''}
              </span>
            </div>
          </div>

          <div className="insights-summary__pulse" aria-label={`${heroPct}% primary tracks ready`}>
            <svg viewBox="0 0 96 96" className="insights-summary__ring" role="presentation">
              <circle cx="48" cy="48" r="40" className="insights-ring__track" />
              <circle
                cx="48"
                cy="48"
                r="40"
                className="insights-ring__progress"
                strokeDasharray={`${(heroPct / 100) * 251} 251`}
              />
            </svg>
            <div className="insights-summary__ring-label">
              <span className="insights-summary__ring-value tabular-nums">{heroPct}%</span>
              <span className="insights-summary__ring-hint">primary ready</span>
            </div>
          </div>
        </div>

        <PlayfulTools
          onRoulette={handleRoulette}
          onBuildJourney={handleBuildJourney}
          canBuildJourney={canBuildJourney}
          spinning={rouletteSpinning}
        />

        <div className="insights-tags">
          <span className="insights-badge">{insights.energyLabel}</span>
          {insights.yearRange ? (
            <span className="insights-badge insights-badge--muted">{insights.yearRange}</span>
          ) : null}
          {insights.topGenre ? (
            <button
              type="button"
              className="insights-badge insights-badge--muted insights-badge--clickable"
              onClick={() => setLensFromInsight({ kind: 'genre', label: insights.topGenre!.name })}
            >
              {insights.topGenre.name}
            </button>
          ) : null}
          {insights.topCamelot ? (
            <button
              type="button"
              className="insights-badge insights-badge--muted insights-badge--clickable"
              onClick={() => setLensFromInsight({ kind: 'camelot', code: insights.topCamelot!.code })}
            >
              Key {insights.topCamelot.code}
            </button>
          ) : null}
        </div>

        {highlights.length > 0 ? (
          <div className="insights-highlights" aria-label="Key takeaways">
            {highlights.map((insight) => (
              <HighlightCard key={insight.id} insight={insight} onAction={handleInsightAction} />
            ))}
          </div>
        ) : null}
      </div>

      <div
        id="insights-sound"
        ref={(el) => {
          sectionRefs.current.sound = el;
        }}
        className="insights-section"
      >
        <h2 className="insights-section__title">Sound & genre</h2>
        <p className="insights-section__lead">Tap a segment — preview releases, then filter or play.</p>
        <div className="insights-bento">
          <div className="insights-bento__cell insights-bento__cell--8">
            <InsightTreemapChart
              title="Genre landscape"
              subtitle="Share of shelf by primary genre"
              cells={insights.genreTreemap}
              onCellClick={(cell) => setLensFromInsight({ kind: 'genre', label: cell.label })}
            />
          </div>
          <div className="insights-bento__cell insights-bento__cell--4">
            <InsightDonutChart
              title="Format mix"
              subtitle="Vinyl, reissues & pressings"
              items={insights.formatCounts}
              onSliceClick={(item) => setLensFromInsight({ kind: 'format', label: item.label })}
            />
          </div>
          <div className="insights-bento__cell insights-bento__cell--6">
            <InsightBarChart
              title="Top artists"
              subtitle="Tap to see their releases"
              items={insights.topArtists}
              accent="coral"
              selectedLabel={lens?.kind === 'artist' ? lens.label : null}
              onItemClick={(item) => setLensFromInsight({ kind: 'artist', label: item.label })}
              compact
            />
          </div>
          {insights.vibeRadar.length >= 3 ? (
            <div className="insights-bento__cell insights-bento__cell--6">
              <InsightRadarChart
                title="Vibe signature"
                subtitle="Tag frequency — tap to explore"
                axes={insights.vibeRadar}
                onAxisClick={(axis) => setLensFromInsight({ kind: 'vibe', label: axis.label })}
              />
            </div>
          ) : null}
        </div>
      </div>

      <div
        id="insights-tempo"
        ref={(el) => {
          sectionRefs.current.tempo = el;
        }}
        className="insights-section"
      >
        <h2 className="insights-section__title">Tempo & era</h2>
        <p className="insights-section__lead">Plot your crate in time — tap dots to pull up a release.</p>
        <div className="insights-bento">
          <div className="insights-bento__cell insights-bento__cell--12">
            <InsightScatterChart
              title="Tempo vs era"
              subtitle="Each dot is a release — year × primary-track BPM"
              points={insights.scatterPoints}
              selectedId={selectedScatterId}
              onPointSelect={(point) =>
                setLensFromInsight({
                  kind: 'release',
                  recordId: point.id,
                  label: point.label,
                })
              }
            />
          </div>
          <div className="insights-bento__cell insights-bento__cell--6">
            <InsightBarChart
              title="BPM buckets"
              subtitle="Tempo zones in your library"
              items={insights.bpmBuckets}
              selectedLabel={selectedBpm}
              onItemClick={(item) => {
                const l = bpmBucketLens(item.label);
                if (l) setLensFromInsight(l);
              }}
            />
          </div>
          <div className="insights-bento__cell insights-bento__cell--6">
            <InsightBarChart
              title="Decade spread"
              subtitle="Releases per decade"
              items={insights.decadeCounts}
              accent="violet"
              selectedLabel={selectedDecade}
              onItemClick={(item) => setLensFromInsight({ kind: 'decade', label: item.label })}
            />
          </div>
        </div>
      </div>

      <div
        id="insights-harmonic"
        ref={(el) => {
          sectionRefs.current.harmonic = el;
        }}
        className="insights-section"
      >
        <h2 className="insights-section__title">Harmonic keys</h2>
        <p className="insights-section__lead">DJ-style key mixing — see partners light up on the wheel.</p>
        <div className="insights-bento">
          <div className="insights-bento__cell insights-bento__cell--7">
            <CamelotWheel
              wheel={insights.camelotWheel}
              selectedCode={selectedCamelot}
              onKeySelect={(code) => setLensFromInsight({ kind: 'camelot', code })}
            />
          </div>
          <div className="insights-bento__cell insights-bento__cell--5">
            {insights.keyCounts.length > 0 ? (
              <InsightPanel title="Top keys" subtitle="Quick jump to a Camelot code">
                <div className="insights-key-chips">
                  {insights.keyCounts.map((k) => (
                    <button
                      key={k.label}
                      type="button"
                      className={`insights-key-chip tabular-nums${selectedCamelot === k.label ? ' insights-key-chip--selected' : ''}`}
                      onClick={() => setLensFromInsight({ kind: 'camelot', code: k.label })}
                    >
                      {k.label}
                      <span className="insights-key-chip__count">{k.count}</span>
                    </button>
                  ))}
                </div>
              </InsightPanel>
            ) : (
              <InsightPanel title="Top keys" subtitle="Run metadata enrichment to populate keys">
                <p className="insights-card__empty">
                  No key data yet.
                  {onEnrichMetadata ? (
                    <>
                      {' '}
                      <button type="button" className="insights-inline-link" onClick={onEnrichMetadata}>
                        Enrich metadata
                      </button>
                    </>
                  ) : null}
                </p>
              </InsightPanel>
            )}
          </div>
        </div>
      </div>

      <div
        id="insights-health"
        ref={(el) => {
          sectionRefs.current.health = el;
        }}
        className="insights-section insights-section--last"
      >
        <h2 className="insights-section__title">Crate health</h2>
        <p className="insights-section__lead">Metadata depth across three tiers.</p>
        <div className="insights-bento">
          <div className="insights-bento__cell insights-bento__cell--12">
            <InsightPanel title="Enrichment depth" subtitle="What percentage of your library is DJ-ready">
              <div className="insights-health-grid">
                {insights.enrichmentTiers.map((tier) => (
                  <HealthMeter
                    key={tier.id}
                    label={tier.label}
                    value={tier.value}
                    detail={tier.detail}
                    emphasis={tier.id === 'primary'}
                  />
                ))}
                <HealthMeter
                  label="Discogs linked"
                  value={pct(insights.discogsLinkedCount, insights.releaseCount)}
                  detail={`${insights.discogsLinkedCount} releases with Discogs IDs`}
                />
                <HealthMeter
                  label="Marked played"
                  value={insights.playedPct}
                  detail={`${insights.playedCount} releases spun recently`}
                />
              </div>
              {insights.releasesNeedingMetadata > 0 && onEnrichMetadata ? (
                <div className="insights-health-actions">
                  <button type="button" className="insights-health-cta" onClick={onEnrichMetadata}>
                    <KeyRound className="h-3.5 w-3.5" aria-hidden />
                    Enrich {insights.tracksNeedingMetadata} tracks
                  </button>
                  {onEnrichTracklists && insights.discogsLinkedCount > 0 ? (
                    <button
                      type="button"
                      className="insights-health-cta insights-health-cta--ghost"
                      onClick={onEnrichTracklists}
                    >
                      <Disc3 className="h-3.5 w-3.5" aria-hidden />
                      Import tracklists
                    </button>
                  ) : null}
                </div>
              ) : null}
            </InsightPanel>
          </div>
        </div>
      </div>

      {rouletteSpinning ? (
        <div className="insights-roulette-overlay" aria-hidden>
          <div className="insights-roulette-overlay__spinner" />
          <p>Shuffling the crate…</p>
        </div>
      ) : null}
    </section>
  );
}

function pct(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((part / total) * 100);
}