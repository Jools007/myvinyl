import { Check, ChevronDown } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import {
  CUT_RATING_LABELS,
  TRACK_RATING_OPTIONS,
  ratingTierClass,
} from '../../lib/cutRating';
import type { CutRating } from '../../lib/types';

/** Above release-picker portal (230) and other modals */
const RATING_MENU_Z_INDEX = 260;

type TrackRatingSelectProps = {
  rating?: CutRating;
  size?: 'xs' | 'sm';
  onChange?: (next: CutRating | undefined) => void;
  readonly?: boolean;
  className?: string;
};

function RatingTierMark({ rating }: { rating?: CutRating }) {
  return (
    <span className={`track-rating__mark ${ratingTierClass(rating)}`} aria-hidden>
      <span className="track-rating__mark-bar" />
      <span className="track-rating__mark-bar" />
      <span className="track-rating__mark-bar" />
    </span>
  );
}

export function CutRatingControl({
  rating,
  size = 'sm',
  onChange,
  readonly = false,
  className = '',
}: TrackRatingSelectProps) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 0 });

  const interactive = Boolean(onChange) && !readonly;

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setMenuPos({
      top: rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, size === 'xs' ? 148 : 164),
    });
  }, [size]);

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPosition();
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => updateMenuPosition();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const stopBubble = (event: MouseEvent) => {
    event.stopPropagation();
  };

  if (!interactive) {
    if (!rating) {
      return (
        <span
          className={`track-rating__empty${size === 'xs' ? ' track-rating__empty--xs' : ''} ${className}`.trim()}
        >
          —
        </span>
      );
    }
    if (size === 'xs') {
      return (
        <span
          className={`track-rating-pill ${ratingTierClass(rating)} ${className}`.trim()}
          title={CUT_RATING_LABELS[rating]}
        >
          {rating}
        </span>
      );
    }
    return (
      <span
        className={`track-rating track-rating--readonly track-rating--${size} ${ratingTierClass(rating)} ${className}`.trim()}
        title={CUT_RATING_LABELS[rating]}
      >
        <RatingTierMark rating={rating} />
        <span className="track-rating__value">{rating}</span>
      </span>
    );
  }

  const selectedValue = rating ?? '';
  const selected = TRACK_RATING_OPTIONS.find((opt) => opt.value === selectedValue) ?? TRACK_RATING_OPTIONS[0];

  const menu = open
    ? createPortal(
        <ul
          ref={menuRef}
          id={menuId}
          role="listbox"
          aria-label="Track rating"
          style={{
            position: 'fixed',
            top: menuPos.top,
            left: menuPos.left,
            width: menuPos.width,
            zIndex: RATING_MENU_Z_INDEX,
          }}
          className="track-rating-menu"
          onClick={stopBubble}
          onPointerDown={stopBubble}
        >
          {TRACK_RATING_OPTIONS.map((opt) => {
            const isSelected = opt.value === selectedValue;
            const tier = opt.value === '' ? undefined : opt.value;
            return (
              <li key={opt.value || '__blank'} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`track-rating-menu__option ${ratingTierClass(tier)}${
                    isSelected ? ' track-rating-menu__option--selected' : ''
                  }`}
                  onClick={() => {
                    onChange?.(tier);
                    setOpen(false);
                  }}
                >
                  <span className="track-rating-menu__option-main">
                    <RatingTierMark rating={tier} />
                    <span className="track-rating-menu__option-label">{opt.label}</span>
                  </span>
                  {opt.hint ? (
                    <span className="track-rating-menu__option-hint">{opt.hint}</span>
                  ) : null}
                  {isSelected ? (
                    <Check className="track-rating-menu__check" strokeWidth={2.25} aria-hidden />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>,
        document.body
      )
    : null;

  if (size === 'xs') {
    return (
      <div
        ref={rootRef}
        className={`track-rating-field track-rating-field--xs${className ? ` ${className}` : ''}`}
        onClick={stopBubble}
        onPointerDown={stopBubble}
      >
        <button
          ref={triggerRef}
          type="button"
          className={`track-rating-pill track-rating-pill--interactive ${ratingTierClass(rating)}${
            open ? ' track-rating-pill--open' : ''
          }${!rating ? ' track-rating-pill--none' : ''}`}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={menuId}
          aria-label={
            rating
              ? `Rating ${rating}, ${CUT_RATING_LABELS[rating]}`
              : 'Rating not set'
          }
          onClick={() => setOpen((prev) => !prev)}
        >
          <span className="track-rating-pill__value">{selected.label}</span>
          <ChevronDown
            className={`track-rating-pill__chevron${open ? ' track-rating-pill__chevron--open' : ''}`}
            strokeWidth={2.25}
            aria-hidden
          />
        </button>
        {menu}
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={`track-rating-field track-rating-field--${size}${className ? ` ${className}` : ''}`}
      onClick={stopBubble}
      onPointerDown={stopBubble}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`track-rating track-rating--${size} ${ratingTierClass(rating)}${
          open ? ' track-rating--open' : ''
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={
          rating
            ? `Rating ${rating}, ${CUT_RATING_LABELS[rating]}`
            : 'Rating not set'
        }
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="track-rating__value">{selected.label}</span>
        <ChevronDown
          className={`track-rating__chevron${open ? ' track-rating__chevron--open' : ''}`}
          strokeWidth={2}
          aria-hidden
        />
      </button>
      {menu}
    </div>
  );
}

/** @deprecated Use CutRatingControl */
export function CutRatingChip({
  rating,
  className = '',
}: {
  rating?: CutRating;
  className?: string;
}) {
  return <CutRatingControl rating={rating} size="xs" readonly className={className} />;
}