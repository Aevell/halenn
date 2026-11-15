-- Optional Google-provided embed URL; existing rows and policies are preserved.
alter table public.halenn_leads add column if not exists maps_embed text not null default '';
alter table public.halenn_leads add constraint halenn_leads_maps_embed_check
  check (maps_embed = '' or (
    length(maps_embed) <= 12000 and
    maps_embed ~ '^https://www[.]google[.]com/maps/embed[?]pb=[^&#]+$'
  ));
grant insert(maps_embed), update(maps_embed) on public.halenn_leads to authenticated;
