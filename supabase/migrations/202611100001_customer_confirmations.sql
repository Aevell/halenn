begin;

-- The verified sender and Vault key are shared, but customer mail has its own
-- outbox, idempotency namespace and rollout flag. Existing founder mail is kept.
alter table private.halenn_enquiry_notification_config
  add column customer_confirmations_enabled boolean not null default false,
  add column admin_worker_error boolean not null default false,
  add column customer_worker_error boolean not null default false,
  add column customer_queue_error boolean not null default false;

create table private.halenn_customer_confirmations (
  enquiry_id uuid primary key references public.halenn_website_enquiries(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  recipient text not null,
  recipient_key text not null,
  status text not null default 'pending' check (status in ('pending','queued','accepted','attention','skipped')),
  payload jsonb,
  request_id bigint,
  attempts integer not null default 0 check (attempts between 0 and 20),
  first_attempt_at timestamptz,
  last_attempt_at timestamptz,
  next_attempt_at timestamptz not null default clock_timestamp(),
  accepted_at timestamptz,
  provider_email_id uuid,
  last_error text,
  check ((accepted_at is not null) = (status = 'accepted')),
  check ((provider_email_id is not null) = (status = 'accepted')),
  check (attempts = 0 or (payload is not null and first_attempt_at is not null))
);
create index halenn_customer_confirmation_pending
  on private.halenn_customer_confirmations(next_attempt_at) where status in ('pending','queued');
create index halenn_customer_confirmation_recipient
  on private.halenn_customer_confirmations(recipient_key, first_attempt_at) where first_attempt_at is not null;
create index halenn_customer_confirmation_daily
  on private.halenn_customer_confirmations(first_attempt_at) where first_attempt_at is not null;
alter table private.halenn_customer_confirmations enable row level security;
revoke all on private.halenn_customer_confirmations from public, anon, authenticated;

create function private.halenn_confirmation_email_valid(value text) returns boolean
language sql immutable set search_path = '' as $fn$
  select coalesce(
    length(value) between 3 and 254
    and length(split_part(value, '@', 1)) between 1 and 64
    and value ~ $email$^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$$email$
    and not exists(select 1 from unnest(string_to_array(split_part(value, '@', 2), '.')) label where length(label)>63),
    false);
$fn$;

create function private.halenn_confirmation_recipient_key(value text) returns text
language sql immutable strict set search_path = '' as $$
  select case when split_part(lower(trim(value)), '@', 2) in ('gmail.com','googlemail.com')
    then replace(split_part(split_part(lower(trim(value)), '@', 1), '+', 1), '.', '') || '@gmail.com'
    else split_part(split_part(lower(trim(value)), '@', 1), '+', 1) || '@' || split_part(lower(trim(value)), '@', 2) end;
$$;

create function private.halenn_customer_confirmation_payload(enquiry uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  e public.halenn_website_enquiries;
  c private.halenn_enquiry_notification_config;
  n private.halenn_customer_confirmations;
  received text;
  reference text;
  plain_body text;
  html_body text;
begin
  select * into strict e from public.halenn_website_enquiries where id = enquiry;
  select * into strict c from private.halenn_enquiry_notification_config where singleton;
  select * into strict n from private.halenn_customer_confirmations where enquiry_id = enquiry;
  received := to_char(e.received_at at time zone 'Europe/Amsterdam', 'DD Mon YYYY, HH24:MI') || ' (Amsterdam)';
  reference := e.id::text;
  -- Do not reflect visitor-supplied text or links into an email to an unverified
  -- address. The enquiry itself stays in the private founder workspace.
  plain_body := 'HALENN' || E'\n\nWe’ve received your enquiry.\n\n'
    || 'Thank you for getting in touch with Halenn.'
    || E'\n\nWe’ll review what you’ve shared and get in touch about the next steps.'
    || E'\n\nHave something to add? Simply reply to this email.'
    || E'\n\nReceived: ' || received || E'\nReference: ' || reference
    || E'\n\nIf you didn’t submit an enquiry, you can ignore this email.'
    || E'\n\nThe Halenn team\nhttps://halenn.com';
  html_body := '<!doctype html><html lang="en"><head><meta charset="utf-8"></head>'
    || '<body style="margin:0;padding:32px 16px;background:#f4f1eb;color:#292820;font-family:Arial,Helvetica,sans-serif">'
    || '<div style="max-width:600px;margin:0 auto;padding:36px;background:#fffefa;border:1px solid #dedbd2">'
    || '<p style="margin:0 0 32px;font-size:15px;letter-spacing:5px">HALENN</p>'
    || '<h1 style="margin:0 0 24px;font-family:Georgia,serif;font-size:30px;font-weight:400;line-height:1.2">We’ve received your enquiry.</h1>'
    || '<p style="margin:0 0 18px;line-height:1.65">Thank you for getting in touch with Halenn.</p>'
    || '<p style="margin:0 0 18px;line-height:1.65">We’ll review what you’ve shared and get in touch about the next steps.</p>'
    || '<p style="margin:0 0 28px;line-height:1.65">Have something to add? Simply reply to this email.</p>'
    || '<div style="border-top:1px solid #dedbd2;padding-top:24px;color:#68665e;font-size:13px;line-height:1.65">'
    || '<p style="margin:0 0 8px">Received: ' || received || '</p>'
    || '<p style="margin:0 0 24px;overflow-wrap:anywhere">Reference: ' || reference || '</p>'
    || '<p style="margin:0 0 24px">If you didn’t submit an enquiry, you can ignore this email.</p></div>'
    || '<p style="margin:0;line-height:1.65">The Halenn team<br><a href="https://halenn.com" style="color:#292820">halenn.com</a></p>'
    || '</div></body></html>';
  return jsonb_build_object(
    'from', c.sender, 'to', jsonb_build_array(n.recipient), 'reply_to', c.recipient,
    'subject', 'We’ve received your enquiry | Halenn', 'text', plain_body, 'html', html_body,
    'headers', jsonb_build_object('Auto-Submitted', 'auto-replied', 'X-Auto-Response-Suppress', 'All')
  );
end;
$$;

create function private.halenn_dispatch_customer_confirmation(enquiry uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  n private.halenn_customer_confirmations;
  c private.halenn_enquiry_notification_config;
  sending_key text;
  queued_id bigint;
  dispatch_time timestamptz := clock_timestamp();
begin
  select * into n from private.halenn_customer_confirmations where enquiry_id = enquiry for update;
  if not found or n.status <> 'pending' or n.next_attempt_at > dispatch_time then return; end if;
  if n.attempts >= 20 or n.first_attempt_at <= dispatch_time - interval '23 hours' then
    update private.halenn_customer_confirmations set status = 'attention',
      last_error = 'retry_window_exhausted' where enquiry_id = enquiry;
    return;
  end if;
  if n.first_attempt_at is null and n.created_at <= dispatch_time - interval '24 hours' then
    update private.halenn_customer_confirmations set status = 'skipped',
      last_error = 'confirmation_expired' where enquiry_id = enquiry;
    return;
  end if;
  select * into c from private.halenn_enquiry_notification_config where singleton;
  if not found or not c.enabled or not c.customer_confirmations_enabled then
    update private.halenn_customer_confirmations set last_error = 'confirmations_disabled',
      next_attempt_at = dispatch_time + interval '5 minutes' where enquiry_id = enquiry;
    return;
  end if;
  if not private.halenn_confirmation_email_valid(n.recipient) then
    update private.halenn_customer_confirmations set status = 'skipped',
      last_error = 'invalid_recipient' where enquiry_id = enquiry;
    return;
  end if;
  select decrypted_secret into sending_key from vault.decrypted_secrets
    where name = 'halenn_resend_api_key' limit 1;
  if nullif(trim(sending_key), '') is null then
    update private.halenn_customer_confirmations set last_error = 'sending_key_missing',
      next_attempt_at = dispatch_time + interval '5 minutes' where enquiry_id = enquiry;
    return;
  end if;
  if n.first_attempt_at is null then
    -- A transaction-wide lock serializes first-attempt reservations across both
    -- trigger and cron, including distinct recipients competing for the daily cap.
    perform pg_advisory_xact_lock(73904105);
    dispatch_time := clock_timestamp();
    if exists(select 1 from private.halenn_customer_confirmations
      where recipient_key = n.recipient_key and first_attempt_at > dispatch_time - interval '1 hour')
      or (select count(*) from private.halenn_customer_confirmations
        where recipient_key = n.recipient_key and first_attempt_at > dispatch_time - interval '24 hours') >= 3 then
      update private.halenn_customer_confirmations set status = 'skipped',
        last_error = 'recipient_limit' where enquiry_id = enquiry;
      return;
    end if;
    -- Reserve capacity for founder alerts on Resend's shared free daily quota.
    if (select count(*) from private.halenn_customer_confirmations
      where first_attempt_at > dispatch_time - interval '24 hours') >= 40 then
      update private.halenn_customer_confirmations set status = 'skipped',
        last_error = 'daily_limit' where enquiry_id = enquiry;
      return;
    end if;
  end if;
  n.payload := coalesce(n.payload, private.halenn_customer_confirmation_payload(enquiry));
  n.attempts := n.attempts + 1;
  update private.halenn_customer_confirmations set payload = n.payload, attempts = n.attempts,
    first_attempt_at = coalesce(first_attempt_at, dispatch_time), last_attempt_at = dispatch_time
    where enquiry_id = enquiry;
  begin
    select net.http_post(
      url := 'https://api.resend.com/emails', body := n.payload,
      headers := jsonb_build_object('Content-Type', 'application/json',
        'Authorization', 'Bearer ' || sending_key,
        'Idempotency-Key', 'halenn-customer-confirmation/' || enquiry::text),
      timeout_milliseconds := 10000
    ) into queued_id;
    if queued_id is null then raise exception 'Confirmation request was not queued'; end if;
    update private.halenn_customer_confirmations set status = 'queued', request_id = queued_id,
      last_error = null, next_attempt_at = dispatch_time + interval '2 minutes' where enquiry_id = enquiry;
  exception when others then
    update private.halenn_customer_confirmations set status = 'pending', request_id = null,
      last_error = 'queue_error', next_attempt_at = dispatch_time + private.halenn_notification_backoff(n.attempts)
      where enquiry_id = enquiry;
  end;
end;
$$;

create function private.halenn_process_customer_confirmations() returns void
language plpgsql security definer set search_path = '' as $$
declare
  n private.halenn_customer_confirmations;
  response record;
  body jsonb;
  error_code text;
  retryable boolean;
  tick timestamptz := clock_timestamp();
begin
  if not pg_try_advisory_xact_lock(73904104) then return; end if;
  for n in select * from private.halenn_customer_confirmations
    where status = 'queued' order by last_attempt_at limit 100 for update skip locked
  loop
    select status_code, content, timed_out, error_msg into response
      from net._http_response where id = n.request_id;
    if not found and n.next_attempt_at > tick then continue; end if;
    body := null;
    begin
      if response.content is not null then body := response.content::jsonb; end if;
    exception when others then body := null;
    end;
    -- Reconcile acceptance before age limits; never resend an accepted message.
    if response.status_code between 200 and 299
      and jsonb_typeof(body->'id') = 'string'
      and (body->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      update private.halenn_customer_confirmations set status = 'accepted', accepted_at = tick,
        provider_email_id = (body->>'id')::uuid, last_error = null where enquiry_id = n.enquiry_id;
      continue;
    end if;
    retryable := true;
    error_code := case
      when response.timed_out then 'request_timeout'
      when response.error_msg is not null then 'request_error'
      when response.status_code is null then 'response_missing'
      when response.status_code = 429 then 'rate_limited'
      when response.status_code >= 500 then 'provider_unavailable'
      when response.status_code between 200 and 299 then 'invalid_response'
      when response.status_code = 409 and body->>'name' = 'concurrent_idempotent_requests' then 'request_in_progress'
      else 'provider_rejected' end;
    if response.status_code between 300 and 499 and response.status_code <> 429
      and not (response.status_code = 409 and coalesce(body->>'name', '') = 'concurrent_idempotent_requests') then
      retryable := false;
      error_code := case when response.status_code = 409 then 'idempotency_conflict'
        when response.status_code in (401,403) then 'provider_configuration'
        else 'provider_rejected' end;
    end if;
    if n.attempts >= 20 or n.first_attempt_at <= tick - interval '23 hours' then
      retryable := false;
      error_code := 'retry_window_exhausted';
    end if;
    update private.halenn_customer_confirmations set
      status = case when retryable then 'pending' else 'attention' end,
      request_id = null, last_error = error_code,
      next_attempt_at = tick + private.halenn_notification_backoff(n.attempts)
      where enquiry_id = n.enquiry_id;
  end loop;
  for n in select * from private.halenn_customer_confirmations
    where status = 'pending' and next_attempt_at <= tick
    order by next_attempt_at, created_at limit 10 for update skip locked
  loop
    begin
      perform private.halenn_dispatch_customer_confirmation(n.enquiry_id);
    exception when others then
      update private.halenn_customer_confirmations set status = 'attention',
        last_error = 'dispatch_error' where enquiry_id = n.enquiry_id;
    end;
  end loop;
end;
$$;

create function private.halenn_queue_customer_confirmation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Both row creation and dispatch are isolated from the saved enquiry and the
  -- independent founder notification. Paused confirmations are never backfilled.
  begin
    insert into private.halenn_customer_confirmations(enquiry_id, recipient, recipient_key, status, last_error)
    select new.id, lower(trim(new.email)), private.halenn_confirmation_recipient_key(new.email),
      case when customer_confirmations_enabled and enabled then 'pending' else 'skipped' end,
      case when customer_confirmations_enabled and enabled then null else 'confirmations_disabled' end
    from private.halenn_enquiry_notification_config where singleton
    on conflict do nothing;
    begin
      perform private.halenn_dispatch_customer_confirmation(new.id);
    exception when others then
      update private.halenn_customer_confirmations set status = 'attention',
        last_error = 'dispatch_error' where enquiry_id = new.id;
    end;
  exception when others then
    -- A queue insertion failure must remain visible even after healthy worker
    -- passes. Only an operator clears this sticky flag after investigation.
    begin
      update private.halenn_enquiry_notification_config set customer_queue_error = true where singleton;
    exception when others then null;
    end;
  end;
  return new;
end;
$$;

-- No SELECT/INSERT backfill. The trigger only observes future saved enquiries.
create trigger halenn_customer_confirmation after insert on public.halenn_website_enquiries
  for each row execute function private.halenn_queue_customer_confirmation();

-- Keep the already-tested admin worker intact, with a stable cron entry point.
alter function private.halenn_process_enquiry_notifications() rename to halenn_process_admin_enquiry_notifications;
create function private.halenn_process_enquiry_notifications() returns void
language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform private.halenn_process_admin_enquiry_notifications();
    update private.halenn_enquiry_notification_config set admin_worker_error = false where singleton;
  exception when others then
    update private.halenn_enquiry_notification_config set admin_worker_error = true where singleton;
  end;
  begin
    perform private.halenn_process_customer_confirmations();
    update private.halenn_enquiry_notification_config set customer_worker_error = false where singleton;
  exception when others then
    update private.halenn_enquiry_notification_config set customer_worker_error = true where singleton;
  end;
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
  select jsonb_build_object(
    'enabled', coalesce(c.customer_confirmations_enabled and c.enabled, false),
    'pending', count(*) filter (where status in ('pending','queued')),
    'accepted', count(*) filter (where status = 'accepted'),
    'attention', count(*) filter (where status = 'attention') + case when c.customer_worker_error then 1 else 0 end
      + case when c.customer_queue_error then 1 else 0 end,
    'skipped', count(*) filter (where status = 'skipped'),
    'lastAcceptedAt', max(accepted_at)
  ) into customer from private.halenn_customer_confirmations;
  return result || jsonb_build_object('customer', customer);
end;
$$;

revoke all on function private.halenn_confirmation_email_valid(text),
  private.halenn_confirmation_recipient_key(text), private.halenn_customer_confirmation_payload(uuid),
  private.halenn_dispatch_customer_confirmation(uuid), private.halenn_process_customer_confirmations(),
  private.halenn_queue_customer_confirmation(), private.halenn_process_admin_enquiry_notifications(),
  private.halenn_process_enquiry_notifications(), public.halenn_enquiry_notification_status()
  from public, anon, authenticated;
grant execute on function public.halenn_enquiry_notification_status() to authenticated;
notify pgrst, 'reload schema';
commit;
