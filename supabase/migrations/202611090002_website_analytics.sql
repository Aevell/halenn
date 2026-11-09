begin;
create table public.halenn_website_visits (
 id uuid primary key, visitor_id uuid not null, started_at timestamptz not null default now(), last_seen_at timestamptz not null default now(),
 source text not null check(length(source) between 1 and 64), medium text not null default '' check(length(medium)<=64), campaign text not null default '' check(length(campaign)<=64),
 referrer text not null default '' check(length(referrer)<=253), landing_path text not null check(landing_path in ('/','/pricing','/about','/privacy','/cookies','/terms','/business')),
 device text not null check(device in ('desktop','tablet','mobile')), consent_version integer not null default 3 check(consent_version=3)
);
create index halenn_visits_started on public.halenn_website_visits(started_at);
create table public.halenn_website_events (
 id uuid primary key, sequence_id bigint generated always as identity, session_id uuid not null references public.halenn_website_visits(id) on delete cascade, occurred_at timestamptz not null default clock_timestamp(),
 kind text not null check(kind in ('page_view','quiz_view','quiz_start','quiz_question','quiz_answer','quiz_complete','quiz_restart','quiz_pricing','enquiry_open','enquiry_start','enquiry_attempt','enquiry_error','enquiry_close','enquiry_received')),
 path text not null check(path in ('/','/pricing','/about','/privacy','/cookies','/terms','/business')), quiz_id uuid, form_id uuid,
 goal text check(goal in ('leads','sell','time','tool','unsure')), question text check(question in ('goal','presence','visitorAction','salesStage','sellType','task','behaviour','tools','channel','reminder','users','toolTask','platform','existing','priority','current')),
 step integer check(step between 1 and 5), origin text check(origin in ('homepage','quiz','pricing')), code text check(code in ('validation','network','server'))
);
create index halenn_web_events_session on public.halenn_website_events(session_id,occurred_at);
create index halenn_web_events_date on public.halenn_website_events(occurred_at);
create index halenn_web_events_quiz on public.halenn_website_events(quiz_id) where quiz_id is not null;
create table public.halenn_website_enquiries (
 id uuid primary key, lead_id uuid not null references public.halenn_leads(id), received_at timestamptz not null default now(),
 name text not null check(length(name) between 1 and 120), email text not null check(length(email) between 3 and 254), company text not null default '' check(length(company)<=180),
 message text not null check(length(message) between 1 and 20000), origin text not null check(origin in ('homepage','quiz','pricing')), form_id uuid not null
);
create index halenn_enquiries_date on public.halenn_website_enquiries(received_at);
create index halenn_enquiries_email on public.halenn_website_enquiries(email,received_at);
-- No public reads or direct writes. Narrow intake functions below are the only anonymous capability.
alter table public.halenn_website_visits enable row level security;
alter table public.halenn_website_events enable row level security;
alter table public.halenn_website_enquiries enable row level security;
revoke all on public.halenn_website_visits,public.halenn_website_events,public.halenn_website_enquiries from public,anon,authenticated;
revoke all on sequence public.halenn_website_events_sequence_id_seq from public,anon,authenticated;
grant select on public.halenn_website_visits,public.halenn_website_events,public.halenn_website_enquiries to authenticated;
create policy founder_visits_read on public.halenn_website_visits for select to authenticated using ((select public.halenn_is_founder()) and not (select public.halenn_needs_password()));
create policy founder_events_read on public.halenn_website_events for select to authenticated using ((select public.halenn_is_founder()) and not (select public.halenn_needs_password()));
create policy founder_enquiries_read on public.halenn_website_enquiries for select to authenticated using ((select public.halenn_is_founder()) and not (select public.halenn_needs_password()));
create function private.halenn_prune_website_analytics() returns void language sql security definer set search_path='' as $$
 delete from public.halenn_website_visits where started_at<now()-interval '90 days';
$$;
revoke all on function private.halenn_prune_website_analytics() from public,anon,authenticated;
create function public.halenn_record_website_events(payload jsonb) returns boolean language plpgsql security definer set search_path='' as $$
declare v jsonb:=payload->'visit'; e jsonb; sid uuid; vid uuid; k text; field text; new_events integer;
 uuid_pattern constant text:='^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
begin
 if jsonb_typeof(payload) is distinct from 'object' or pg_column_size(payload)>20000 or jsonb_typeof(v) is distinct from 'object' or jsonb_typeof(payload->'events') is distinct from 'array' then raise exception 'Invalid events'; end if;
 if jsonb_array_length(payload->'events') not between 1 and 20 then raise exception 'Invalid events';end if;
 foreach field in array array['session_id','visitor_id'] loop
  if jsonb_typeof(v->field) is distinct from 'string' or (v->>field)!~*uuid_pattern then raise exception 'Invalid visit identifier';end if;
 end loop;
 foreach field in array array['landing_path','device'] loop
  if jsonb_typeof(v->field) is distinct from 'string' then raise exception 'Invalid visit';end if;
 end loop;
 if jsonb_typeof(v->'source') is distinct from 'string' or (v->>'source')!~'^[a-zA-Z0-9 _.-]{1,64}$' or trim(v->>'source')='' then raise exception 'Invalid source';end if;
 foreach field in array array['medium','campaign','referrer'] loop
  if v ? field and jsonb_typeof(v->field) is distinct from 'string' then raise exception 'Invalid visit metadata';end if;
 end loop;
 if coalesce(v->>'medium','')!~'^[a-zA-Z0-9 _.-]{0,64}$' or coalesce(v->>'campaign','')!~'^[a-zA-Z0-9 _.-]{0,64}$'
  or coalesce(v->>'referrer','')!~'^(?:[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?)?$'
  or coalesce(v->>'referrer','')~'^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$' then raise exception 'Invalid visit metadata';end if;
 -- Validate the complete batch before applying caps or changing a visit.
 for e in select value from jsonb_array_elements(payload->'events') loop
  if jsonb_typeof(e) is distinct from 'object' then raise exception 'Invalid event';end if;
  if jsonb_typeof(e->'id') is distinct from 'string' or (e->>'id')!~*uuid_pattern then raise exception 'Invalid event identifier';end if;
  foreach field in array array['kind','path'] loop
   if jsonb_typeof(e->field) is distinct from 'string' then raise exception 'Invalid event';end if;
  end loop;
  foreach field in array array['goal','question','origin','code'] loop
   if e ? field and jsonb_typeof(e->field) is distinct from 'string' then raise exception 'Invalid event metadata';end if;
  end loop;
  if e ? 'step' and (jsonb_typeof(e->'step') is distinct from 'number' or (e->>'step')!~'^[1-5]$') then raise exception 'Invalid event step';end if;
  foreach field in array array['quiz_id','form_id'] loop
   if e ? field and (jsonb_typeof(e->field) is distinct from 'string' or (e->>field)!~*uuid_pattern) then raise exception 'Invalid event identifier';end if;
  end loop;
  k:=e->>'kind';
  if k is null or k not in ('page_view','quiz_view','quiz_start','quiz_question','quiz_answer','quiz_complete','quiz_restart','quiz_pricing','enquiry_open','enquiry_start','enquiry_attempt','enquiry_error','enquiry_close') then raise exception 'Invalid event kind';end if;
  if k in ('quiz_start','quiz_question','quiz_answer','quiz_complete','quiz_restart','quiz_pricing') and e->>'quiz_id' is null then raise exception 'Quiz attempt required';end if;
  if k in ('quiz_question','quiz_answer') and e->>'question' is null then raise exception 'Question required';end if;
  if k like 'enquiry_%' and e->>'form_id' is null then raise exception 'Form attempt required';end if;
 end loop;
 sid:=(v->>'session_id')::uuid;vid:=(v->>'visitor_id')::uuid;
 perform pg_advisory_xact_lock(73904101);
 perform private.halenn_prune_website_analytics();
 -- Explicit bounds keep this anonymous write-only endpoint from growing storage without limit.
 -- Existing IDs are retries, not additional writes, including at a limit.
 select count(distinct (item->>'id')::uuid) into new_events from jsonb_array_elements(payload->'events') item
  where not exists(select 1 from public.halenn_website_events existing where existing.id=(item->>'id')::uuid);
 if (select count(*) from public.halenn_website_events where occurred_at>=date_trunc('day',now()))+new_events>20000 then return false;end if;
 if (select count(*) from public.halenn_website_visits where started_at>=date_trunc('day',now()))>=2000 and not exists(select 1 from public.halenn_website_visits where id=sid) then return false;end if;
 if (select count(*) from public.halenn_website_events where session_id=sid)+new_events>200 then return false;end if;
 insert into public.halenn_website_visits(id,visitor_id,source,medium,campaign,referrer,landing_path,device)
 values(sid,vid,trim(v->>'source'),trim(coalesce(v->>'medium','')),trim(coalesce(v->>'campaign','')),coalesce(v->>'referrer',''),v->>'landing_path',v->>'device') on conflict(id) do nothing;
 if not exists(select 1 from public.halenn_website_visits where id=sid and visitor_id=vid and started_at>now()-interval '24 hours') then return false;end if;
 update public.halenn_website_visits set last_seen_at=now() where id=sid;
 for e in select value from jsonb_array_elements(payload->'events') loop
  k:=e->>'kind';
  insert into public.halenn_website_events(id,session_id,kind,path,quiz_id,form_id,goal,question,step,origin,code)
  values((e->>'id')::uuid,sid,k,e->>'path',(e->>'quiz_id')::uuid,(e->>'form_id')::uuid,e->>'goal',e->>'question',(e->>'step')::integer,e->>'origin',e->>'code') on conflict(id) do nothing;
 end loop;
 return true;
end;$$;
revoke all on function public.halenn_record_website_events(jsonb) from public;
grant execute on function public.halenn_record_website_events(jsonb) to anon,authenticated;
create function public.halenn_submit_website_enquiry(payload jsonb) returns text language plpgsql security definer set search_path='' as $$
declare eid uuid; fid uuid; previous public.halenn_website_enquiries; lid uuid; title text; t jsonb:=payload->'tracking'; sid uuid; vid uuid; field text; normalized_email text;
 uuid_pattern constant text:='^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
begin
 if jsonb_typeof(payload) is distinct from 'object' or pg_column_size(payload)>100000 then raise exception 'Invalid enquiry';end if;
 foreach field in array array['id','form_id'] loop
  if jsonb_typeof(payload->field) is distinct from 'string' or (payload->>field)!~*uuid_pattern then raise exception 'Invalid enquiry identifier';end if;
 end loop;
 foreach field in array array['name','email','message','origin'] loop
  if jsonb_typeof(payload->field) is distinct from 'string' then raise exception 'Invalid enquiry';end if;
 end loop;
 if payload ? 'company' and jsonb_typeof(payload->'company') is distinct from 'string' then raise exception 'Invalid company';end if;
 eid:=(payload->>'id')::uuid;fid:=(payload->>'form_id')::uuid;normalized_email:=lower(trim(payload->>'email'));
 if length(trim(payload->>'name')) not between 1 and 120 or length(payload->>'name')>120 or length(payload->>'email')>254 or length(normalized_email) not between 3 and 254 or normalized_email!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(coalesce(payload->>'company',''))>180 or length(trim(payload->>'message')) not between 1 and 20000 or length(payload->>'message')>20000 or (payload->>'origin') not in ('homepage','quiz','pricing') then raise exception 'Invalid enquiry';end if;
 if t is not null and t<>'null'::jsonb then
  if jsonb_typeof(t) is distinct from 'object' then raise exception 'Invalid enquiry tracking';end if;
  foreach field in array array['session_id','visitor_id'] loop
   if jsonb_typeof(t->field) is distinct from 'string' or (t->>field)!~*uuid_pattern then raise exception 'Invalid enquiry tracking';end if;
  end loop;
  if t ? 'quiz_id' and (jsonb_typeof(t->'quiz_id') is distinct from 'string' or (t->>'quiz_id')!~*uuid_pattern) then raise exception 'Invalid enquiry tracking';end if;
 end if;
 perform pg_advisory_xact_lock(73904102);
 select * into previous from public.halenn_website_enquiries where id=eid;
 if found then
  if previous.name=payload->>'name' and previous.email=normalized_email and previous.company=coalesce(payload->>'company','') and previous.message=payload->>'message' and previous.origin=payload->>'origin' and previous.form_id=fid then return 'received';else return 'conflict';end if;
 end if;
 if (select count(*) from public.halenn_website_enquiries where received_at>now()-interval '1 hour' and email=normalized_email)>=3 or (select count(*) from public.halenn_website_enquiries where received_at>=date_trunc('day',now()))>=300 then return 'limited';end if;
 title:=coalesce(nullif(trim(payload->>'company'),''),payload->>'name');
 if exists(select 1 from public.halenn_leads where website='' and lower(trim(company))=lower(trim(title))) then title:=left(title,140)||' · Enquiry '||left(eid::text,8);end if;
 insert into public.halenn_leads(company,contact,opportunity,notes,channel,status)
 values(title,(payload->>'name')||' · '||normalized_email,'Website enquiry: '||left(payload->>'message',220),payload->>'message','Website','New') returning id into lid;
 insert into public.halenn_website_enquiries(id,lead_id,name,email,company,message,origin,form_id)
 values(eid,lid,payload->>'name',normalized_email,coalesce(payload->>'company',''),payload->>'message',payload->>'origin',fid);
 -- A confirmed receipt exists only after the enquiry and its lead are durable in this transaction.
 if t is not null and t<>'null'::jsonb then
  sid:=(t->>'session_id')::uuid;vid:=(t->>'visitor_id')::uuid;
  if exists(select 1 from public.halenn_website_visits where id=sid and visitor_id=vid and last_seen_at>now()-interval '30 minutes') then
   insert into public.halenn_website_events(id,session_id,kind,path,quiz_id,form_id,origin)
   values(eid,sid,'enquiry_received',case when payload->>'origin'='pricing' then '/pricing' else '/' end,(t->>'quiz_id')::uuid,fid,payload->>'origin') on conflict(id) do nothing;
   update public.halenn_website_visits set last_seen_at=now() where id=sid;
  end if;
 end if;
 return 'received';
end;$$;
revoke all on function public.halenn_submit_website_enquiry(jsonb) from public;
grant execute on function public.halenn_submit_website_enquiry(jsonb) to anon,authenticated;
notify pgrst,'reload schema';
commit;
