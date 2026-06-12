# MyVinyl — Mobile Fixes Plan

> **Priority:** Make the current Vite + React app look great and work well on phones.  
> **Out of scope for now:** Serverless API routes, backend enrichment, Next.js migration.  
> **Design north star:** Warm, moody, premium dark aesthetic — DM Sans + Inter, Framer Motion, glass panels, teal accent, vinyl-first craft.

---

## Current state (from code review)

The app already has partial mobile support:

| Area | What exists | What’s still rough |
|------|-------------|-------------------|
| **Navigation** | Bottom tab bar (`sm:hidden`) + compact header | Header crowded; Add button tiny (`h-5`, `text-[9px]`); desktop nav hidden on phone |
| **Collection hero** | Mobile-specific hero CSS; search full-width | Hero copy/photography hidden on mobile; sticky search uses hardcoded `bg-[#111]` |
| **Filters** | Wrapped filter row; mobile result count footer | Five dropdowns + view toggle overflow; dropdown menus portal-positioned but cramped |
| **List view** | Dual layout: card rows (`sm:hidden`) + grid (`sm:grid`) | Track rows dense; enrich/play buttons small; estimated badges tiny |
| **Shelf view** | Horizontal scroll + drag; snap scrolling | Scroll arrows hover-only; hint says “hover for arrows”; spine cards may be too narrow |
| **Grid view** | `collection-grid` 3→7 columns | **Not wired in App** — `viewMode: 'grid'` renders `CollectionListView`, not `GridView` |
| **Modals** | Record detail = bottom sheet on mobile; add flows have `@media` rules | Discover add panel heavy; barcode scanner full-screen; safe-area not consistently applied |
| **Play page** | `play-dj` sticky now-playing; smaller cover on mobile | Sticky offset tied to `7.25rem` nav height; recommendation list may feel cramped |
| **Labels** | Print layout exists | Label picker/modal not audited for thumb reach |
| **Theme** | Light/dark/system tokens in `index.css` | Mobile toolbar/search scrim uses `#111` regardless of theme |

**Target devices:** iPhone SE (375px) through iPhone Pro Max / Android (~430px), plus small tablets (768px).

**Touch target minimum:** 44×44px (Apple HIG) for all primary actions.

---

## Design principles (do not break)

1. **Warm premium dark** — keep `--bg`, `--bg-elevated`, teal `--accent`, soft borders, glass `app-nav`.
2. **Typography** — DM Sans for display/wordmark; Inter for UI; no shrinking below readable sizes on mobile.
3. **Motion** — keep Framer Motion; respect `prefers-reduced-motion` (already in `index.css`).
4. **Vinyl metaphor** — shelf spines, crate aesthetic, artwork-forward — but legible on small screens.
5. **Progressive disclosure** — filters and secondary actions collapse on mobile; primary paths (browse → detail → play) stay one thumb away.

---

## Phase 1 — Foundation & layout shell (1–2 days)

Fix global layout issues that affect every page.

### 1.1 App shell (`App.tsx`, `index.css`)

- [ ] Audit `min-h-dvh`, `pb-20` bottom padding vs bottom nav height — use CSS variable `--mobile-nav-height`.
- [ ] Replace hardcoded `bg-[#111]` in `CollectionFilters` and hero sticky layers with `var(--bg)` / `var(--bg-elevated)` so **light theme works on mobile**.
- [ ] Add `env(safe-area-inset-*)` padding on header, bottom nav, and full-screen modals (notch / home indicator).
- [ ] Ensure `100dvh` is used consistently (address iOS Safari address bar jump).

### 1.2 Navigation (`Navigation.tsx`, `index.css`)

- [ ] Increase mobile header touch targets: scan button, theme toggle, user menu ≥ 44px.
- [ ] Resize **Add vinyl** CTA on mobile — currently `h-5 text-[9px]` is too small; use icon-only or compact pill with readable label.
- [ ] Bottom tab bar: increase `py-2.5` → min 48px row height; add active indicator (subtle pill or underline).
- [ ] Consider moving **Scan** to bottom nav or FAB on collection page (reduces header clutter).
- [ ] Verify `layoutId="nav-pill"` doesn’t jank on mobile tab switches (disable or simplify on `sm:hidden` bar).

### 1.3 Spacing tokens (`index.css`)

- [ ] Unify mobile spacing variables under `.collection-page`:
  - `--nav-height: 7.25rem` (header + bottom tabs) — document and use everywhere sticky offsets reference it.
- [ ] Reduce negative margins (`-mt-6`, `-mt-4`) on collection page that cause overlap/bleed on small screens.

**Exit criteria:** Login → Collection → Play → Labels navigable one-handed; no theme-breaking black bars; no content hidden under nav.

---

## Phase 2 — Collection page: hero, filters, views (2–3 days)

Highest-traffic screen; most reported mobile pain likely lives here.

### 2.1 Collection hero (`CollectionHero.tsx`, `DiscogsSearchBar.tsx`)

- [ ] Show a **compact mobile hero** — one line title + record count OR small backdrop strip; avoid empty gap where desktop copy was removed.
- [ ] Sticky Discogs search: fix z-index stacking with toolbar (`z-50` / `z-60` conflicts).
- [ ] Search input: min height 44px; clear button 44px tap area.
- [ ] Import / floating Discogs actions (`CollectionDiscogsFloating.tsx`) — ensure FAB doesn’t cover filter row or bottom nav.

### 2.2 Filters toolbar (`CollectionFilters.tsx`)

- [ ] **Mobile filter pattern:** replace five inline dropdowns with:
  - **Option A:** horizontal scroll chip row (Format, Genre, …)  
  - **Option B:** single “Filters” button → bottom sheet with all filters  
  - Recommend **Option B** for collections with many genres.
- [ ] Fix filter dropdown menus on mobile: full-width sheet or `min-width: max(trigger, 12rem)` + `max-height: 50dvh` scroll.
- [ ] View mode toggle: clarify labels — today `grid` mode shows **list** (`CollectionListView`) but button says “List” with grid icon. Rename to **List / Shelf** or wire actual `GridView` as a third mode.
- [ ] Show active filter count badge on mobile (“3 filters”).
- [ ] Sticky toolbar: on mobile, consider single sticky block (search + filter button) instead of nested sticky (`top-[6.25rem]` inside static parent).

### 2.3 List view (`CollectionListView.tsx`) — default “grid” mode

- [ ] Mobile card rows: increase row padding; BPM/key/enrich actions ≥ 44px.
- [ ] Truncate artist/title with accessible `title` tooltips; avoid 9px badge text — bump to 11px minimum.
- [ ] Expand/collapse tracklist: larger chevron hit area; animate height with reduced-motion fallback.
- [ ] Swipe actions (optional): swipe row for Play / Enrich — only if time permits.
- [ ] Long-press vs tap: ensure `onSelect` (detail) doesn’t conflict with scroll.

### 2.4 Shelf view (`ShelfView.tsx`, shelf CSS)

- [ ] Widen minimum spine card width on `< 480px` for readable artist/title.
- [ ] Replace “hover for arrows” copy with **always-visible** subtle scroll affordance on touch devices (`@media (hover: none)`).
- [ ] Show scroll arrows on touch tap-hold or fade in at scroll edges.
- [ ] Improve drag-scroll vs vertical page scroll — `touch-action: pan-x` on `.shelf-scroller`.
- [ ] Genre shelf headers: sticky within horizontal scroll optional.

### 2.5 Grid view (`GridView.tsx`, `RecordCard.tsx`) — optional reintroduction

- [ ] Decide product intent: cover-forward **grid** vs track-level **list**.
- [ ] If grid desired: add third `ViewMode` or swap list for grid on mobile only.
- [ ] `collection-grid` on 375px: 2 columns may feel better than 3 for artwork legibility — test `repeat(2, 1fr)` below 480px.

**Exit criteria:** Search, filter, switch views, open record detail — all usable on 375px width without horizontal page scroll.

---

## Phase 3 — Modals & overlays (1–2 days)

### 3.1 Record detail (`RecordDetailModal.tsx`)

- [ ] Bottom sheet: add drag handle bar at top; `max-h-[92dvh]` with safe-area bottom padding.
- [ ] Primary actions (Play, Edit, Delete) — full-width stacked buttons on mobile.
- [ ] Artwork + title block: stack vertically on narrow screens if side-by-side feels cramped.
- [ ] Vibe tag chips: wrap with adequate gap; min chip height 36px.
- [ ] Focus trap + scroll lock; ESC/back gesture closes.

### 3.2 Add / discover flows (`DiscoverAddPanel.tsx`, `AddRecordModal.tsx`)

- [ ] `DiscoverAddPanel`: full-screen on mobile is OK — ensure form fields single column, sticky Save/Add CTA at bottom.
- [ ] Reduce simultaneous panels (cover + story + form) — accordion sections on mobile.
- [ ] Genre/BPM/Camelot pickers: native-feeling bottom sheets instead of tiny dropdowns.
- [ ] Loading states visible above keyboard when input focused.

### 3.3 Discogs import & barcode (`DiscogsImportModal.tsx`, `BarcodeScannerModal.tsx`)

- [ ] Import modal: progress bar + cancel always visible; no overflow on progress text.
- [ ] Barcode scanner: camera viewport `aspect-ratio` fix on iOS; permission error state readable.
- [ ] Result actions: full-width “Add to collection” button.

### 3.4 Utility modals (`ClearCollectionModal.tsx`, `Onboarding.tsx`, `LabelInspectModal.tsx`)

- [ ] Max width `calc(100vw - 2rem)`; padding respects safe areas.
- [ ] Destructive actions require two-step or clear red styling with large tap target.

**Exit criteria:** Every modal usable without zoom; primary CTA visible without scrolling past keyboard.

---

## Phase 4 — Play & Labels pages (1 day)

### 4.1 Play mode (`PlayNextPanel.tsx`, `play-dj` CSS)

- [ ] Now playing card: single column below 480px (artwork above metadata) — partially done; verify queue list spacing.
- [ ] Preview controls: play/pause ≥ 44px; scrubber thumb enlarged for touch.
- [ ] Sticky now-playing: recompute `--play-sticky-top` to match unified `--mobile-nav-height`.
- [ ] Recommendation rows: show BPM/Camelot badge without truncating reasons.

### 4.2 Labels (`LabelPrint.tsx`, `CrateLabel.tsx`)

- [ ] Record picker: mobile list instead of wide table.
- [ ] Preview scale-to-fit on narrow screens.
- [ ] Print flow: hide nav (`no-print` already exists); confirm tap targets on record selection.

**Exit criteria:** Play flow completable on phone; label preview readable.

---

## Phase 5 — Polish, performance, QA (1 day)

### 5.1 Touch & accessibility

- [ ] Global audit: all `button`, `a`, icon-only controls ≥ 44px hit area (padding if visual size smaller).
- [ ] `focus-visible` rings on mobile keyboard navigation.
- [ ] `aria-label` on icon-only nav buttons (partially done).

### 5.2 Performance on large collections

- [ ] List view with 500+ records: consider virtualized list (`@tanstack/react-virtual`) — separate effort but mobile will feel it first.
- [ ] Shelf view: limit simultaneous `motion` animations on low-end devices.

### 5.3 Visual consistency

- [ ] Remove one-off hex colors (`#111`) — use design tokens.
- [ ] Confirm dark theme is default and looks intentional on OLED.
- [ ] Toast position (`bottom-center`) — offset above bottom nav (`bottom-24` on mobile).

### 5.4 Test matrix

| Device / viewport | Pages to smoke test |
|-------------------|---------------------|
| 375×667 (SE) | Collection filter, list expand, shelf scroll, add record, play |
| 390×844 (iPhone 14) | Modals, barcode, keyboard overlap |
| 430×932 (Pro Max) | Hero, grid columns |
| 768×1024 (iPad) | Should not regress desktop layout |

**Tools:** Chrome DevTools device mode, real iPhone Safari, `npm run dev` on LAN.

---

## Suggested implementation order

| Order | Component / area | Why first |
|-------|------------------|-----------|
| **1** | `Navigation.tsx` + app shell spacing | Affects every screen; quick wins on touch targets |
| **2** | `CollectionFilters.tsx` + toolbar CSS | Biggest functional pain on collection page |
| **3** | `CollectionListView.tsx` | Default view mode; dense mobile rows |
| **4** | `RecordDetailModal.tsx` | Core inspect/edit flow |
| **5** | `ShelfView.tsx` + shelf CSS | Secondary view; scroll UX |
| **6** | `DiscoverAddPanel.tsx` / add modals | Add flow completeness |
| **7** | `PlayNextPanel.tsx` | Play page polish |
| **8** | `CollectionHero.tsx` + theme fixes | Visual finish |

---

## Files reference

| File | Mobile role |
|------|-------------|
| `src/App.tsx` | Page routing, collection view switch, bottom padding |
| `src/index.css` | Design tokens, grid/list/shelf/play responsive CSS |
| `src/components/Navigation.tsx` | Header + bottom tabs |
| `src/components/CollectionHero.tsx` | Search hero |
| `src/components/CollectionFilters.tsx` | Search + filters + view toggle |
| `src/components/CollectionListView.tsx` | Default collection view (track list) |
| `src/components/ShelfView.tsx` | Horizontal crate view |
| `src/components/GridView.tsx` | Cover grid (currently unused in App) |
| `src/components/RecordDetailModal.tsx` | Record bottom sheet |
| `src/components/DiscoverAddPanel.tsx` | Primary add flow |
| `src/components/PlayNextPanel.tsx` | DJ play recommendations |
| `src/components/DiscogsSearchBar.tsx` | Typeahead search |

---

## Out of scope (documented, not blocking mobile)

- Serverless `/api/*` routes (abandoned for now)
- Full track enrichment on production (client estimates only)
- Collection pagination / virtualization (recommended later)
- PWA / offline install

---

*When a fix conflicts with desktop polish, prefer mobile-first layout below `640px` and preserve current `sm:` desktop experience.*