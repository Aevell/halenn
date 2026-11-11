begin;

-- NULL preserves the policy and retry history of every existing outbox row.
-- Only future enquiries offered scheduling receive the booking grace period.
alter table private.halenn_customer_confirmations
  add column booking_check_after timestamptz;

-- This watermark is separate from the per-batch health heartbeat. Old bridges
-- keep importing bookings but cannot release held receipts from partial scans.
alter table private.halenn_project_call_config
  add column last_complete_scan_started_at timestamptz;

create or replace function public.halenn_receive_project_call_events(raw_body text,signature text,sent_at text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  c private.halenn_project_call_config;
  secret text; crypto_schema text; expected bytea; supplied bytea; difference integer:=0; i integer;
  delivery_time timestamptz; completed_scan_start timestamptz; body jsonb; item jsonb; field text;
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
      or exists(select 1 from jsonb_object_keys(body) k where k not in ('version','calendarId','events','scanStartedAt')) then
      raise exception 'Invalid project call payload' using errcode='22023';
    end if;
    -- A completed scan is acknowledged only after every event batch succeeds.
    -- A receive timestamp on an intermediate batch is not proof of completeness.
    if body ? 'scanStartedAt' then
      if jsonb_array_length(body->'events') <> 0 or jsonb_typeof(body->'scanStartedAt') is distinct from 'string' then
        raise exception 'Invalid completed scan' using errcode='22023';
      end if;
      completed_scan_start := private.halenn_project_call_time(body->>'scanStartedAt');
      if completed_scan_start < '2000-01-01'::timestamptz
        or completed_scan_start > delivery_time + interval '1 second'
        or completed_scan_start > clock_timestamp() then
        raise exception 'Invalid completed scan' using errcode='22023';
      end if;
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
    update private.halenn_project_call_config set last_sync_at=clock_timestamp(),
      last_complete_scan_started_at=case when completed_scan_start is null then last_complete_scan_started_at
        else greatest(last_complete_scan_started_at,completed_scan_start) end
      where singleton;
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or check_violation or not_null_violation or string_data_right_truncation or numeric_value_out_of_range then
    -- Roll back malformed batches; unexpected database failures remain retryable.
    raise exception 'Invalid project call payload' using errcode='22023';
  end;
  return jsonb_build_object('accepted',true,'changed',changed,'ignored',ignored,'activities',activities);
end;
$$;

-- Preserve the existing delivery implementation, payload freezing, quota checks
-- and provider idempotency. This wrapper decides eligibility before first send.
alter function private.halenn_dispatch_customer_confirmation(uuid)
  rename to halenn_dispatch_customer_confirmation_delivery;

create function private.halenn_dispatch_customer_confirmation(enquiry uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  n private.halenn_customer_confirmations;
  checked_at timestamptz := clock_timestamp();
  synced_at timestamptz;
  waiting_reason text;
begin
  select * into n from private.halenn_customer_confirmations
    where enquiry_id = enquiry for update;
  if not found or n.status <> 'pending' or n.next_attempt_at > checked_at then return; end if;

  if n.booking_check_after is not null and n.attempts = 0
    and n.first_attempt_at is null and n.payload is null and n.request_id is null then
    if n.booking_check_after > checked_at then
      update private.halenn_customer_confirmations
        set next_attempt_at = n.booking_check_after where enquiry_id = enquiry;
      return;
    end if;

    -- The worker already owns an outbox row lock. Never block waiting for an
    -- importer/manual linker that owns the booking lock in the opposite order.
    if not pg_try_advisory_xact_lock(73904116) then
      update private.halenn_customer_confirmations set
        status = case when n.created_at <= checked_at - interval '24 hours' then 'attention' else 'pending' end,
        next_attempt_at = checked_at + interval '1 minute',
        last_error = case when n.created_at <= checked_at - interval '24 hours'
          then 'booking_confirmation_review_required' else 'awaiting_booking_sync' end
        where enquiry_id = enquiry;
      return;
    end if;

    -- A cancelled row also proves a booking was confirmed earlier. Google sends
    -- the booking/cancellation messages; do not revive the enquiry receipt.
    if exists(select 1 from private.halenn_project_call_bookings b
      where b.enquiry_id = enquiry and b.attendee_email = n.recipient
        and b.booked_at >= n.created_at - interval '5 minutes') then
      update private.halenn_customer_confirmations set status = 'skipped',
        last_error = 'project_call_booked' where enquiry_id = enquiry;
      return;
    end if;

    if exists(select 1 from private.halenn_project_call_bookings b
      where b.enquiry_id is null and b.attendee_email = n.recipient
        and b.booked_at >= n.created_at - interval '5 minutes') then
      -- A possible booking is not proof of a match or of no booking. Let the
      -- existing founder review associate it; do not guess from a lead/name.
      waiting_reason := 'booking_match_required';
    else
      select last_complete_scan_started_at into synced_at from private.halenn_project_call_config where singleton;
      if synced_at is null or synced_at < n.booking_check_after
        or synced_at < checked_at - interval '10 minutes' then
        waiting_reason := 'awaiting_booking_sync';
      end if;
    end if;

    if waiting_reason is not null then
      update private.halenn_customer_confirmations set
        status = case when n.created_at <= checked_at - interval '24 hours' then 'attention' else 'pending' end,
        last_error = case when n.created_at <= checked_at - interval '24 hours'
          then 'booking_confirmation_review_required' else waiting_reason end,
        next_attempt_at = checked_at + interval '5 minutes'
        where enquiry_id = enquiry;
      return;
    end if;
  end if;

  -- Historical rows and every attempted/frozen message retain their original
  -- delivery semantics, even if a booking arrives after dispatch started.
  perform private.halenn_dispatch_customer_confirmation_delivery(enquiry);
end;
$$;

create or replace function private.halenn_queue_customer_confirmation() returns trigger
language plpgsql security definer set search_path = '' as $$
declare queued_at timestamptz := clock_timestamp(); booking_after timestamptz;
begin
  begin
    if coalesce((select enabled from private.halenn_project_call_config where singleton), false)
      and private.halenn_project_call_configured() then
      booking_after := queued_at + interval '15 minutes';
    end if;
    insert into private.halenn_customer_confirmations(
      enquiry_id, created_at, recipient, recipient_key, status, last_error,
      booking_check_after, next_attempt_at)
    select new.id, queued_at, lower(trim(new.email)), private.halenn_confirmation_recipient_key(new.email),
      case when customer_confirmations_enabled and enabled then 'pending' else 'skipped' end,
      case when customer_confirmations_enabled and enabled then null else 'confirmations_disabled' end,
      booking_after, coalesce(booking_after, queued_at)
    from private.halenn_enquiry_notification_config where singleton
    on conflict do nothing;
    begin
      perform private.halenn_dispatch_customer_confirmation(new.id);
    exception when others then
      update private.halenn_customer_confirmations set status = 'attention',
        last_error = 'dispatch_error' where enquiry_id = new.id;
    end;
  exception when others then
    begin
      update private.halenn_enquiry_notification_config set customer_queue_error = true where singleton;
    exception when others then null;
    end;
  end;
  return new;
end;
$$;

create or replace function public.halenn_enquiry_notification_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  c private.halenn_enquiry_notification_config;
  key_exists boolean;
  result jsonb;
  customer jsonb;
begin
  if not public.halenn_is_founder() or public.halenn_needs_password() then
    raise exception 'Founder access required' using errcode = '42501';
  end if;
  select * into c from private.halenn_enquiry_notification_config where singleton;
  select exists(select 1 from vault.decrypted_secrets
    where name = 'halenn_resend_api_key' and nullif(trim(decrypted_secret), '') is not null) into key_exists;
  select jsonb_build_object(
    'enabled', coalesce(c.enabled, false),
    'configured', c.sender is not null and c.recipient is not null and key_exists,
    'keyExists', key_exists, 'recipient', c.recipient,
    'pending', count(*) filter (where status in ('pending','queued')),
    'accepted', count(*) filter (where status = 'accepted'),
    'attention', count(*) filter (where status = 'attention') + case when c.admin_worker_error then 1 else 0 end,
    'lastAcceptedAt', max(accepted_at)
  ) into result from private.halenn_enquiry_notifications;

  with delivery as (
    select n.*,
      status = 'pending' and booking_check_after is not null and attempts = 0
        and first_attempt_at is null and payload is null and request_id is null
        and (last_error is null or last_error in ('awaiting_booking_sync','booking_match_required')) as waiting,
      status = 'pending' and (last_error = 'booking_match_required'
        or (last_error = 'awaiting_booking_sync' and created_at <= now() - interval '30 minutes')) as review
    from private.halenn_customer_confirmations n
  )
  select jsonb_build_object(
    'enabled', coalesce(c.customer_confirmations_enabled and c.enabled, false),
    'pending', count(*) filter (where status in ('pending','queued') and not waiting),
    'accepted', count(*) filter (where status = 'accepted'),
    'attention', count(*) filter (where status = 'attention' or review)
      + case when c.customer_worker_error then 1 else 0 end
      + case when c.customer_queue_error then 1 else 0 end,
    'skipped', count(*) filter (where status = 'skipped' and last_error is distinct from 'project_call_booked'),
    'waitingForBooking', count(*) filter (where waiting),
    'bookingSuppressed', count(*) filter (where status = 'skipped' and last_error = 'project_call_booked'),
    'bookingReview', count(*) filter (where review or (status = 'attention' and last_error = 'booking_confirmation_review_required')),
    'lastAcceptedAt', max(accepted_at)
  ) into customer from delivery;
  return result || jsonb_build_object('customer', customer);
end;
$$;

revoke all on function private.halenn_dispatch_customer_confirmation_delivery(uuid),
  private.halenn_dispatch_customer_confirmation(uuid), private.halenn_queue_customer_confirmation(),
  public.halenn_enquiry_notification_status() from public, anon, authenticated;
grant execute on function public.halenn_enquiry_notification_status() to authenticated;
notify pgrst, 'reload schema';
commit;
