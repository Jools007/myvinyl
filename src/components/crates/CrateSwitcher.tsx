import { ChevronDown, Disc3, Users } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  const menuRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number; minWidth: number } | null>(
    null
  );

  const sorted = [...crates].sort((a, b) => {
    if (isPersonalCrate(a)) return -1;
    if (isPersonalCrate(b)) return 1;
    return a.name.localeCompare(b.name);
  });

  const updateMenuPosition = () => {
    const root = rootRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    setMenuStyle({
      top: rect.bottom + 6,
      left: rect.right,
      minWidth: Math.max(rect.width, 184),
    });
  };

  useLayoutEffect(() => {
    if (!open) {
      setMenuStyle(null);
      return;
    }
    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [open]);

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

      {open && menuStyle
        ? createPortal(
            <ul
              ref={menuRef}
              id={menuId}
              role="listbox"
              className="crate-switcher__menu crate-switcher__menu--portal"
              style={{
                top: menuStyle.top,
                left: menuStyle.left,
                minWidth: menuStyle.minWidth,
              }}
            >
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
                  <button
                    type="button"
                    className="crate-switcher__import"
                    onClick={() => {
                      setOpen(false);
                      onImportGuest();
                    }}
                  >
                    Import friend&apos;s Discogs
                  </button>
                </li>
              ) : null}
            </ul>,
            document.body
          )
        : null}
    </div>
  );
}