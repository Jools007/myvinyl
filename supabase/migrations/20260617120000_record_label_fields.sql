-- Sticker copy + layout prefs (separate from personal notes on records.notes)
alter table public.records
  add column if not exists notes text,
  add column if not exists label_description text,
  add column if not exists label_display jsonb;

comment on column public.records.notes is 'Personal crate / pressing notes (not printed on thermal labels by default).';
comment on column public.records.label_description is 'User-written sticker description (max ~220 chars in app).';
comment on column public.records.label_display is 'Per-record label layout: title order, BPM/key/vibes visibility.';