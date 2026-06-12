import { ChevronDown, ChevronUp, ListMusic, Trash2, X } from 'lucide-react';
import { openRecordDetail } from '../../lib/recordDetail';
import { playSelectionKey, trackPositionLabel, type ResolvedPlaySelection } from '../../lib/playSession';
import { SESSION_CRATE_MAX, type KeyPathStep } from '../../lib/sessionCrate';
import { KeyPathStrip } from './KeyPathStrip';
import { MixStrip } from './MixStrip';
import { RecordArtwork } from '../RecordArtwork';

type SessionCratePanelProps = {
  items: ResolvedPlaySelection[];
  keyPath: KeyPathStep[];
  onRemove: (index: number) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onClear: () => void;
  onLoadQueue: () => void;
  onPlayNow: (index: number) => void;
};

export function SessionCratePanel({
  items,
  keyPath,
  onRemove,
  onMoveUp,
  onMoveDown,
  onClear,
  onLoadQueue,
  onPlayNow,
}: SessionCratePanelProps) {
  return (
    <aside className="play-crate" aria-labelledby="play-crate-heading">
      <div className="play-crate__head">
        <div>
          <h2 id="play-crate-heading" className="play-crate__title">
            Tonight&apos;s crate
          </h2>
          <p className="play-crate__sub">
            Pull these records before you spin
            <span className="play-crate__limit tabular-nums">
              {' '}
              · {items.length}/{SESSION_CRATE_MAX}
            </span>
          </p>
        </div>
        {items.length > 0 ? (
          <button
            type="button"
            className="play-crate__clear"
            onClick={onClear}
            aria-label="Clear crate"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      <KeyPathStrip steps={keyPath} />

      {items.length === 0 ? (
        <div className="play-crate__empty">
          <p className="text-sm text-[var(--text-secondary)]">
            Add compatible picks from the list, or build a set in Insights.
          </p>
        </div>
      ) : (
        <>
          <ol className="play-crate__list" role="list">
            {items.map((item, index) => {
              const trackIndex = Math.max(
                0,
                item.record.tracks.findIndex((t) => t.id === item.track.id)
              );
              return (
                <li
                  key={playSelectionKey({
                    recordId: item.record.id,
                    trackId: item.track.id,
                  })}
                  className="play-crate__item"
                >
                  <span className="play-crate__order tabular-nums">{index + 1}</span>
                  <button
                    type="button"
                    className="play-crate__item-main"
                    onClick={() => openRecordDetail(item.record)}
                  >
                    <RecordArtwork
                      src={item.record.coverUrl}
                      title={item.record.title}
                      size="queue"
                      className="play-dj__cover play-dj__cover--queue shrink-0"
                    />
                    <div className="play-crate__item-copy">
                      <p className="play-crate__item-title">{item.track.title}</p>
                      <p className="play-crate__item-artist">
                        {item.record.artist}
                        <span className="text-[var(--text-muted)]">
                          {' '}
                          · {trackPositionLabel(item.track, trackIndex)}
                        </span>
                      </p>
                      <MixStrip track={item.track} variant="queue" />
                    </div>
                  </button>
                  <div className="play-crate__item-actions">
                    <button
                      type="button"
                      className="play-crate__reorder"
                      onClick={() => onMoveUp(index)}
                      disabled={index === 0}
                      aria-label="Move up"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="play-crate__reorder"
                      onClick={() => onMoveDown(index)}
                      disabled={index === items.length - 1}
                      aria-label="Move down"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="play-crate__remove"
                      onClick={() => onRemove(index)}
                      aria-label="Remove from crate"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="play-crate__footer">
            <button
              type="button"
              className="play-crate__load btn-primary"
              onClick={onLoadQueue}
            >
              <ListMusic className="h-4 w-4" aria-hidden />
              Load queue &amp; play
            </button>
            <button
              type="button"
              className="play-crate__play-first btn-ghost"
              onClick={() => onPlayNow(0)}
            >
              Play opener
            </button>
          </div>
        </>
      )}
    </aside>
  );
}