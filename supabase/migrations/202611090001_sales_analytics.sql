begin;

-- Additive upgrade. Existing records, founder policies and passwords are preserved.
alter table public.halenn_leads drop constraint halenn_leads_status_check;
alter table public.halenn_leads add constraint halenn_leads_status_check
  check (status in ('New','Contacted','Qualified','Meeting booked','Proposal','Won','Closed'));
alter table public.halenn_leads
  add column channel text not null default 'Not recorded' check (channel in ('Not recorded','Cold calling','Cold email','Instagram','Google','Referral','Website','Other')),
  add column service text not null default 'Not recorded' check (service in ('Not recorded','Website','Webshop','App','AI & automation','Multiple services')),
  add column owner text not null default '' check (length(owner) <= 120),
  add column industry text not null default '' check (length(industry) <= 120),
  add column offer text not null default '' check (length(offer) <= 120),
  add column lost_reason text not null default 'Not recorded' check (lost_reason in ('Not recorded','Price','Timing','No response','Competitor','Not a fit','No longer needed','Other'));
grant insert(channel,service,owner,industry,offer,lost_reason),
  update(channel,service,owner,industry,offer,lost_reason) on public.halenn_leads to authenticated;

create table public.halenn_activity (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.halenn_leads(id),
  kind text not null check (kind in ('baseline','stage','contact_attempt','conversation','meeting_booked','meeting_held','meeting_no_show','proposal_sent','payment','refund','acquisition_cost','delivery_cost','support_cost','commission','upsell','referral','subscription_started','subscription_changed','subscription_cancelled')),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  from_stage text,
  to_stage text,
  amount_cents bigint,
  currency text not null default 'EUR' check (currency in ('EUR','USD','GBP')),
  channel text not null default 'Not recorded' check (channel in ('Not recorded','Cold calling','Cold email','Instagram','Google','Referral','Website','Other')),
  owner text not null default '' check (length(owner) <= 120),
  note text not null default '' check (length(note) <= 2000),
  voided_at timestamptz,
  void_reason text not null default '' check (length(void_reason) <= 300),
  check (lead_id is not null or kind = 'acquisition_cost'),
  check (occurred_at <= created_at + interval '5 minutes'),
  check (amount_cents is null or amount_cents between 0 and 100000000000),
  check ((kind in ('payment','refund','acquisition_cost','delivery_cost','support_cost','commission','upsell','subscription_started','subscription_changed') and amount_cents is not null)
    or (kind not in ('payment','refund','acquisition_cost','delivery_cost','support_cost','commission','upsell','subscription_started','subscription_changed') and amount_cents is null)),
  check (kind not in ('payment','refund','acquisition_cost','delivery_cost','support_cost','commission','upsell','subscription_started') or amount_cents > 0),
  check (kind not in ('stage','baseline') or (lead_id is not null and to_stage in ('New','Contacted','Qualified','Meeting booked','Proposal','Won','Closed'))),
  check (kind in ('stage','baseline') or (from_stage is null and to_stage is null))
);
create index halenn_activity_timeline on public.halenn_activity (occurred_at, id);
create index halenn_activity_lead on public.halenn_activity (lead_id, occurred_at);
alter table public.halenn_activity enable row level security;
revoke all on public.halenn_activity from public, anon, authenticated;
grant select on public.halenn_activity to authenticated;
grant insert(id,lead_id,kind,occurred_at,amount_cents,currency,channel,owner,note) on public.halenn_activity to authenticated;
grant update(voided_at,void_reason) on public.halenn_activity to authenticated;
create policy founder_activity_read on public.halenn_activity for select to authenticated
  using ((select public.halenn_is_founder()) and not (select public.halenn_needs_password()));
create policy founder_activity_add on public.halenn_activity for insert to authenticated
  with check ((select public.halenn_is_founder()) and not (select public.halenn_needs_password()) and kind not in ('baseline','stage') and voided_at is null and created_by = (select auth.uid()));
create policy founder_activity_correct on public.halenn_activity for update to authenticated
  using ((select public.halenn_is_founder()) and not (select public.halenn_needs_password()) and kind not in ('baseline','stage') and voided_at is null)
  with check ((select public.halenn_is_founder()) and not (select public.halenn_needs_password()) and voided_at is not null and length(trim(void_reason)) > 0);

-- Capture actual future stage changes atomically with each lead write.
create function private.halenn_log_stage() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then
    insert into public.halenn_activity(lead_id,kind,to_stage,channel,owner)
      values(new.id,'stage',new.status,new.channel,new.owner);
  elsif new.status is distinct from old.status then
    insert into public.halenn_activity(lead_id,kind,from_stage,to_stage,channel,owner)
      values(new.id,'stage',old.status,new.status,new.channel,new.owner);
  end if;
  return new;
end;
$$;
revoke all on function private.halenn_log_stage() from public, anon, authenticated;
create trigger halenn_lead_stage after insert or update on public.halenn_leads
  for each row execute function private.halenn_log_stage();

-- A baseline is an observation, not an invented historical conversion date.
insert into public.halenn_activity(lead_id,kind,to_stage,channel,owner,note)
  select id,'baseline',status,channel,owner,'Stage at the start of analytics tracking. Earlier transition dates are unknown.'
  from public.halenn_leads;

notify pgrst, 'reload schema';
commit;
