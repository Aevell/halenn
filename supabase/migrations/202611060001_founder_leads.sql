begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table private.halenn_founders (email text primary key);
alter table private.halenn_founders enable row level security;
-- Populate founder addresses privately in the project SQL editor.

create function public.halenn_is_founder() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth.users u join private.halenn_founders f
    on f.email = lower(u.email) where u.id = (select auth.uid()) and u.email_confirmed_at is not null);
$$;
revoke all on function public.halenn_is_founder() from public, anon;
grant execute on function public.halenn_is_founder() to authenticated;
create table public.halenn_leads (
  id uuid primary key default gen_random_uuid(),
  company text not null check (length(trim(company)) between 1 and 180),
  website text not null default '', opportunity text not null default '',
  contact text not null default '', source text not null default '', notes text not null default '',
  status text not null default 'New' check (status in ('New','Contacted','Won','Closed')),
  follow_up date, created_at timestamptz not null default now(), revision integer not null default 1
);
create unique index halenn_domain on public.halenn_leads
  ((lower(regexp_replace(split_part(split_part(website,'://',2),'/',1),'^www\.','','i')))) where website <> '';
create unique index halenn_company on public.halenn_leads ((lower(trim(company)))) where website = '';
alter table public.halenn_leads enable row level security;
revoke all on public.halenn_leads from public, anon, authenticated;
grant select on public.halenn_leads to authenticated;
grant insert(company,website,opportunity,contact,source,notes,status,follow_up) on public.halenn_leads to authenticated;
grant update(company,website,opportunity,contact,source,notes,status,follow_up,revision) on public.halenn_leads to authenticated;
create policy founder_read on public.halenn_leads for select to authenticated using ((select public.halenn_is_founder()));
create policy founder_add on public.halenn_leads for insert to authenticated with check ((select public.halenn_is_founder()));
create policy founder_edit on public.halenn_leads for update to authenticated using ((select public.halenn_is_founder())) with check ((select public.halenn_is_founder()));
commit;
