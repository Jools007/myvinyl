import { ChevronDown, Disc3, Users } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import {
  isGuestCrate,
  isPersonalCrate,
  type CollectionCrate,
} from '../../lib/collectionContext';

interface CrateSwitcherProps {
  crates: CollectionCrate[];
  activeCrate: CollectionCrate | null;
  onSelect: (crate: CollectionCrate) => void;
  onImportGuest?: () => void;
}

export function CrateSwitcher({
  crates,
  activeCrate,
  onSelect,
  onImportGuest,
}: CrateSwitcherProps) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const sorted = [...crates].sort((a, b) => {
    if (isPersonalCrate(a)) return -1;
    if (isPersonalCrate(b)) return 1;
    return a.name.localeCompare(b.name);
  });

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
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

  if (sorted.length <= 1 && !onImportGuest) return null;

  const label = activeCrate?.name ?? 'My Crate';
  const count = activeCrate?.recordCount ?? 0;

  return (
    <div ref={rootRef} className="crate-switcher">
      <button
        type="button"
        className="crate-switcher__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="crate-switcher__icon" aria-hidden>
          {activeCrate && isGuestCrate(activeCrate) ? (
            <Users className="h-3 w-3" strokeWidth={2} />
          ) : (
            <Disc3 className="h-3 w-3" strokeWidth={2} />
          )}
        </span>
        <span className="crate-switcher__label">{label}</span>
        <span className="crate-switcher__count tabular-nums">{count}</span>
        <ChevronDown
          className={`crate-switcher__chevron${open ? ' crate-switcher__chevron--open' : ''}`}
          strokeWidth={2.25}
          aria-hidden
        />
      </button>

      {open ? (
        <ul id={menuId} role="listbox" className="crate-switcher__menu">
          {sorted.map((crate) => {
            const selected = crate.id === activeCrate?.id;
            return (
              <li key={crate.id} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`crate-switcher__option${selected ? ' crate-switcher__option--selected' : ''}`}
                  onClick={() => {
                    onSelect(crate);
                    setOpen(false);
                  }}
                >
                  <span className="crate-switcher__option-name">{crate.name}</span>
                  <span className="crate-switcher__option-count tabular-nums">
                    {crate.recordCount}
                  </span>
                </button>
              </li>
            );
          })}
          {onImportGuest ? (
            <li role="none" className="crate-switcher__menu-footer">
              <button type="button" className="crate-switcher__import" onClick={() => {
                setOpen(false);
                onImportGuest();
              }}>
                Import friend&apos;s Discogs
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}