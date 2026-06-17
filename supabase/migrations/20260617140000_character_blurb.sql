-- Musical character copy (distinct from personal notes and label sticker text)
alter table public.records
  add column if not exists character_blurb text;

comment on column public.records.character_blurb is 'Musical vibe description — how the record sounds, not sleeve/pressing notes.';