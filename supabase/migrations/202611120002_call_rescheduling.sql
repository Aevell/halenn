begin;

-- Gated until the calendar deployment supports atomic, idempotent rescheduling.
-- Existing appointments, email payloads and conversion history are preserved.
alter table private.halenn_project_call_config add column rescheduling_enabled boolean not null default false;
alter table private.halenn_online_calls add column calendar_sequence integer not null default 0;
create table private.halenn_call_reschedules (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references private.halenn_online_calls(id),
  created_at timestamptz not null default clock_timestamp(),
  new_starts_at timestamptz not null,
  expected_updated timestamptz not null,
  status text not null default 'pending' check(status in ('pending','confirmed','unavailable','conflict')),
  resolved_at timestamptz
);
create unique index halenn_call_reschedules_pending on private.halenn_call_reschedules(call_id) where status='pending';
alter table private.halenn_call_reschedules enable row level security;
revoke all on private.halenn_call_reschedules from public,anon,authenticated;

create or replace function public.halenn_online_call_portal(token uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c private.halenn_project_call_config; invitation private.halenn_project_call_invitations; b private.halenn_online_calls; r private.halenn_call_reschedules;
begin
  select * into c from private.halenn_project_call_config where singleton;
  if not c.online_booking_enabled then return null; end if;
  select * into invitation from private.halenn_project_call_invitations where halenn_project_call_invitations.token=$1;
  if not found then return jsonb_build_object('available',false); end if;
  select * into b from private.halenn_online_calls where enquiry_id=invitation.enquiry_id order by created_at desc limit 1;
  select * into r from private.halenn_call_reschedules where call_id=b.id order by created_at desc limit 1;
  return jsonb_build_object('available',c.enabled and c.online_booking_endpoint is not null and private.halenn_project_call_configured(),
    'status',coalesce(b.status,'new'),'startsAt',b.starts_at,'language',b.preferred_language,
    'meetUrl',case when b.status='confirmed' then b.meet_url else null end,'cancelRequested',coalesce(b.cancel_requested,false),
    'updatedAt',b.provider_updated,'canReschedule',coalesce(c.enabled and c.rescheduling_enabled and b.status='confirmed' and b.starts_at>clock_timestamp() and not b.cancel_requested and coalesce(r.status,'')<>'pending',false),
    'reschedulePending',coalesce(r.status='pending',false),'rescheduleOutcome',case when r.status<>'pending' then r.status end,
    'rescheduleId',r.id,'calendarSequence',coalesce(b.calendar_sequence,0));
end;
$$;

create or replace function public.halenn_prepare_online_call(token uuid,operation text,day text default null,starts_at text default null,preferred_language text default null) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare c private.halenn_project_call_config; invitation private.halenn_project_call_invitations;
  e public.halenn_website_enquiries; b private.halenn_online_calls; r private.halenn_call_reschedules; start_time timestamptz; local_start timestamp;
  body jsonb; raw text; stamp text; request_id uuid:=gen_random_uuid(); now_at timestamptz:=clock_timestamp(); selected_day date;
begin
  if operation not in ('availability','book','cancel','reschedule') or operation is null then raise exception 'Invalid request' using errcode='22023'; end if;
  select * into c from private.halenn_project_call_config where singleton;
  if not c.enabled or not c.online_booking_enabled or c.online_booking_endpoint is null or not private.halenn_project_call_configured() then
    raise exception 'Booking unavailable' using errcode='55000'; end if;
  select * into invitation from private.halenn_project_call_invitations where halenn_project_call_invitations.token=$1 for update;
  if not found then raise exception 'Booking unavailable' using errcode='55000'; end if;
  if invitation.request_window > now_at-interval '1 minute' and invitation.request_count>=20 then
    raise exception 'Please wait before trying again' using errcode='54000'; end if;
  update private.halenn_project_call_invitations set
    request_count=case when request_window>now_at-interval '1 minute' then request_count+1 else 1 end,
    request_window=case when request_window>now_at-interval '1 minute' then request_window else now_at end where enquiry_id=invitation.enquiry_id;
  select * into strict e from public.halenn_website_enquiries where id=invitation.enquiry_id;
  if operation<>'availability' then
    perform 1 from private.halenn_customer_confirmations where enquiry_id=e.id for update;
  end if;
  select * into b from private.halenn_online_calls where enquiry_id=e.id and status in ('pending','confirmed','review') order by created_at desc limit 1 for update;
  select * into r from private.halenn_call_reschedules where call_id=b.id and status='pending' for update;
  if operation='availability' then
    if day is null or day !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date' using errcode='22023'; end if;
    selected_day:=day::date;
    if selected_day < (now_at at time zone 'Europe/Amsterdam')::date or selected_day>(now_at at time zone 'Europe/Amsterdam')::date+60 then
      raise exception 'Invalid date' using errcode='22023'; end if;
    body:=jsonb_build_object('day',day);
    if c.rescheduling_enabled and b.status='confirmed' and not b.cancel_requested then
      body:=body||jsonb_build_object('excludeEventId',b.event_id,'excludeCallId',b.id);
    end if;
  elsif operation='reschedule' then
    if not c.rescheduling_enabled or b.id is null or b.status<>'confirmed' or b.cancel_requested or b.starts_at<=now_at then
      raise exception 'This appointment cannot be rescheduled online' using errcode='55000'; end if;
    if r.id is null then
      start_time:=private.halenn_project_call_time(starts_at); local_start:=start_time at time zone 'Europe/Amsterdam';
      if start_time is null or start_time<now_at+interval '12 hours' or local_start::date>(now_at at time zone 'Europe/Amsterdam')::date+60
        or local_start::time<'09:00' or local_start::time>'22:20' or extract(second from local_start)<>0
        or mod(extract(epoch from (local_start::time-'09:00'::time))::integer,2400)<>0 then
        raise exception 'Choose an available appointment time' using errcode='22023'; end if;
      if start_time=b.starts_at then return jsonb_build_object('portal',public.halenn_online_call_portal(token)); end if;
      if (select count(*) from private.halenn_call_reschedules where call_id=b.id and created_at>now_at-interval '24 hours')>=3 then
        raise exception 'Please contact us to change your call' using errcode='54000'; end if;
      insert into private.halenn_call_reschedules(call_id,new_starts_at,expected_updated)
        values(b.id,start_time,b.provider_updated) returning * into r;
    end if;
    -- A retry reuses the saved change, even when a browser submits another time.
    request_id:=b.id;
    body:=jsonb_build_object('eventId',b.event_id,'changeId',r.id,
      'expectedUpdated',to_char(r.expected_updated at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'start',to_char(r.new_starts_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'));
  elsif operation='book' then
    if b.id is not null then
      if b.status='confirmed' then return jsonb_build_object('portal',public.halenn_online_call_portal(token)); end if;
      if b.cancel_requested or b.status='review' then raise exception 'We are checking your appointment. Please contact us by email.' using errcode='55000'; end if;
      -- A retry always addresses the same calendar event, even after a timeout.
      request_id:=b.id;
    else
      if preferred_language is null or preferred_language not in ('nl','en') then raise exception 'Choose a language' using errcode='22023'; end if;
      start_time:=private.halenn_project_call_time(starts_at); local_start:=start_time at time zone 'Europe/Amsterdam';
      if start_time<now_at+interval '12 hours' or local_start::date>(now_at at time zone 'Europe/Amsterdam')::date+60
        or local_start::time<'09:00' or local_start::time>'22:20' or extract(second from local_start)<>0
        or mod(extract(epoch from (local_start::time-'09:00'::time))::integer,2400)<>0 then
        raise exception 'Choose an available appointment time' using errcode='22023'; end if;
      if (select count(*) from private.halenn_online_calls where enquiry_id=e.id and created_at>now_at-interval '24 hours')>=3 then
        raise exception 'Please contact us to arrange your call' using errcode='54000'; end if;
      insert into private.halenn_online_calls(id,enquiry_id,starts_at,preferred_language,event_id)
        values(request_id,e.id,start_time,preferred_language,'halenn'||replace(request_id::text,'-','')) returning * into b;
    end if;
    body:=jsonb_build_object('start',to_char(b.starts_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'language',b.preferred_language,'name',e.name,'email',e.email,'eventId',b.event_id);
  else
    if b.id is null then return jsonb_build_object('portal',public.halenn_online_call_portal(token)); end if;
    if r.id is not null then raise exception 'Please wait until the time change is confirmed' using errcode='55000'; end if;
    if b.status<>'confirmed' then raise exception 'Please wait until your booking is confirmed' using errcode='55000'; end if;
    update private.halenn_online_calls set cancel_requested=true where id=b.id;
    request_id:=b.id;
    body:=jsonb_build_object('eventId',b.event_id);
  end if;
  body:=body||jsonb_build_object('version',1,'calendarId',c.calendar_id,'requestId',request_id,'operation',operation);
  raw:=body::text; stamp:=floor(extract(epoch from now_at))::bigint::text;
  return jsonb_build_object('endpoint',c.online_booking_endpoint,'envelope',jsonb_build_object('body',raw,'sentAt',stamp,
    'signature',private.halenn_online_signature('online-request.'||stamp||'.'||raw)));
end;
$$;

create or replace function public.halenn_finish_online_call(raw_body text,signature text,sent_at text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare expected bytea; supplied bytea; difference integer:=0; index integer; result jsonb; b private.halenn_online_calls;
  r private.halenn_call_reschedules; change_state text;
  e public.halenn_website_enquiries; start_time timestamptz; end_time timestamptz; updated_time timestamptz; created_time timestamptz;
  provider_status text; notice_kind text; notice_revision text:='initial'; notification uuid; booking uuid; changed boolean:=false;
begin
  if raw_body is null or octet_length(raw_body)>30000 or signature is null or signature!~'^[a-f0-9]{64}$'
    or sent_at is null or sent_at!~'^[0-9]{10}$' or abs(extract(epoch from clock_timestamp())-sent_at::bigint)>300 then
    raise exception 'Invalid booking authentication' using errcode='28000'; end if;
  expected:=decode(private.halenn_online_signature('online-response.'||sent_at||'.'||raw_body),'hex'); supplied:=decode(signature,'hex');
  for index in 0..31 loop difference:=difference|(get_byte(expected,index)#get_byte(supplied,index)); end loop;
  if difference<>0 then raise exception 'Invalid booking authentication' using errcode='28000'; end if;
  result:=raw_body::jsonb;
  if result->'version' is distinct from '1'::jsonb or result->>'calendarId' is distinct from 'aevellgroup@gmail.com'
    or coalesce(result->>'requestId','')!~'^[0-9a-f-]{36}$' then raise exception 'Invalid booking result' using errcode='22023'; end if;
  if result->>'operation'='availability' then
    if jsonb_typeof(result->'slots') is distinct from 'array' or jsonb_array_length(result->'slots')>45
      or exists(select 1 from jsonb_array_elements(result->'slots') x where jsonb_typeof(x)<>'string'
        or x#>>'{}'!~'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$') then
      raise exception 'Invalid availability' using errcode='22023'; end if;
    return jsonb_build_object('slots',result->'slots','requestId',result->>'requestId');
  end if;
  if result->>'operation' not in ('book','cancel','sync','reschedule') then raise exception 'Invalid booking result' using errcode='22023'; end if;
  select * into strict b from private.halenn_online_calls where id=(result->>'requestId')::uuid;
  -- Same ordering as booking preparation and the enquiry worker.
  perform 1 from private.halenn_customer_confirmations where enquiry_id=b.enquiry_id for update;
  perform pg_advisory_xact_lock(73904116);
  select * into strict b from private.halenn_online_calls where id=b.id for update;
  if result->>'eventId' is distinct from b.event_id then raise exception 'Invalid booking result' using errcode='22023'; end if;
  provider_status:=result->>'status';
  if result->>'operation'='reschedule' or result ? 'changeId' then
    if coalesce(result->>'changeId','')!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Invalid time change' using errcode='22023'; end if;
    select * into r from private.halenn_call_reschedules where id=(result->>'changeId')::uuid and call_id=b.id for update;
    if result->>'operation'='reschedule' then
      if r.id is null then raise exception 'Invalid time change' using errcode='22023'; end if;
      if r.status<>'pending' then return jsonb_build_object('accepted',true); end if;
      change_state:=result->>'rescheduleOutcome';
      if change_state not in ('confirmed','unavailable','conflict') or change_state is null
        or provider_status not in ('confirmed','cancelled') or provider_status is null
        or (change_state='confirmed' and (provider_status<>'confirmed' or private.halenn_project_call_time(result->>'start') is distinct from r.new_starts_at)) then
        raise exception 'Invalid time change' using errcode='22023'; end if;
    elsif r.status='pending' then
      -- A calendar sync can settle a write whose immediate reply was lost.
      change_state:=case when provider_status='confirmed' and private.halenn_project_call_time(result->>'start')=r.new_starts_at then 'confirmed' else 'conflict' end;
    end if;
  end if;
  if provider_status='unavailable' then
    if b.status='pending' then update private.halenn_online_calls set status='unavailable' where id=b.id; end if;
    return jsonb_build_object('accepted',true);
  end if;
  if provider_status not in ('confirmed','cancelled') or provider_status is null then raise exception 'Invalid booking result' using errcode='22023'; end if;
  updated_time:=private.halenn_project_call_time(result->>'updated');
  if updated_time is null or updated_time>clock_timestamp()+interval '1 minute' then raise exception 'Invalid booking result' using errcode='22023'; end if;
  if r.status='pending' and change_state is not null then
    if change_state='confirmed' and updated_time<=r.expected_updated then raise exception 'Invalid time change version' using errcode='22023'; end if;
    update private.halenn_call_reschedules set status=change_state,resolved_at=clock_timestamp() where id=r.id;
  elsif provider_status='cancelled' then
    update private.halenn_call_reschedules set status='conflict',resolved_at=clock_timestamp() where call_id=b.id and status='pending';
  end if;
  if (b.provider_updated is not null and (updated_time<b.provider_updated or (updated_time=b.provider_updated and provider_status<>'cancelled')))
    or b.status='cancelled' then return jsonb_build_object('accepted',true); end if;
  select * into strict e from public.halenn_website_enquiries where id=b.enquiry_id;
  if provider_status='confirmed' then
    start_time:=private.halenn_project_call_time(result->>'start'); end_time:=private.halenn_project_call_time(result->>'end');
    created_time:=private.halenn_project_call_time(result->>'created');
    if start_time is null or end_time is distinct from start_time+interval '30 minutes' or created_time is null
      or created_time>clock_timestamp()+interval '1 minute' or created_time<b.created_at-interval '1 minute'
      or coalesce(result->>'meetUrl','')!~'^https://meet\.google\.com/[a-z]{3}-[a-z]{4}-[a-z]{3}$'
      or (b.status='pending' and start_time<>b.starts_at) then raise exception 'Invalid booking result' using errcode='22023'; end if;
    changed:=b.status='confirmed' and (b.starts_at<>start_time or b.meet_url is distinct from result->>'meetUrl');
    if changed then
      update private.halenn_call_confirmations set status='skipped',last_error='superseded_by_appointment_update'
        where call_id=b.id and kind in ('confirmed','updated') and status='pending' and first_attempt_at is null;
    end if;
    notice_kind:=case when changed then 'updated' else 'confirmed' end;
    notice_revision:=case when changed then updated_time::text else 'initial' end;
    insert into private.halenn_project_call_bookings(calendar_id,event_id,status,provider_updated,observed_at,version_at,booked_at,starts_at,ends_at,attendee_email,attendee_name,preferred_language,enquiry_id,lead_id)
      values('aevellgroup@gmail.com',b.event_id,'confirmed',updated_time,clock_timestamp(),updated_time,created_time,start_time,end_time,e.email,e.name,b.preferred_language,e.id,e.lead_id)
      on conflict(calendar_id,event_id) do update set starts_at=excluded.starts_at,ends_at=excluded.ends_at,provider_updated=excluded.provider_updated,
        observed_at=excluded.observed_at,version_at=excluded.version_at returning id into booking;
    update private.halenn_online_calls set status='confirmed',starts_at=start_time,meet_url=result->>'meetUrl',provider_updated=updated_time,booking_id=booking,
      calendar_sequence=calendar_sequence+case when changed then 1 else 0 end where id=b.id;
    perform private.halenn_log_project_call(booking);
    update private.halenn_customer_confirmations set status='skipped',last_error='project_call_booked'
      where enquiry_id=e.id and status='pending' and attempts=0 and first_attempt_at is null and payload is null and request_id is null;
  else
    notice_kind:='cancelled';
    update private.halenn_online_calls set status='cancelled',cancel_requested=false,provider_updated=updated_time where id=b.id;
    update private.halenn_project_call_bookings set status='cancelled',provider_updated=updated_time,version_at=updated_time,observed_at=clock_timestamp() where id=b.booking_id;
    update private.halenn_call_confirmations set status='skipped',last_error='cancelled_before_delivery'
      where call_id=b.id and kind in ('confirmed','updated') and status='pending' and first_attempt_at is null;
  end if;
  insert into private.halenn_call_confirmations(call_id,kind,revision,recipient,recipient_key)
    values(b.id,notice_kind,notice_revision,e.email,private.halenn_confirmation_recipient_key(e.email)) on conflict(call_id,kind,revision) do nothing returning id into notification;
  if notification is not null then
    -- Freeze exactly the appointment confirmed by this response, before later edits.
    update private.halenn_call_confirmations set payload=private.halenn_call_confirmation_payload(notification) where id=notification;
    begin perform private.halenn_dispatch_call_confirmation(notification);
    exception when others then
      update private.halenn_call_confirmations set status='attention',last_error='dispatch_error' where id=notification;
    end;
  end if;
  return jsonb_build_object('accepted',true);
end;
$$;

create or replace function private.halenn_call_confirmation_payload(notification uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare n private.halenn_call_confirmations; b private.halenn_online_calls; e public.halenn_website_enquiries;
  c private.halenn_enquiry_notification_config; token uuid; subject text; heading text; intro text;
  appointment text; host text; summary text; escaped_summary text; manage_url text; content text; plain text; html text;
begin
  select * into strict n from private.halenn_call_confirmations where id=notification;
  select * into strict b from private.halenn_online_calls where id=n.call_id;
  select * into strict e from public.halenn_website_enquiries where id=b.enquiry_id;
  select * into strict c from private.halenn_enquiry_notification_config where singleton;
  select i.token into strict token from private.halenn_project_call_invitations i where i.enquiry_id=e.id;
  manage_url:='https://halenn.com/project-call/'||token::text;
  appointment:=to_char(b.starts_at at time zone 'Europe/Amsterdam','FMDay, DD Month YYYY')||' at '
    ||to_char(b.starts_at at time zone 'Europe/Amsterdam','HH24:MI')||'–'
    ||to_char((b.starts_at+interval '30 minutes') at time zone 'Europe/Amsterdam','HH24:MI')||' (Europe/Amsterdam)';
  host:=case when b.preferred_language='nl' then 'Dutch · with Dave' else 'English · with Dave or Terence' end;
  -- Quote a bounded excerpt, never interpret HTML or turn submitted links into CTAs.
  -- Break automatic URL/email recognition in both the text and HTML versions.
  summary:=left(regexp_replace(e.message,'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]','','g'),1600);
  summary:=replace(replace(replace(summary,'.','.'||chr(8203)),':',':'||chr(8203)),'@','@'||chr(8203));
  if length(e.message)>1600 then summary:=summary||E'\n… (excerpt; we have your full enquiry)'; end if;
  escaped_summary:=replace(private.halenn_notification_escape(summary),E'\n','<br>');
  if n.kind='cancelled' then
    subject:='Your project call has been cancelled | Halenn'; heading:='Your call is cancelled.';
    intro:='Your appointment has been cancelled. Your enquiry is still with us, and we can continue the conversation by email.';
    content:='<p style="margin:0 0 24px">'||intro||'</p><p style="margin:0 0 24px">Cancelled appointment<br><strong>'||appointment||'</strong></p>'
      ||'<p style="margin:0 0 28px">To arrange another time, use your booking page or reply to this email.</p>'
      ||'<p><a href="'||manage_url||'" style="color:#111c29">Choose another time</a></p>';
    plain:='HALENN'||E'\n\n'||heading||E'\n\n'||intro||E'\n\nCancelled appointment: '||appointment||E'\n\nChoose another time: '||manage_url;
  else
    if b.meet_url is null then raise exception 'Meeting link is not ready'; end if;
    subject:=case when n.kind='updated' then 'Your project call has been updated | Halenn' else 'Your project call is confirmed | Halenn' end;
    heading:=case when n.kind='updated' then 'Your updated<br>project call.' else 'Let’s talk about<br>your next step.' end;
    intro:=case when n.kind='updated' then 'Your appointment details have changed. Please use the updated time and meeting link below. If you saved a calendar copy, replace it with these updated details.' else 'Your 30-minute project call is confirmed. We’ve received your enquiry and look forward to discussing it with you.' end;
    content:='<p style="margin:0 0 28px">'||intro||'</p>'
      ||'<table role="presentation" width="100%" style="border-top:1px solid #d8e0e8;border-bottom:1px solid #d8e0e8"><tr><td style="padding:24px 0">'
      ||'<p style="margin:0 0 8px;color:#111c29"><strong>'||appointment||'</strong></p>'
      ||'<p style="margin:0">30 minutes · Google Meet<br>'||host||'</p></td></tr></table>'
      ||'<p style="margin:28px 0 36px"><a href="'||b.meet_url||'" style="display:inline-block;padding:14px 22px;background:#111c29;color:#fff;text-decoration:none">Join your call</a></p>'
      ||'<h2 style="font-size:20px;font-weight:400;color:#111c29;margin:0 0 16px">Your enquiry</h2>'
      ||'<p style="margin:0 0 12px;font-size:13px">A summary of what you shared:</p>'
      ||'<blockquote style="margin:0 0 32px;padding:0 0 0 18px;border-left:2px solid #d8e0e8;overflow-wrap:anywhere;word-break:break-word">'||escaped_summary||'</blockquote>'
      ||'<h2 style="font-size:20px;font-weight:400;color:#111c29;margin:0 0 16px">What happens next</h2>'
      ||'<p style="margin:0 0 20px">We’ll review your enquiry before we meet. During the call, we’ll discuss your priorities, answer your questions and agree on a sensible next step.</p>'
      ||'<p style="margin:0 0 28px">There’s no need to prepare a technical brief. If you’d like to add anything beforehand, simply reply to this email.</p>'
      ||'<p style="font-size:13px;margin:0 0 32px"><a href="'||manage_url||'/calendar" style="color:#111c29">Add to your calendar</a> · <a href="'||manage_url||'" style="color:#111c29">Manage your call</a></p>';
    plain:='HALENN'||E'\n\n'||intro||E'\n\n'||appointment||E'\n30 minutes · Google Meet\n'||host
      ||E'\nJoin your call: '||b.meet_url||E'\n\nYour enquiry\nA summary of what you shared:\n'||summary
      ||E'\n\nWhat happens next\nWe’ll review your enquiry before we meet. During the call, we’ll discuss your priorities, answer your questions and agree on a sensible next step.'
      ||E'\nThere’s no need to prepare a technical brief. If you’d like to add anything beforehand, simply reply to this email.'
      ||E'\n\nAdd to your calendar: '||manage_url||E'/calendar\nManage your call: '||manage_url;
  end if;
  html:=$html$<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
  <style>@font-face{font-family:'Halenn Manrope';font-style:normal;font-weight:300;src:url('https://halenn.com/brand/email/Manrope-Light.ttf') format('truetype')}@font-face{font-family:'Halenn Geist';font-style:normal;font-weight:400;src:url('https://halenn.com/brand/email/Geist-Regular.ttf') format('truetype')}body,td,p,a{font-family:'Halenn Geist','Helvetica Neue',Helvetica,Arial,sans-serif}h1{font-family:'Halenn Manrope','Helvetica Neue',Helvetica,Arial,sans-serif}table{border-collapse:collapse}img{border:0;display:block}@media(max-width:480px){.content{padding:32px 24px!important}h1{font-size:32px!important;line-height:39px!important}.outer{padding:12px!important}}</style>
  <!--[if mso]><style>body,table,td,p,a,h1{font-family:Arial,sans-serif!important}</style><![endif]--></head>
  <body style="margin:0;background:#eef1f4;color:#111c29"><table role="presentation" width="100%" bgcolor="#eef1f4"><tr><td align="center" class="outer" style="padding:32px 12px">
  <!--[if mso]><table role="presentation" width="600"><tr><td><![endif]--><table role="presentation" width="100%" bgcolor="#ffffff" style="max-width:600px;table-layout:fixed;background:#fff"><tr><td class="content" style="padding:48px;color:#536477;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:16px;line-height:26px">
  <table role="presentation" width="100%"><tr><td style="padding-bottom:56px"><a href="https://halenn.com"><img src="https://halenn.com/brand/email/halenn-wordmark-navy-v1.png" width="167" height="24" alt="Halenn"></a></td><td align="right" style="padding-bottom:56px"><img src="https://halenn.com/brand/email/halenn-mark-navy-v1.png" width="48" height="48" alt=""></td></tr></table>$html$
    ||'<p style="font-size:10px;letter-spacing:2.8px;margin:0 0 16px">'||case when n.kind='confirmed' then 'PROJECT CALL CONFIRMED' when n.kind='updated' then 'APPOINTMENT UPDATED' else 'APPOINTMENT CANCELLED' end||'</p>'
    ||'<h1 style="font-size:40px;line-height:48px;font-weight:300;letter-spacing:-1.2px;margin:0 0 28px;color:#111c29">'||heading||'</h1>'||content
    ||'<p style="margin:0 0 32px;color:#111c29">The Halenn team</p><p style="border-top:1px solid #d8e0e8;padding-top:24px;font-size:12px;line-height:20px;margin:0">'
    ||'Enquiry reference: '||e.id::text||'<br>If you didn’t request this call, please reply to let us know.<br><a href="https://halenn.com" style="color:#111c29">halenn.com</a></p>'
    ||'</td></tr></table><!--[if mso]></td></tr></table><![endif]--></td></tr></table></body></html>';
  return jsonb_build_object('from',c.sender,'to',jsonb_build_array(n.recipient),'reply_to',c.recipient,'subject',subject,'html',html,
    'text',plain||E'\n\nThe Halenn team\nEnquiry reference: '||e.id::text,
    'headers',jsonb_build_object('Auto-Submitted','auto-replied','X-Auto-Response-Suppress','All'));
end;
$$;

create or replace function public.halenn_enquiry_notification_status() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; call_counts jsonb;
begin
  result:=public.halenn_pre_online_notification_status();
  select jsonb_build_object('pending',count(*) filter(where status in ('pending','queued')),
    'accepted',count(*) filter(where status='accepted'),'attention',count(*) filter(where status='attention')
      +(select count(*) from private.halenn_online_calls where status in ('pending','review') and created_at<clock_timestamp()-interval '15 minutes')
      +(select count(*) from private.halenn_call_reschedules where status='pending' and created_at<clock_timestamp()-interval '15 minutes')
      +(select case when call_worker_error then 1 else 0 end from private.halenn_enquiry_notification_config where singleton),
    'lastAcceptedAt',max(accepted_at)) into call_counts from private.halenn_call_confirmations;
  return result||jsonb_build_object('callConfirmations',call_counts,'combinedCallEmails',
    coalesce((select online_booking_enabled from private.halenn_project_call_config where singleton),false));
end;
$$;
-- Function privileges are retained by CREATE OR REPLACE; new private records
-- have no browser grants or policies. No live feature is enabled here.
notify pgrst, 'reload schema';
commit;
