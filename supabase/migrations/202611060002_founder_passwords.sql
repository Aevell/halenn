begin;
alter table private.halenn_founders add column needs_password boolean not null default true;
create function public.halenn_needs_password() returns boolean language sql stable
security definer set search_path = '' as $$
  select coalesce((select f.needs_password from auth.users u join private.halenn_founders f
    on lower(u.email)=f.email where u.id=(select auth.uid()) and u.email_confirmed_at is not null),true);
$$;
revoke all on function public.halenn_needs_password() from public,anon;
grant execute on function public.halenn_needs_password() to authenticated;
create function private.halenn_password_changed() returns trigger language plpgsql
security definer set search_path = '' as $$
begin
  update private.halenn_founders set needs_password=false where email=lower(new.email);
  return new;
end;
$$;
revoke all on function private.halenn_password_changed() from public,anon,authenticated;
create trigger halenn_password_changed after update of encrypted_password on auth.users
  for each row when (old.encrypted_password is distinct from new.encrypted_password)
  execute function private.halenn_password_changed();
create policy founder_ready on public.halenn_leads as restrictive for all to authenticated
  using (not (select public.halenn_needs_password())) with check (not (select public.halenn_needs_password()));
alter table public.halenn_leads add constraint website_http check(website='' or website ~* '^https?://[^[:space:]/]+'),
  add constraint source_http check(source='' or source ~* '^https?://[^[:space:]/]+');
commit;
