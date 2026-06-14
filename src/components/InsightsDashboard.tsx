import {
  ArrowRight,
  BarChart3,
  Calendar,
  ChevronRight,
  Disc3,
  Gem,
  Heart,
  HeartPulse,
  KeyRound,
  Layers,
  Music2,
  Sparkles,
  TrendingUp,
  Users,
  Waves,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  computeCollectionInsights,
  type ActionableInsight,
  type CollectionInsights,
  type InsightFilterAction,
  type NarrativeInsight,
} from '../lib/collectionInsights';
import {
  artistChartLabelToLens,
  bpmBucketLens,
  buildCrateJourney,
  curatedArtistChartLabelToLens,
  type InsightLens,
  type JourneyStep,
  spinCrateRoulette,
  type RouletteBias,
} from '../lib/insightInteractions';
import type { Track, VinylRecord } from '../lib/types';
import { CamelotWheel } from './insights/CamelotWheel';
import {
  ChartBar,
  ChartCompletionRing,
  ChartDecadeLine,
  ChartDoughnut,
  ChartScatterBpm,
  ChartVibeRadar,
} from './insights/InsightChartJs';
import { CollectionValueSection } from './insights/CollectionValueSection';
import { InsightExplorer } from './insights/InsightExplorer';
import { PlayfulTools } from './insights/PlayfulTools';
import { useCollectionValuation } from '../hooks/useCollectionValuation';

type InsightsDashboardProps = {
  records: VinylRecord[];
  onApplyFilter?: (patch: InsightFilterAction) => void;
  onOpenCollection?: () => void;
  onEnrichTracklists?: () => void;
  onEnrichMetadata?: () => void;
  onPlayNow?: (record: VinylRecord, track: Track) => void;
  onAddToQueue?: (record: VinylRecord, track: Track) => void;
  onQueueMany?: (items: { record: VinylRecord; track: Track }[], label?: string) => void;
};

type SectionId = 'overview' | 'value' | 'picks' | 'collection' | 'artists' | 'sound' | 'dj' | 'health';

const SECTIONS: { id: SectionId; label: string; icon: typeof BarChart3 }[] = [
  { id: 'overview', label: 'Overview', icon: Sparkles },
  { id: 'value', label: 'Value', icon: Gem },
  { id: 'picks', label: 'Your picks', icon: Heart },
  { id: 'collection', label: 'Collection', icon: Layers },
  { id: 'artists', label: 'Artists', icon: Users },
  { id: 'sound', label: 'Sound', icon: Waves },
  { id: 'dj', label: 'DJ tools', icon: Music2 },
  { id: 'health', label: 'Health', icon: HeartPulse },
];

const NARRATIVE_ICONS: Record<NarrativeInsight['icon'], typeof Sparkles> = {
  era: Calendar,
  artist: Users,
  genre: Layers,
  tempo: TrendingUp,
  health: HeartPulse,
  value: Gem,
  discovery: Disc3,
  compilation: Layers,
  picks: Heart,
};

function lensKey(lens: InsightLens): string {
  switch (lens.kind) {
    case 'genre':
    case 'format':
    case 'vibe':
    case 'artist':
    case 'decade':
    case 'bpm':
      return `${lens.kind}:${lens.label}`;
    case 'compilation':
      return `compilation:${lens.scope}`;
    case 'curated-artist':
      return `curated-artist:${lens.label}`;
    case 'curated':
      return `curated:${lens.scope}`;
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

function tabForLens(lens: InsightLens): SectionId {
  switch (lens.kind) {
    case 'genre':
    case 'format':
    case 'vibe':
    case 'artist':
      return 'artists';
    case 'compilation':
    case 'curated-artist':
    case 'curated':
      return 'picks';
    case 'decade':
      return 'collection';
    case 'camelot':
    case 'bpm':
    case 'release':
    case 'roulette':
    case 'journey':
      return 'dj';
    default:
      return 'overview';
  }
}

function formatPct(value: number): string {
  return `${value}%`;
}

function pct(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((part / total) * 100);
}

function HeroNarrative({ insights }: { insights: CollectionInsights }) {
  const lead = insights.narrativeInsights[0];

  return (
    <div className="insights-v2-hero__story">
      <p className="insights-v2-hero__energy">{insights.energyLabel}</p>
      <p className="insights-v2-hero__narrative">{insights.sectionInsights.overview}</p>
      {lead && lead.id !== 'compilation-lane' ? (
        <p className="insights-v2-hero__sub">{lead.body}</p>
      ) : insights.narrativeInsights[1] ? (
        <p className="insights-v2-hero__sub">{insights.narrativeInsights[1].body}</p>
      ) : null}
    </div>
  );
}

function SectionProse({ text }: { text: string }) {
  if (!text.trim()) return null;
  return <p className="insights-v2-prose">{text}</p>;
}

type KpiItem = {
  label: string;
  value: string | number;
  icon: typeof Disc3;
  hint?: string;
};

function KpiCard({ item }: { item: KpiItem }) {
  const Icon = item.icon;
  return (
    <article className="insights-v2-kpi__card" role="listitem">
      <div className="insights-v2-kpi__top">
        <Icon className="insights-v2-kpi__icon" aria-hidden />
        <span className="insights-v2-kpi__value tabular-nums">{item.value}</span>
      </div>
      <span className="insights-v2-kpi__label">{item.label}</span>
      {item.hint ? <span className="insights-v2-kpi__hint">{item.hint}</span> : null}
    </article>
  );
}

function KpiGrid({ insights }: { insights: CollectionInsights }) {
  const shelf: KpiItem[] = [
    { label: 'Releases', value: insights.releaseCount, icon: Disc3 },
    { label: 'Tracks', value: insights.trackCount, icon: Music2 },
    {
      label: 'Artists',
      value: insights.namedArtistCount,
      icon: Users,
      hint:
        insights.compilationCount > 0
          ? `+${insights.compilationCount} comps`
          : undefined,
    },
    {
      label: 'Avg year',
      value: insights.avgYear ?? '—',
      icon: Calendar,
      hint: insights.medianYear ? `med ${insights.medianYear}` : undefined,
    },
  ];

  const signals: KpiItem[] = [
    {
      label: insights.curated.trackCount >= 3 ? 'Top pick' : 'Top artist',
      value:
        insights.curated.trackCount >= 3
          ? (insights.curated.topArtist?.trackCount ?? '—')
          : (insights.topArtist?.count ?? '—'),
      icon: insights.curated.trackCount >= 3 ? Heart : TrendingUp,
      hint:
        insights.curated.trackCount >= 3
          ? insights.curated.topArtist?.name
          : insights.topArtist?.name,
    },
    {
      label: 'Curated',
      value: insights.curated.trackCount,
      icon: Sparkles,
      hint:
        insights.curated.trackCount > 0
          ? `${insights.curated.trackPct}% of library`
          : 'add ratings',
    },
    {
      label: 'Mix-ready',
      value: formatPct(insights.primaryEnrichmentPct),
      icon: Zap,
      hint: 'BPM & key on lead',
    },
  ];

  return (
    <div className="insights-v2-kpi-wrap">
      <div className="insights-v2-kpi insights-v2-kpi--shelf" role="list" aria-label="Shelf stats">
        {shelf.map((item) => (
          <KpiCard key={item.label} item={item} />
        ))}
      </div>
      <div className="insights-v2-kpi insights-v2-kpi--signals" role="list" aria-label="Taste signals">
        {signals.map((item) => (
          <KpiCard key={item.label} item={item} />
        ))}
      </div>
    </div>
  );
}

function NarrativeGrid({
  insights,
  onSelectLens,
}: {
  insights: CollectionInsights;
  onSelectLens: (lens: InsightLens) => void;
}) {
  return (
    <div className="insights-v2-narratives">
      {insights.narrativeInsights.map((item) => {
        const Icon = NARRATIVE_ICONS[item.icon];
        const gapArtist = insights.curated.preferenceGaps[0]?.artist;
        const lens: InsightLens | null =
          item.id === 'curated-picks' && insights.curated.topArtist
            ? curatedArtistChartLabelToLens(insights.curated.topArtist.name)
            : item.id === 'preference-gap' && gapArtist
              ? { kind: 'artist', label: gapArtist }
              : item.icon === 'compilation' && insights.compilationCount > 0
                ? { kind: 'compilation', scope: 'all' }
                : item.icon === 'genre' && insights.topGenre
                  ? { kind: 'genre', label: insights.topGenre.name }
                  : item.icon === 'artist' && insights.topArtist
                    ? { kind: 'artist', label: insights.topArtist.name }
                    : item.icon === 'era' && insights.dominantDecade
                      ? { kind: 'decade', label: insights.dominantDecade }
                      : null;

        return (
          <article key={item.id} className={`insights-v2-narrative insights-v2-narrative--${item.icon}`}>
            <div className="insights-v2-narrative__head">
              <span className="insights-v2-narrative__icon-wrap" aria-hidden>
                <Icon className="insights-v2-narrative__icon" />
              </span>
              <h3 className="insights-v2-narrative__title">{item.headline}</h3>
            </div>
            <p className="insights-v2-narrative__body">{item.body}</p>
            {lens ? (
              <button type="button" className="insights-v2-narrative__cta" onClick={() => onSelectLens(lens)}>
                Explore
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </button>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

function PreferenceGaps({
  insights,
  onSelectArtist,
}: {
  insights: CollectionInsights;
  onSelectArtist: (artist: string) => void;
}) {
  if (insights.curated.preferenceGaps.length === 0) return null;

  return (
    <div className="insights-v2-gaps">
      <h3 className="insights-v2-section__subtitle">Owned, not curated</h3>
      <p className="insights-v2-gaps__lead">
        Multiple copies on the shelf but no manual BPM or ratings — often &quot;have it, don&apos;t
        reach for it&quot; territory.
      </p>
      <ul className="insights-v2-gaps__list" role="list">
        {insights.curated.preferenceGaps.map((gap) => (
          <li key={gap.artist}>
            <button
              type="button"
              className="insights-v2-gaps__row"
              onClick={() => onSelectArtist(gap.artist)}
            >
              <span className="insights-v2-gaps__artist">{gap.artist}</span>
              <span className="insights-v2-gaps__meta tabular-nums">
                {gap.ownedCount} owned · 0 picks
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CuratedTrackList({
  insights,
  onSelectRelease,
}: {
  insights: CollectionInsights;
  onSelectRelease: (recordId: string, label: string) => void;
}) {
  if (insights.curated.topTracks.length === 0) return null;

  return (
    <div className="insights-v2-curated-tracks">
      <h3 className="insights-v2-section__subtitle">Strongest signals</h3>
      <ul className="insights-v2-curated-tracks__list" role="list">
        {insights.curated.topTracks.map((row) => (
          <li key={`${row.recordId}-${row.trackId}`}>
            <button
              type="button"
              className="insights-v2-curated-tracks__row"
              onClick={() =>
                onSelectRelease(row.recordId, `${row.artist} — ${row.trackTitle}`)
              }
            >
              <div className="insights-v2-curated-tracks__copy">
                <p className="insights-v2-curated-tracks__title">{row.trackTitle}</p>
                <p className="insights-v2-curated-tracks__sub">
                  {row.artist} · {row.releaseTitle}
                </p>
              </div>
              <div className="insights-v2-curated-tracks__badges">
                {row.cutRating ? (
                  <span className={`insights-v2-curated-tracks__badge insights-v2-curated-tracks__badge--${row.cutRating.toLowerCase().replace('+', 'plus')}`}>
                    {row.cutRating}
                  </span>
                ) : null}
                {row.hasManualBpm ? (
                  <span className="insights-v2-curated-tracks__badge insights-v2-curated-tracks__badge--bpm">
                    BPM
                  </span>
                ) : null}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ActionCard({
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
          ? 'View in collection'
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

function NotableList({
  insights,
  onSelectRelease,
}: {
  insights: CollectionInsights;
  onSelectRelease: (id: string, label: string) => void;
}) {
  if (insights.notableRecords.length === 0) return null;

  return (
    <div className="insights-v2-notables">
      <h3 className="insights-v2-section__subtitle">Notable pressings</h3>
      <ul className="insights-v2-notables__list" role="list">
        {insights.notableRecords.map((row) => (
          <li key={`${row.id}-${row.reason}`}>
            <button
              type="button"
              className="insights-v2-notables__row"
              onClick={() => onSelectRelease(row.id, `${row.artist} — ${row.title}`)}
            >
              <div className="insights-v2-notables__copy">
                <p className="insights-v2-notables__title">{row.artist}</p>
                <p className="insights-v2-notables__sub">{row.title}</p>
              </div>
              <div className="insights-v2-notables__meta">
                <span className="insights-v2-notables__reason">{row.reason}</span>
                <span className="insights-v2-notables__metric tabular-nums">{row.metric}</span>
              </div>
            </button>
          </li>
        ))}
      </ul>
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
}: InsightsDashboardProps) {
  const insights = useMemo(() => computeCollectionInsights(records), [records]);
  const { state: valuationState, linkedCount: valuationLinkedCount, refresh: refreshValuation } =
    useCollectionValuation(records);
  const [activeSection, setActiveSection] = useState<SectionId>('overview');
  const [lens, setLens] = useState<InsightLens | null>(null);
  const [journey, setJourney] = useState<JourneyStep[] | null>(null);
  const [rouletteSpinning, setRouletteSpinning] = useState(false);
  const sectionRefs = useRef<Partial<Record<SectionId, HTMLElement | null>>>({});

  const canBuildJourney = records.filter((r) => {
    const t = r.tracks.find((x) => x.isPrimary) ?? r.tracks[0];
    return t?.bpm != null;
  }).length >= 2;

  const selectedCamelot = lens?.kind === 'camelot' ? lens.code : null;
  const selectedScatterId = lens?.kind === 'release' ? lens.recordId : null;

  const setLensFromInsight = useCallback((next: InsightLens | null) => {
    setLens(next);
    if (next?.kind !== 'journey') setJourney(null);
    if (next) setActiveSection(tabForLens(next));
  }, []);

  const scrollToSection = useCallback((id: SectionId) => {
    setActiveSection(id);
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
          setActiveSection('dj');
        }
      }, 420);
    },
    [records]
  );

  const handleBuildJourney = useCallback(() => {
    const steps = buildCrateJourney(records);
    if (!steps) return;
    setJourney(steps);
    setLens({ kind: 'journey', stepIds: steps.map((s) => s.record.id) });
    setActiveSection('dj');
  }, [records]);

  const handleInsightAction = useCallback(
    (insight: ActionableInsight) => {
      if (insight.action === 'enrich-metadata') {
        onEnrichMetadata?.();
        scrollToSection('health');
        return;
      }
      if (insight.action === 'enrich-tracklists') {
        onEnrichTracklists?.();
        scrollToSection('health');
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
    [
      insights.bpmBuckets,
      onApplyFilter,
      onEnrichMetadata,
      onEnrichTracklists,
      onOpenCollection,
      scrollToSection,
      setLensFromInsight,
    ]
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLensFromInsight(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setLensFromInsight]);

  useEffect(() => {
    if (!lens) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [lens]);

  useEffect(() => {
    const nodes = SECTIONS.map((s) => sectionRefs.current[s.id]).filter(Boolean) as HTMLElement[];
    if (nodes.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target.id) {
          const id = visible.target.id.replace('insights-', '') as SectionId;
          if (SECTIONS.some((s) => s.id === id)) setActiveSection(id);
        }
      },
      { rootMargin: '-30% 0px -55% 0px', threshold: [0.1, 0.25, 0.5] }
    );

    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
  }, [records.length]);

  if (records.length === 0) {
    return (
      <section className="insights-page insights-page--empty" aria-label="Collection insights">
        <div className="insights-empty">
          <Sparkles className="insights-empty__icon" strokeWidth={1.25} aria-hidden />
          <h2 className="insights-empty__title">Your insights await</h2>
          <p className="insights-empty__copy">
            Add releases to unlock genre landscapes, era timelines, DJ maps, and smart observations
            about your crate.
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

  const completionSegments = [
    { label: 'Mix-ready', value: insights.primaryEnrichmentPct },
    { label: 'Tracklists', value: insights.tracklistCompletePct },
    { label: 'Played', value: insights.playedPct },
    { label: 'Discogs', value: pct(insights.discogsLinkedCount, insights.releaseCount) },
  ];

  return (
    <section className="insights-page insights-v2" aria-label="Collection insights">
      <header className="insights-v2-hero">
        <div className="insights-v2-hero__top">
          <div>
            <p className="insights-v2-hero__kicker">
              <BarChart3 className="h-3.5 w-3.5" aria-hidden />
              Collection intelligence
            </p>
            <h1 className="insights-v2-hero__title">Insights</h1>
          </div>
          <div className="insights-v2-hero__actions">
            {onOpenCollection ? (
              <button type="button" className="insights-v2-hero__link" onClick={onOpenCollection}>
                Collection
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </button>
            ) : null}
            {insights.releasesNeedingMetadata > 0 && onEnrichMetadata ? (
              <button
                type="button"
                className="insights-v2-hero__cta"
                onClick={() => {
                  scrollToSection('health');
                  onEnrichMetadata();
                }}
              >
                <Zap className="h-3.5 w-3.5" aria-hidden />
                Enrich {insights.tracksNeedingMetadata}
              </button>
            ) : null}
          </div>
        </div>
        <div className="insights-v2-hero__content">
          <HeroNarrative insights={insights} />
          <KpiGrid insights={insights} />
        </div>
      </header>

      <nav className="insights-v2-nav" aria-label="Insight sections">
        <div className="insights-v2-nav__track" role="tablist">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeSection === id}
              className={`insights-v2-nav__tab${activeSection === id ? ' insights-v2-nav__tab--active' : ''}`}
              onClick={() => scrollToSection(id)}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </nav>

      <div className="insights-v2-layout">
        <main className="insights-v2-main">
          <section
            id="insights-overview"
            ref={(el) => {
              sectionRefs.current.overview = el;
            }}
            className="insights-v2-section"
          >
            <header className="insights-v2-section__head">
              <h2 className="insights-v2-section__title">Overview</h2>
              <p className="insights-v2-section__lead">
                {insights.narrativeInsights.length} observations from {insights.releaseCount}{' '}
                releases — tap any card to explore matching records.
              </p>
            </header>
            <NarrativeGrid insights={insights} onSelectLens={setLensFromInsight} />
            {insights.actionableInsights.length > 0 ? (
              <div className="insights-highlights insights-highlights--glance">
                {insights.actionableInsights.slice(0, 3).map((insight) => (
                  <ActionCard key={insight.id} insight={insight} onAction={handleInsightAction} />
                ))}
              </div>
            ) : null}
          </section>

          <section
            id="insights-value"
            ref={(el) => {
              sectionRefs.current.value = el;
            }}
            className="insights-v2-section"
          >
            <CollectionValueSection
              state={valuationState}
              linkedCount={valuationLinkedCount}
              onRefresh={() => void refreshValuation()}
              onSelectRecord={(id, label) =>
                setLensFromInsight({ kind: 'release', recordId: id, label })
              }
            />
          </section>

          <section
            id="insights-picks"
            ref={(el) => {
              sectionRefs.current.picks = el;
            }}
            className="insights-v2-section insights-v2-section--picks"
          >
            <header className="insights-v2-section__head">
              <h2 className="insights-v2-section__title">Your picks</h2>
              <p className="insights-v2-section__lead">
                Tracks you&apos;ve marked with manual BPM or G / VG / VG+ ratings — your taste, not
                just your shelf.
              </p>
              <SectionProse text={insights.sectionInsights.picks} />
            </header>

            {insights.curated.trackCount === 0 ? (
              <div className="insights-v2-picks-empty">
                <Heart className="insights-v2-picks-empty__icon" strokeWidth={1.25} aria-hidden />
                <p className="insights-v2-picks-empty__title">No curated tracks yet</p>
                <p className="insights-v2-picks-empty__copy">
                  Add manual BPM or rate a cut (G, VG, VG+) on tracks you actually play. Those
                  signals power preference insights and surface your real favourites over bulk
                  ownership.
                </p>
              </div>
            ) : (
              <>
                <div className="insights-v2-picks-stats" role="list">
                  <article className="insights-v2-picks-stat" role="listitem">
                    <span className="insights-v2-picks-stat__value tabular-nums">
                      {insights.curated.trackCount}
                    </span>
                    <span className="insights-v2-picks-stat__label">Curated tracks</span>
                    <span className="insights-v2-picks-stat__hint">
                      {insights.curated.trackPct}% of library
                    </span>
                  </article>
                  <article className="insights-v2-picks-stat" role="listitem">
                    <span className="insights-v2-picks-stat__value tabular-nums">
                      {insights.curated.manualBpmCount}
                    </span>
                    <span className="insights-v2-picks-stat__label">Manual BPM</span>
                  </article>
                  <article className="insights-v2-picks-stat" role="listitem">
                    <span className="insights-v2-picks-stat__value tabular-nums">
                      {insights.curated.ratedTrackCount}
                    </span>
                    <span className="insights-v2-picks-stat__label">Rated cuts</span>
                    <span className="insights-v2-picks-stat__hint">
                      {insights.curated.vgPlusCount} VG+
                    </span>
                  </article>
                  <article className="insights-v2-picks-stat" role="listitem">
                    <span className="insights-v2-picks-stat__value tabular-nums">
                      {insights.curated.avgBpm ?? '—'}
                    </span>
                    <span className="insights-v2-picks-stat__label">Avg BPM (picks)</span>
                  </article>
                </div>

                <div className="insights-v2-grid insights-v2-grid--charts-lg">
                  {insights.curated.topArtists.length > 0 ? (
                    <div className="insights-v2-grid__cell insights-v2-grid__cell--7">
                      <ChartBar
                        title="Artists you reach for"
                        subtitle="Curated track count — manual BPM or rating per track"
                        items={insights.curated.topArtists.map((a) => ({
                          label: a.label,
                          count: a.count,
                        }))}
                        horizontal
                        large
                        onBarClick={(item) =>
                          setLensFromInsight(curatedArtistChartLabelToLens(item.label))
                        }
                        accentIndex={0}
                      />
                    </div>
                  ) : null}
                  {insights.curated.topGenres.length > 0 ? (
                    <div className="insights-v2-grid__cell insights-v2-grid__cell--5">
                      <ChartDoughnut
                        title="Pick genres"
                        subtitle="Genre tags on curated tracks"
                        items={insights.curated.topGenres.map((g) => ({
                          label: g.label,
                          count: g.count,
                        }))}
                        onSliceClick={(item) =>
                          setLensFromInsight({ kind: 'genre', label: item.label })
                        }
                      />
                    </div>
                  ) : null}
                  {insights.curated.bpmBuckets.length > 0 ? (
                    <div className="insights-v2-grid__cell insights-v2-grid__cell--6">
                      <ChartBar
                        title="Tempo of your picks"
                        subtitle="BPM zones on curated tracks only"
                        items={insights.curated.bpmBuckets}
                        accentIndex={3}
                      />
                    </div>
                  ) : null}
                </div>

                <div className="insights-v2-picks-detail">
                  <CuratedTrackList
                    insights={insights}
                    onSelectRelease={(id, label) =>
                      setLensFromInsight({ kind: 'release', recordId: id, label })
                    }
                  />
                  <PreferenceGaps
                    insights={insights}
                    onSelectArtist={(artist) =>
                      setLensFromInsight({ kind: 'artist', label: artist })
                    }
                  />
                </div>
              </>
            )}
          </section>

          <section
            id="insights-collection"
            ref={(el) => {
              sectionRefs.current.collection = el;
            }}
            className="insights-v2-section"
          >
            <header className="insights-v2-section__head">
              <h2 className="insights-v2-section__title">Collection DNA</h2>
              <p className="insights-v2-section__lead">
                Genre, era, format, and condition — how your shelf is composed.
              </p>
              <SectionProse text={insights.sectionInsights.collection} />
            </header>
            <div className="insights-v2-grid insights-v2-grid--charts-lg">
              <div className="insights-v2-grid__cell insights-v2-grid__cell--6">
                <ChartDoughnut
                  title="Genre breakdown"
                  subtitle="Primary genre tags across releases"
                  items={insights.topGenres}
                  onSliceClick={(item) => setLensFromInsight({ kind: 'genre', label: item.label })}
                />
              </div>
              <div className="insights-v2-grid__cell insights-v2-grid__cell--6">
                <ChartDecadeLine
                  title="Era distribution"
                  subtitle="Releases per decade — tap a point to explore"
                  items={insights.decadeCounts}
                  onPointClick={(item) => setLensFromInsight({ kind: 'decade', label: item.label })}
                />
              </div>
              <div className="insights-v2-grid__cell insights-v2-grid__cell--4">
                <ChartDoughnut
                  title="Format mix"
                  subtitle="Vinyl, reissues & pressings"
                  items={insights.formatCounts}
                  onSliceClick={(item) => setLensFromInsight({ kind: 'format', label: item.label })}
                  cutout="58%"
                />
              </div>
              <div className="insights-v2-grid__cell insights-v2-grid__cell--8">
                <ChartBar
                  title="Condition grades"
                  subtitle="Shelf copy quality"
                  items={insights.conditionCounts}
                  horizontal
                  accentIndex={2}
                />
              </div>
            </div>
          </section>

          <section
            id="insights-artists"
            ref={(el) => {
              sectionRefs.current.artists = el;
            }}
            className="insights-v2-section"
          >
            <header className="insights-v2-section__head">
              <h2 className="insights-v2-section__title">Artists & depth</h2>
              <p className="insights-v2-section__lead">
                What you own — not necessarily what you play. See{' '}
                <span className="insights-v2-emphasis">Your picks</span> for manual BPM and rated
                tracks.
                {insights.topArtist
                  ? ` Most copies: ${insights.topArtist.name} (${insights.topArtist.count}).`
                  : ` ${insights.namedArtistCount} named artists.`}
              </p>
              <SectionProse text={insights.sectionInsights.artists} />
            </header>
            <div className="insights-v2-grid insights-v2-grid--charts-lg">
              <div className="insights-v2-grid__cell insights-v2-grid__cell--12">
                <ChartBar
                  title="Shelf leaders"
                  subtitle="Compilations = Discogs Various · tap any bar to explore"
                  items={insights.topArtists}
                  horizontal
                  onBarClick={(item) => setLensFromInsight(artistChartLabelToLens(item.label))}
                  accentIndex={1}
                  large
                />
              </div>
            </div>
          </section>

          <section
            id="insights-sound"
            ref={(el) => {
              sectionRefs.current.sound = el;
            }}
            className="insights-v2-section"
          >
            <header className="insights-v2-section__head">
              <h2 className="insights-v2-section__title">Sound profile</h2>
              <p className="insights-v2-section__lead">
                Tempo, vibe, and era — {insights.avgBpm != null ? `averaging ${insights.avgBpm} BPM` : 'enrich metadata for BPM data'}.
              </p>
              <SectionProse text={insights.sectionInsights.sound} />
            </header>
            <div className="insights-v2-grid insights-v2-grid--charts-lg">
              <div className="insights-v2-grid__cell insights-v2-grid__cell--12">
                <ChartScatterBpm
                  title="Tempo vs era"
                  subtitle="Each point is a release — year × primary-track BPM"
                  points={insights.scatterPoints}
                  selectedId={selectedScatterId}
                  onPointSelect={(point) =>
                    setLensFromInsight({ kind: 'release', recordId: point.id, label: point.label })
                  }
                />
              </div>
              <div className="insights-v2-grid__cell insights-v2-grid__cell--6">
                <ChartBar
                  title="BPM zones"
                  subtitle="Tempo buckets in your library"
                  items={insights.bpmBuckets}
                  onBarClick={(item) => {
                    const l = bpmBucketLens(item.label);
                    if (l) setLensFromInsight(l);
                  }}
                />
              </div>
              {insights.vibeRadar.length >= 3 ? (
                <div className="insights-v2-grid__cell insights-v2-grid__cell--6">
                  <ChartVibeRadar
                    title="Vibe signature"
                    subtitle="Tag frequency — tap an axis to filter"
                    axes={insights.vibeRadar}
                    onAxisClick={(axis) => setLensFromInsight({ kind: 'vibe', label: axis.label })}
                  />
                </div>
              ) : null}
            </div>
          </section>

          <section
            id="insights-dj"
            ref={(el) => {
              sectionRefs.current.dj = el;
            }}
            className="insights-v2-section"
          >
            <header className="insights-v2-section__head">
              <h2 className="insights-v2-section__title">DJ tools</h2>
              <p className="insights-v2-section__lead">
                Harmonic mixing, crate roulette, and auto-built journeys for home sessions.
              </p>
            </header>
            <PlayfulTools
              onRoulette={handleRoulette}
              onBuildJourney={handleBuildJourney}
              canBuildJourney={canBuildJourney}
              spinning={rouletteSpinning}
            />
            <div className="insights-v2-grid insights-v2-grid--dj">
              <div className="insights-v2-grid__cell insights-v2-grid__cell--7">
                <CamelotWheel
                  wheel={insights.camelotWheel}
                  selectedCode={selectedCamelot}
                  onKeySelect={(code) => setLensFromInsight({ kind: 'camelot', code })}
                />
              </div>
              <div className="insights-v2-grid__cell insights-v2-grid__cell--5">
                {insights.keyCounts.length > 0 ? (
                  <div className="insights-card">
                    <header className="insights-card__head">
                      <h3 className="insights-card__title">Top keys</h3>
                      <p className="insights-card__subtitle">Jump to a Camelot code</p>
                    </header>
                    <div className="insights-card__body">
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
                    </div>
                  </div>
                ) : (
                  <div className="insights-card">
                    <header className="insights-card__head">
                      <h3 className="insights-card__title">Top keys</h3>
                      <p className="insights-card__subtitle">Run metadata enrichment to populate keys</p>
                    </header>
                    <div className="insights-card__body">
                      <p className="insights-card__empty">
                        No key data yet.
                        {onEnrichMetadata ? (
                          <>
                            {' '}
                            <button
                              type="button"
                              className="insights-inline-link"
                              onClick={() => {
                                scrollToSection('health');
                                onEnrichMetadata();
                              }}
                            >
                              Enrich metadata
                            </button>
                          </>
                        ) : null}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section
            id="insights-health"
            ref={(el) => {
              sectionRefs.current.health = el;
            }}
            className="insights-v2-section insights-v2-section--last"
          >
            <header className="insights-v2-section__head">
              <h2 className="insights-v2-section__title">Crate health</h2>
              <p className="insights-v2-section__lead">
                Completion rates and enrichment depth — what to improve next.
              </p>
              <SectionProse text={insights.sectionInsights.health} />
            </header>
            <div className="insights-v2-grid">
              <div className="insights-v2-grid__cell insights-v2-grid__cell--5">
                <ChartCompletionRing
                  title="Completion snapshot"
                  subtitle="Mix-ready · tracklists · played · Discogs"
                  segments={completionSegments}
                />
              </div>
              <div className="insights-v2-grid__cell insights-v2-grid__cell--7">
                <div className="insights-card">
                  <header className="insights-card__head">
                    <h3 className="insights-card__title">Enrichment depth</h3>
                    <p className="insights-card__subtitle">Percentage of your library that is DJ-ready</p>
                  </header>
                  <div className="insights-card__body">
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
                        label="Mint / NM"
                        value={insights.mintPct}
                        detail={`${insights.mintCount} copies in top condition`}
                      />
                      <HealthMeter
                        label="Unplayed backlog"
                        value={pct(insights.unplayedCount, insights.releaseCount)}
                        detail={`${insights.unplayedCount} releases without a recent spin`}
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
                  </div>
                </div>
                <NotableList
                  insights={insights}
                  onSelectRelease={(id, label) =>
                    setLensFromInsight({ kind: 'release', recordId: id, label })
                  }
                />
              </div>
            </div>
          </section>
        </main>
      </div>

      {lens ? (
        <div className="insights-v2-modal" role="dialog" aria-modal="true" aria-label="Explore selection">
          <button
            type="button"
            className="insights-v2-modal__backdrop"
            aria-label="Close"
            onClick={() => setLensFromInsight(null)}
          />
          <div className="insights-v2-modal__panel">
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
              onQueueJourney={handleQueueJourney}
              onSelectCamelot={(code) => setLensFromInsight({ kind: 'camelot', code })}
              onSpinAgain={lens.kind === 'roulette' ? () => handleRoulette('any') : undefined}
            />
          </div>
        </div>
      ) : null}

      {rouletteSpinning ? (
        <div className="insights-roulette-overlay" aria-hidden>
          <div className="insights-roulette-overlay__spinner" />
          <p>Shuffling the crate…</p>
        </div>
      ) : null}
    </section>
  );
}