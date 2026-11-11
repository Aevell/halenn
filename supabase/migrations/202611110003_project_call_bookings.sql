begin;

-- Optional project calls. No historical enquiries or email outboxes are changed.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table private.halenn_project_call_config (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  booking_url text check (booking_url is null or booking_url ~ '^https://(calendar\.google\.com/calendar/appointments/schedules/[A-Za-z0-9_-]+|calendar\.app\.google/[A-Za-z0-9_-]+)(\?gv=true)?$'),
  calendar_id text not null default 'aevellgroup@gmail.com' check (calendar_id = 'aevellgroup@gmail.com'),
  secret_name text not null default 'halenn_google_booking_secret' check (secret_name = 'halenn_google_booking_secret'),
  last_sync_at timestamptz
);
insert into private.halenn_project_call_config default values;

create table private.halenn_project_call_invitations (
  enquiry_id uuid primary key references public.halenn_website_enquiries(id),
  token uuid not null unique default gen_random_uuid(),
  lead_id uuid not null references public.halenn_leads(id),
  created_at timestamptz not null default now()
);

create table private.halenn_project_call_bookings (
  id uuid primary key default gen_random_uuid(),
  calendar_id text not null check (calendar_id = 'aevellgroup@gmail.com'),
  event_id text not null check (length(event_id) between 1 and 1024 and event_id ~ '^[A-Za-z0-9_-]+$'),
  status text not null check (status in ('confirmed','cancelled')),
  provider_updated timestamptz,
  observed_at timestamptz not null,
  version_at timestamptz not null,
  booked_at timestamptz not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at = starts_at + interval '30 minutes'),
  attendee_email text check (attendee_email is null or length(attendee_email) between 3 and 254),
  attendee_name text check (attendee_name is null or length(attendee_name) <= 180),
  preferred_language text check (preferred_language is null or preferred_language in ('nl','en')),
  enquiry_id uuid references public.halenn_website_enquiries(id),
  lead_id uuid references public.halenn_leads(id),
  unique(calendar_id,event_id)
);
create index halenn_project_calls_unmatched on private.halenn_project_call_bookings(booked_at desc) where lead_id is null;
create index halenn_project_calls_lead on private.halenn_project_call_bookings(lead_id,starts_at);

-- One first-call milestone per lead, including provider reschedules with new IDs.
create table private.halenn_project_call_conversions (
  lead_id uuid primary key references public.halenn_leads(id),
  booking_id uuid not null references private.halenn_project_call_bookings(id),
  activity_id uuid not null unique references public.halenn_activity(id)
);

alter table private.halenn_project_call_config enable row level security;
alter table private.halenn_project_call_invitations enable row level security;
alter table private.halenn_project_call_bookings enable row level security;
alter table private.halenn_project_call_conversions enable row level security;
revoke all on private.halenn_project_call_config,private.halenn_project_call_invitations,
  private.halenn_project_call_bookings,private.halenn_project_call_conversions from public,anon,authenticated;

create function private.halenn_project_call_configured() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select c.booking_url is not null and exists(
    select 1 from vault.decrypted_secrets v where v.name=c.secret_name and length(v.decrypted_secret) between 32 and 512
  ) from private.halenn_project_call_config c where c.singleton),false);
$$;

create function private.halenn_project_call_link(enquiry uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare invitation uuid;
begin
  if not coalesce((select enabled from private.halenn_project_call_config where singleton),false)
    or not private.halenn_project_call_configured() then return null; end if;
  insert into private.halenn_project_call_invitations(enquiry_id,lead_id)
    select id,lead_id from public.halenn_website_enquiries where id=enquiry
    on conflict(enquiry_id) do nothing;
  select token into invitation from private.halenn_project_call_invitations where enquiry_id=enquiry;
  return case when invitation is null then null else 'https://halenn.com/project-call/' || invitation::text end;
exception when others then
  -- Optional scheduling cannot discard a saved enquiry or its confirmation.
  return null;
end;
$$;

create function public.halenn_submit_website_enquiry_with_booking(payload jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare outcome text; booking_link text;
begin
  outcome := public.halenn_submit_website_enquiry(payload);
  if outcome='received' then
    begin booking_link:=private.halenn_project_call_link((payload->>'id')::uuid);
    exception when others then booking_link:=null; end;
  end if;
  return jsonb_build_object('result',outcome,'bookingUrl',case when booking_link is null then null else substr(booking_link,length('https://halenn.com')+1) end);
end;
$$;

create function public.halenn_project_call_destination(token uuid) returns text
language sql stable security definer set search_path = '' as $$
  select c.booking_url from private.halenn_project_call_config c
  where c.singleton and c.enabled and private.halenn_project_call_configured()
    and exists(select 1 from private.halenn_project_call_invitations i where i.token=$1);
$$;

create function private.halenn_project_call_time(value text) returns timestamptz
language plpgsql immutable set search_path = '' as $$
begin
  if value is null or value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$' then
    raise exception 'Invalid project call timestamp' using errcode='22023';
  end if;
  return value::timestamptz;
exception when others then
  raise exception 'Invalid project call timestamp' using errcode='22023';
end;
$$;

create function private.halenn_log_project_call(booking uuid) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare b private.halenn_project_call_bookings; l public.halenn_leads; activity uuid; created boolean:=false;
begin
  select * into strict b from private.halenn_project_call_bookings where id=booking for update;
  if b.lead_id is null or b.status <> 'confirmed' then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(b.lead_id::text,73904115));
  if exists(select 1 from private.halenn_project_call_conversions where lead_id=b.lead_id) then return false; end if;
  select * into strict l from public.halenn_leads where id=b.lead_id;
  -- Do not duplicate a first-call milestone a founder already recorded manually.
  select id into activity from public.halenn_activity
    where lead_id=b.lead_id and kind='meeting_booked' and voided_at is null
    order by occurred_at,id limit 1;
  if activity is null then
    insert into public.halenn_activity(lead_id,kind,occurred_at,created_by,channel,owner,note)
      values(b.lead_id,'meeting_booked',least(b.booked_at,now()),null,l.channel,l.owner,
        '30-minute project introduction booked through Google Calendar. Attendance is recorded separately.')
      returning id into activity;
    created:=true;
  end if;
  insert into private.halenn_project_call_conversions(lead_id,booking_id,activity_id)
    values(b.lead_id,b.id,activity);
  return created;
end;
$$;

create function public.halenn_receive_project_call_events(raw_body text,signature text,sent_at text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  c private.halenn_project_call_config;
  secret text; crypto_schema text; expected bytea; supplied bytea; difference integer:=0; i integer;
  delivery_time timestamptz; body jsonb; item jsonb; field text;
  provider_event_id text; event_status text; event_updated timestamptz; event_version timestamptz;
  event_created timestamptz; event_start timestamptz; event_end timestamptz; guest_email text; guest_name text; event_language text;
  existing private.halenn_project_call_bookings; booking_id uuid; matched_enquiry uuid; matched_lead uuid; candidates integer;
  changed integer:=0; ignored integer:=0; activities integer:=0;
begin
  -- Authenticate the exact bounded bytes before parsing JSON or writing records.
  if raw_body is null or octet_length(raw_body)>100000 or signature is null or signature !~ '^[A-Fa-f0-9]{64}$'
    or sent_at is null or sent_at !~ '^[0-9]{10}$' then
    raise exception 'Invalid booking authentication' using errcode='28000';
  end if;
  delivery_time:=to_timestamp(sent_at::double precision);
  if abs(extract(epoch from clock_timestamp()-delivery_time))>300 then
    raise exception 'Invalid booking authentication' using errcode='28000';
  end if;
  select * into strict c from private.halenn_project_call_config where singleton;
  if not c.enabled or not private.halenn_project_call_configured() then
    raise exception 'Booking sync is unavailable' using errcode='55000';
  end if;
  select decrypted_secret into secret from vault.decrypted_secrets where name=c.secret_name;
  if secret is null or length(secret) not between 32 and 512 then raise exception 'Booking sync is unavailable' using errcode='55000'; end if;
  select n.nspname into crypto_schema from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto';
  execute format('select %I.hmac($1,$2,$3)',crypto_schema)
    into expected using convert_to(sent_at||'.'||raw_body,'UTF8'),convert_to(secret,'UTF8'),'sha256';
  secret:=null;
  if expected is null or octet_length(expected)<>32 then raise exception 'Booking sync is unavailable' using errcode='55000'; end if;
  supplied:=decode(signature,'hex');
  for i in 0..31 loop difference:=difference | (get_byte(expected,i) # get_byte(supplied,i)); end loop;
  if difference<>0 then raise exception 'Invalid booking authentication' using errcode='28000'; end if;

  begin
    body:=raw_body::jsonb;
    if jsonb_typeof(body) is distinct from 'object' or body->'version' is distinct from '1'::jsonb
      or jsonb_typeof(body->'calendarId') is distinct from 'string' or body->>'calendarId'<>c.calendar_id
      or jsonb_typeof(body->'events') is distinct from 'array' or jsonb_array_length(body->'events')>50
      or exists(select 1 from jsonb_object_keys(body) k where k not in ('version','calendarId','events')) then
      raise exception 'Invalid project call payload' using errcode='22023';
    end if;
    -- Serialize signed delivery and manual linking so competing batches cannot
    -- revive stale cancellations or duplicate first-call activity.
    perform pg_advisory_xact_lock(73904116);
    for item in select value from jsonb_array_elements(body->'events') loop
      if jsonb_typeof(item) is distinct from 'object'
        or jsonb_typeof(item->'id') is distinct from 'string' or length(item->>'id') not between 1 and 1024 or item->>'id' !~ '^[A-Za-z0-9_-]+$'
        or jsonb_typeof(item->'status') is distinct from 'string' or item->>'status' not in ('confirmed','cancelled')
        or exists(select 1 from jsonb_object_keys(item) k where k not in ('id','status','updated','created','start','end','attendeeEmail','attendeeName','preferredLanguage')) then
        raise exception 'Invalid project call event' using errcode='22023';
      end if;
      provider_event_id:=item->>'id'; event_status:=item->>'status'; event_updated:=null;
      if item ? 'updated' then
        if jsonb_typeof(item->'updated') is distinct from 'string' then raise exception 'Invalid project call event' using errcode='22023'; end if;
        event_updated:=private.halenn_project_call_time(item->>'updated');
        if event_updated< '2000-01-01'::timestamptz or event_updated>clock_timestamp()+interval '5 minutes' then raise exception 'Invalid project call event' using errcode='22023'; end if;
      end if;
      event_version:=coalesce(event_updated,delivery_time);
      select * into existing from private.halenn_project_call_bookings b where b.calendar_id=c.calendar_id and b.event_id=provider_event_id for update;
      if event_status='cancelled' then
        if existing.id is not null and (event_version<existing.version_at or (event_version=existing.version_at and existing.status='cancelled')) then ignored:=ignored+1; continue; end if;
        -- Google deletion tombstones may omit updated and all booking details.
        -- The signed observation time is distinct from an unknown provider time.
        if existing.id is null then ignored:=ignored+1; continue; end if;
        update private.halenn_project_call_bookings set status='cancelled',provider_updated=event_updated,
          observed_at=clock_timestamp(),version_at=event_version where id=existing.id;
        changed:=changed+1; continue;
      end if;
      foreach field in array array['updated','created','start','end'] loop
        if jsonb_typeof(item->field) is distinct from 'string' then raise exception 'Invalid project call event' using errcode='22023'; end if;
      end loop;
      event_created:=private.halenn_project_call_time(item->>'created');
      event_start:=private.halenn_project_call_time(item->>'start'); event_end:=private.halenn_project_call_time(item->>'end');
      if item ? 'attendeeEmail' and jsonb_typeof(item->'attendeeEmail') not in ('string','null') then raise exception 'Invalid project call event' using errcode='22023'; end if;
      guest_email:=nullif(lower(trim(item->>'attendeeEmail')),'');
      if event_created<'2000-01-01'::timestamptz or event_created>clock_timestamp()+interval '5 minutes'
        or event_updated<event_created or event_end<>event_start+interval '30 minutes'
        or (guest_email is not null and (not private.halenn_confirmation_email_valid(guest_email) or guest_email=c.calendar_id)) then raise exception 'Invalid project call event' using errcode='22023'; end if;
      if item ? 'attendeeName' and jsonb_typeof(item->'attendeeName') not in ('string','null') then raise exception 'Invalid project call event' using errcode='22023'; end if;
      guest_name:=nullif(trim(item->>'attendeeName'),'');
      if length(guest_name)>180 or guest_name ~ '[[:cntrl:]]' then raise exception 'Invalid project call event' using errcode='22023'; end if;
      if item ? 'preferredLanguage' and (jsonb_typeof(item->'preferredLanguage') not in ('string','null')
        or (item->>'preferredLanguage') not in ('nl','en')) then raise exception 'Invalid project call event' using errcode='22023'; end if;
      event_language:=item->>'preferredLanguage';
      if existing.id is not null and event_version<=existing.version_at then ignored:=ignored+1; continue; end if;
      if existing.id is not null then
        -- Provider creation identifies this booking, even if its guest changes.
        if existing.booked_at<>event_created then raise exception 'Invalid project call event' using errcode='22023'; end if;
        -- A changed/ambiguous guest must be reviewed again, never silently assigned
        -- to a different lead. Existing historical milestones remain intact.
        if existing.attendee_email is distinct from guest_email then
          update private.halenn_project_call_bookings set lead_id=null,enquiry_id=null where id=existing.id;
        end if;
        update private.halenn_project_call_bookings set status='confirmed',provider_updated=event_updated,
          version_at=event_version,observed_at=clock_timestamp(),starts_at=event_start,ends_at=event_end,attendee_email=guest_email,attendee_name=guest_name,preferred_language=event_language
          where id=existing.id returning id into booking_id;
      else
        matched_enquiry:=null; matched_lead:=null;
        select count(*)::integer into candidates from public.halenn_website_enquiries q
          where q.email=guest_email and q.received_at<=event_created+interval '5 minutes';
        if candidates=1 then
          select q.id,q.lead_id into matched_enquiry,matched_lead from public.halenn_website_enquiries q
            where q.email=guest_email and q.received_at<=event_created+interval '5 minutes';
        end if;
        insert into private.halenn_project_call_bookings(calendar_id,event_id,status,provider_updated,observed_at,version_at,
          booked_at,starts_at,ends_at,attendee_email,attendee_name,preferred_language,enquiry_id,lead_id)
          values(c.calendar_id,provider_event_id,'confirmed',event_updated,clock_timestamp(),event_version,event_created,event_start,event_end,
            guest_email,guest_name,event_language,matched_enquiry,matched_lead) returning id into booking_id;
      end if;
      if private.halenn_log_project_call(booking_id) then activities:=activities+1; end if;
      changed:=changed+1;
    end loop;
    update private.halenn_project_call_config set last_sync_at=clock_timestamp() where singleton;
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or check_violation or not_null_violation or string_data_right_truncation or numeric_value_out_of_range then
    -- Roll back malformed batches; unexpected database failures remain retryable.
    raise exception 'Invalid project call payload' using errcode='22023';
  end;
  return jsonb_build_object('accepted',true,'changed',changed,'ignored',ignored,'activities',activities);
end;
$$;

create function public.halenn_project_call_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.halenn_is_founder() or public.halenn_needs_password() then raise exception 'Founder access required' using errcode='42501'; end if;
  select jsonb_build_object('enabled',c.enabled,'configured',private.halenn_project_call_configured(),'lastSyncAt',c.last_sync_at,
    'unmatched',coalesce((select jsonb_agg(to_jsonb(t) order by t."bookedAt" desc,t.id) from (
      select b.id,b.attendee_name as "attendeeName",b.attendee_email as "attendeeEmail",b.starts_at as "startsAt",
        b.ends_at as "endsAt",b.status,b.booked_at as "bookedAt",b.preferred_language as "preferredLanguage"
      from private.halenn_project_call_bookings b where b.lead_id is null order by b.booked_at desc,b.id limit 100
    ) t),'[]'::jsonb),
    'upcoming',coalesce((select jsonb_agg(to_jsonb(t) order by t."startsAt",t.id) from (
      select b.id,b.lead_id as "leadId",b.attendee_name as "attendeeName",b.attendee_email as "attendeeEmail",
        b.starts_at as "startsAt",b.ends_at as "endsAt",b.status,b.booked_at as "bookedAt",b.preferred_language as "preferredLanguage"
      from private.halenn_project_call_bookings b where b.lead_id is not null and b.status='confirmed' and b.starts_at>now()
      order by b.starts_at,b.id limit 5
    ) t),'[]'::jsonb)) into result from private.halenn_project_call_config c where c.singleton;
  return result;
end;
$$;

create function public.halenn_link_project_call(booking_id uuid,lead_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare b private.halenn_project_call_bookings; candidate uuid; candidates integer;
begin
  if not public.halenn_is_founder() or public.halenn_needs_password() then raise exception 'Founder access required' using errcode='42501'; end if;
  if $1 is null or $2 is null or not exists(select 1 from public.halenn_leads l where l.id=$2) then raise exception 'Choose a valid booking and lead' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(73904116);
  select * into b from private.halenn_project_call_bookings where id=$1 for update;
  if not found then raise exception 'Choose a valid booking and lead' using errcode='22023'; end if;
  if b.lead_id is not null then
    if b.lead_id=$2 then return jsonb_build_object('linked',true,'alreadyLinked',true); end if;
    raise exception 'This booking is already linked to a lead' using errcode='22023';
  end if;
  select count(*)::integer into candidates from public.halenn_website_enquiries q where q.lead_id=$2 and q.email=b.attendee_email;
  if candidates=1 then select id into candidate from public.halenn_website_enquiries q where q.lead_id=$2 and q.email=b.attendee_email; end if;
  update private.halenn_project_call_bookings set lead_id=$2,enquiry_id=candidate where id=$1;
  perform private.halenn_log_project_call($1);
  return jsonb_build_object('linked',true,'alreadyLinked',false);
end;
$$;

revoke all on function private.halenn_project_call_configured(),private.halenn_project_call_link(uuid),
  private.halenn_project_call_time(text),private.halenn_log_project_call(uuid) from public,anon,authenticated;
revoke all on function public.halenn_submit_website_enquiry_with_booking(jsonb),public.halenn_project_call_destination(uuid),
  public.halenn_receive_project_call_events(text,text,text),public.halenn_project_call_status(),public.halenn_link_project_call(uuid,uuid) from public,anon,authenticated;
grant execute on function public.halenn_submit_website_enquiry_with_booking(jsonb),public.halenn_project_call_destination(uuid),
  public.halenn_receive_project_call_events(text,text,text) to anon,authenticated;
grant execute on function public.halenn_project_call_status(),public.halenn_link_project_call(uuid,uuid) to authenticated;

-- Customer confirmation only. Internal email rendering, envelopes, workers and frozen retries are unchanged.
create or replace function private.halenn_customer_confirmation_payload(enquiry uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  e public.halenn_website_enquiries;
  c private.halenn_enquiry_notification_config;
  n private.halenn_customer_confirmations;
  received text;
  reference text;
  plain_body text;
  html_body text;
  booking_link text;
  booking_html text;
begin
  select * into strict e from public.halenn_website_enquiries where id = enquiry;
  select * into strict c from private.halenn_enquiry_notification_config where singleton;
  select * into strict n from private.halenn_customer_confirmations where enquiry_id = enquiry;
  received := to_char(e.received_at at time zone 'Europe/Amsterdam', 'DD Mon YYYY, HH24:MI') || ' (Amsterdam)';
  reference := e.id::text;
  booking_link := private.halenn_project_call_link(enquiry);
  -- The optional URL contains only a random token, never contact details. No
  -- change is made to payloads already frozen by the existing email worker.
  booking_html := case when booking_link is null then '' else replace($booking$
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 24px;">
                <tr><td style="padding:8px 0 12px;">
                  <p class="halenn-body" style="margin:0 0 10px;color:#536477;font-size:10px;line-height:16px;letter-spacing:2px;">OPTIONAL · 30 MINUTES</p>
                  <p class="halenn-body" style="margin:0;color:#536477;font-size:16px;line-height:26px;">If you’d like to talk through your project, you’re welcome to book a 30-minute call. We’ll discuss your business, your priorities and how Halenn could help.</p>
                </td></tr>
                <tr><td style="padding:4px 0 14px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#111c29" style="background-color:#111c29;">
                    <a href="{{booking_link}}" class="halenn-body" style="display:inline-block;padding:14px 22px;color:#ffffff;background-color:#111c29;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;line-height:20px;text-decoration:none;">Book a project call</a>
                  </td></tr></table>
                </td></tr>
                <tr><td class="halenn-body" style="padding:0;color:#536477;font-size:12px;line-height:20px;">
                  <p style="margin:0 0 10px;">Prefer email? We’ll follow up on your enquiry either way.</p>
                  <p style="margin:0;">You can also use this link:<br><a href="{{booking_link}}" style="color:#111c29;text-decoration:underline;word-break:break-all;overflow-wrap:anywhere;">{{booking_link}}</a></p>
                </td></tr>
              </table>
$booking$, '{{booking_link}}', booking_link) end;
  -- Do not reflect visitor-supplied text or links into an email to an unverified
  -- address. The enquiry itself stays in the private founder workspace.
  plain_body := 'HALENN' || E'\n\nWe’ve received your enquiry.\n\n'
    || 'Thank you for considering Halenn for your next project.'
    || E'\n\nWe’ll review your enquiry and follow up to discuss your requirements and the next steps.'
    || case when booking_link is null then '' else
      E'\n\nOptional · 30-minute project call\nIf you’d like to talk through your project, you’re welcome to book a 30-minute call. We’ll discuss your business, your priorities and how Halenn could help.'
      || E'\nBook a project call: ' || booking_link
      || E'\nPrefer email? We’ll follow up on your enquiry either way.' end
    || E'\n\nIf there’s anything you’d like to add, simply reply to this email.'
    || E'\n\nReceived: ' || received || E'\nReference: ' || reference
    || E'\n\nIf you didn’t submit an enquiry, you can ignore this email.'
    || E'\n\nThe Halenn team\nhttps://halenn.com';
  html_body := replace(replace(replace($html$<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>We’ve received your enquiry | Halenn</title>
  <!--[if !mso]><!-->
  <style>
    @font-face { font-family:'Halenn Manrope'; font-style:normal; font-weight:300; font-display:swap; src:url('https://halenn.com/brand/email/Manrope-Light.ttf') format('truetype'); }
    @font-face { font-family:'Halenn Geist'; font-style:normal; font-weight:400; font-display:swap; src:url('https://halenn.com/brand/email/Geist-Regular.ttf') format('truetype'); }
    .halenn-heading { font-family:'Halenn Manrope','Helvetica Neue',Helvetica,Arial,sans-serif !important; }
    .halenn-body { font-family:'Halenn Geist','Helvetica Neue',Helvetica,Arial,sans-serif !important; }
  </style>
  <!--<![endif]-->
  <style>
    :root { color-scheme:light; supported-color-schemes:light; }
    table { border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }
    img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
    @media only screen and (max-width:480px) {
      .halenn-outer { padding:12px 12px !important; }
      .halenn-content { padding:32px 24px !important; }
      .halenn-heading { font-size:32px !important; line-height:39px !important; }
      .halenn-logo-space { padding-bottom:48px !important; }
    }
  </style>
  <!--[if mso]><style>body,table,td,p,a,h1,.halenn-body,.halenn-heading { font-family:Arial,sans-serif !important; }</style><![endif]-->
</head>
<body bgcolor="#eef1f4" style="margin:0;padding:0;width:100%;background-color:#eef1f4;color:#111c29;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <div aria-hidden="true" style="display:none;font-size:1px;line-height:1px;color:#eef1f4;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">Thank you for considering Halenn. We’ll follow up to discuss your requirements and the next steps.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#eef1f4" style="width:100%;background-color:#eef1f4;">
    <tr><td align="center" class="halenn-outer" style="padding:32px 12px;">
      <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:600px;table-layout:fixed;background-color:#ffffff;">
        <tr><td class="halenn-content halenn-body" style="padding:48px 48px 40px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;">
            <tr><td class="halenn-logo-space" style="padding:0 0 64px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;">
                <tr><td width="167" valign="middle" style="width:167px;padding:0;">
                  <a href="https://halenn.com" style="color:#111c29;text-decoration:none;"><img src="https://halenn.com/brand/email/halenn-wordmark-navy-v1.png" alt="Halenn" width="167" height="24" style="display:block;width:167px;height:24px;max-width:100%;color:#111c29;font-size:20px;line-height:24px;"></a>
                </td><td width="48" align="right" valign="middle" style="width:48px;padding:0;">
                  <img src="https://halenn.com/brand/email/halenn-mark-navy-v1.png" alt="" width="48" height="48" style="display:block;width:48px;height:48px;max-width:100%;">
                </td></tr>
              </table>
            </td></tr>
            <tr><td style="padding:0 0 16px;">
              <p class="halenn-body" style="margin:0;color:#536477;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:10px;line-height:16px;font-weight:400;letter-spacing:2.8px;">ENQUIRY RECEIVED</p>
            </td></tr>
            <tr><td style="padding:0 0 28px;">
              <h1 class="halenn-heading" style="margin:0;color:#111c29;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:40px;line-height:48px;font-weight:300;letter-spacing:-1.2px;">We’ve received<br>your enquiry.</h1>
            </td></tr>
            <tr><td class="halenn-body" style="padding:0;color:#536477;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:16px;line-height:26px;font-weight:400;">
              <p style="margin:0 0 20px;">Thank you for considering Halenn for your next project.</p>
              <p style="margin:0 0 20px;">We’ll review your enquiry and follow up to discuss your requirements and the next steps.</p>
{{booking_invitation}}              <p style="margin:0 0 32px;">If there’s anything you’d like to add, simply reply to this email.</p>
              <p style="margin:0 0 36px;color:#111c29;">The Halenn team</p>
            </td></tr>
            <tr><td style="padding:0;border-top:1px solid #d8e0e8;font-size:0;line-height:0;">&nbsp;</td></tr>
            <tr><td class="halenn-body" style="padding:24px 0 28px;color:#536477;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;line-height:20px;font-weight:400;">
              <p style="margin:0 0 12px;">RECEIVED<br>{{received}}</p>
              <p style="margin:0;">REFERENCE<br><span style="word-break:break-all;overflow-wrap:anywhere;">{{reference}}</span></p>
            </td></tr>
            <tr><td class="halenn-body" style="padding:0;color:#536477;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;line-height:20px;font-weight:400;">
              <p style="margin:0 0 20px;">If you didn’t submit an enquiry, you can ignore this email.</p>
              <p style="margin:0;"><a href="https://halenn.com" style="color:#111c29;text-decoration:none;">halenn.com</a></p>
            </td></tr>
          </table>
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>$html$, '{{received}}', received), '{{reference}}', reference), '{{booking_invitation}}', booking_html);
  return jsonb_build_object(
    'from', c.sender, 'to', jsonb_build_array(n.recipient), 'reply_to', c.recipient,
    'subject', 'We’ve received your enquiry | Halenn', 'text', plain_body, 'html', html_body,
    'headers', jsonb_build_object('Auto-Submitted', 'auto-replied', 'X-Auto-Response-Suppress', 'All')
  );
end;
$$;

revoke all on function private.halenn_customer_confirmation_payload(uuid)
  from public, anon, authenticated;



notify pgrst,'reload schema';
commit;
