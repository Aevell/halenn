begin;

-- Delivery is disabled until the sending domain and its restricted Resend key
-- have been verified. The key belongs in Vault, never in this migration.
create schema if not exists extensions;
create extension if not exists pg_net with schema extensions;
do $$ begin
  if to_regclass('vault.decrypted_secrets') is null then
    raise exception 'Enable Supabase Vault before installing enquiry notifications';
  end if;
end $$;

create table private.halenn_enquiry_notification_config (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  sender text not null check (sender = 'Halenn <enquiries@notifications.halenn.com>'),
  recipient text not null check (recipient = 'contact@halenn.com')
);
insert into private.halenn_enquiry_notification_config(singleton, sender, recipient)
values (true, 'Halenn <enquiries@notifications.halenn.com>', 'contact@halenn.com');

create table private.halenn_enquiry_notifications (
  enquiry_id uuid primary key references public.halenn_website_enquiries(id) on delete cascade,
  created_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','queued','accepted','attention')),
  -- Frozen on the first dispatch attempt: Resend requires identical retry bodies.
  payload jsonb,
  request_id bigint,
  attempts integer not null default 0 check (attempts between 0 and 20),
  first_attempt_at timestamptz,
  last_attempt_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  accepted_at timestamptz,
  provider_email_id uuid,
  -- Only application-defined codes are stored, never raw responses or secrets.
  last_error text,
  check ((accepted_at is not null) = (status = 'accepted')),
  check ((provider_email_id is not null) = (status = 'accepted')),
  check (attempts = 0 or (payload is not null and first_attempt_at is not null))
);
create index halenn_notification_pending
  on private.halenn_enquiry_notifications(next_attempt_at)
  where status in ('pending','queued');
alter table private.halenn_enquiry_notification_config enable row level security;
alter table private.halenn_enquiry_notifications enable row level security;
revoke all on private.halenn_enquiry_notification_config, private.halenn_enquiry_notifications
  from public, anon, authenticated;

create function private.halenn_notification_escape(value text) returns text
language sql immutable strict set search_path = '' as $$
  select replace(replace(replace(replace(replace(value,
    '&','&amp;'), '<','&lt;'), '>','&gt;'), '"','&quot;'), '''','&#39;');
$$;

create function private.halenn_notification_backoff(attempt integer) returns interval
language sql immutable set search_path = '' as $$
  select case when attempt <= 1 then interval '5 minutes'
    when attempt = 2 then interval '10 minutes'
    when attempt = 3 then interval '20 minutes'
    when attempt = 4 then interval '40 minutes'
    else interval '1 hour' end;
$$;

create function private.halenn_notification_payload(enquiry uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  e public.halenn_website_enquiries;
  c private.halenn_enquiry_notification_config;
  admin_url text;
  received text;
  origin_label text;
  plain_body text;
  html_body text;
begin
  select * into strict e from public.halenn_website_enquiries where id = enquiry;
  select * into strict c from private.halenn_enquiry_notification_config where singleton;
  admin_url := 'https://halenn.com/admin/leads?lead=' || e.lead_id::text;
  received := to_char(e.received_at at time zone 'Europe/Amsterdam', 'DD Mon YYYY, HH24:MI') || ' (Amsterdam)';
  origin_label := case e.origin when 'quiz' then 'Website quiz' when 'pricing' then 'Pricing page' else 'Homepage' end;
  plain_body := 'HALENN' || E'\n\nNew website enquiry\n\n'
    || 'Name: ' || e.name || E'\nEmail: ' || e.email
    || case when trim(e.company) <> '' then E'\nBusiness: ' || e.company else '' end
    || E'\nSource: ' || origin_label || E'\nReceived: ' || received
    || E'\n\nMessage\n' || e.message
    || E'\n\nView this lead: ' || admin_url
    || E'\n\nReply to this email to respond directly to the sender.';
  html_body := '<!doctype html><html lang="en"><head><meta charset="utf-8"></head>'
    || '<body style="margin:0;padding:32px 16px;background:#f4f1eb;color:#292820;font-family:Arial,Helvetica,sans-serif">'
    || '<div style="max-width:600px;margin:0 auto;padding:36px;background:#fffefa;border:1px solid #dedbd2">'
    || '<p style="margin:0 0 32px;font-size:15px;letter-spacing:5px">HALENN</p>'
    || '<h1 style="margin:0 0 24px;font-family:Georgia,serif;font-size:30px;font-weight:400">New website enquiry</h1>'
    || '<p style="margin:0 0 8px"><strong>Name</strong><br>' || private.halenn_notification_escape(e.name) || '</p>'
    || '<p style="margin:0 0 8px"><strong>Email</strong><br>' || private.halenn_notification_escape(e.email) || '</p>'
    || case when trim(e.company) <> '' then '<p style="margin:0 0 8px"><strong>Business</strong><br>'
      || private.halenn_notification_escape(e.company) || '</p>' else '' end
    || '<p style="margin:0 0 24px;color:#68665e;font-size:13px">' || origin_label || ' &middot; ' || received || '</p>'
    || '<div style="border-top:1px solid #dedbd2;padding-top:24px">'
    || '<h2 style="margin:0 0 12px;font-size:14px;font-weight:600">Message</h2>'
    || '<div style="white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.65">'
    || private.halenn_notification_escape(e.message) || '</div></div>'
    || '<p style="margin:28px 0"><a href="' || admin_url
    || '" style="display:inline-block;padding:14px 20px;background:#292820;color:#fffefa;text-decoration:none">View this lead</a></p>'
    || '<p style="margin:0;color:#68665e;font-size:13px;line-height:1.6">Reply to this email to respond directly to the sender.</p>'
    || '</div></body></html>';
  return jsonb_build_object(
    'from', c.sender, 'to', jsonb_build_array(c.recipient), 'reply_to', e.email,
    'subject', 'New Halenn enquiry — ' || left(regexp_replace(
      coalesce(nullif(trim(e.company), ''), e.name), '[[:cntrl:]]', ' ', 'g'), 100),
    'text', plain_body, 'html', html_body
  );
end;
$$;

create function private.halenn_dispatch_enquiry_notification(enquiry uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  n private.halenn_enquiry_notifications;
  c private.halenn_enquiry_notification_config;
  sending_key text;
  queued_id bigint;
  dispatch_time timestamptz := clock_timestamp();
begin
  select * into n from private.halenn_enquiry_notifications where enquiry_id = enquiry for update;
  if not found or n.status <> 'pending' or n.next_attempt_at > dispatch_time then return; end if;
  -- Leave a full hour before Resend's 24-hour idempotency expiry. Never retry an
  -- unconfirmed request outside this window, even after an extended outage.
  if n.attempts >= 20 or n.first_attempt_at <= dispatch_time - interval '23 hours' then
    update private.halenn_enquiry_notifications set status = 'attention',
      last_error = 'retry_window_exhausted' where enquiry_id = enquiry;
    return;
  end if;
  select * into c from private.halenn_enquiry_notification_config where singleton;
  if not found or not c.enabled then
    update private.halenn_enquiry_notifications set last_error = 'notifications_disabled',
      next_attempt_at = dispatch_time + interval '5 minutes' where enquiry_id = enquiry;
    return;
  end if;
  select decrypted_secret into sending_key from vault.decrypted_secrets
    where name = 'halenn_resend_api_key' limit 1;
  if nullif(trim(sending_key), '') is null then
    update private.halenn_enquiry_notifications set last_error = 'sending_key_missing',
      next_attempt_at = dispatch_time + interval '5 minutes' where enquiry_id = enquiry;
    return;
  end if;
  n.payload := coalesce(n.payload, private.halenn_notification_payload(enquiry));
  n.attempts := n.attempts + 1;
  update private.halenn_enquiry_notifications set payload = n.payload, attempts = n.attempts,
    first_attempt_at = coalesce(first_attempt_at, dispatch_time), last_attempt_at = dispatch_time
    where enquiry_id = enquiry;
  begin
    -- pg_net sends only after this transaction commits. The recipient, endpoint,
    -- sender, and idempotency namespace are never taken from visitor input.
    select net.http_post(
      url := 'https://api.resend.com/emails',
      body := n.payload,
      headers := jsonb_build_object('Content-Type', 'application/json',
        'Authorization', 'Bearer ' || sending_key,
        'Idempotency-Key', 'halenn-enquiry/' || enquiry::text),
      timeout_milliseconds := 10000
    ) into queued_id;
    if queued_id is null then raise exception 'Notification request was not queued'; end if;
    update private.halenn_enquiry_notifications set status = 'queued', request_id = queued_id,
      last_error = null, next_attempt_at = dispatch_time + interval '2 minutes' where enquiry_id = enquiry;
  exception when others then
    -- A provider/queue problem must never reject an otherwise saved enquiry.
    update private.halenn_enquiry_notifications set status = 'pending', request_id = null,
      last_error = 'queue_error', next_attempt_at = dispatch_time + private.halenn_notification_backoff(n.attempts)
      where enquiry_id = enquiry;
  end;
end;
$$;

create function private.halenn_process_enquiry_notifications() returns void
language plpgsql security definer set search_path = '' as $$
declare
  n private.halenn_enquiry_notifications;
  response record;
  body jsonb;
  error_code text;
  retryable boolean;
  tick timestamptz := clock_timestamp();
begin
  if not pg_try_advisory_xact_lock(73904103) then return; end if;
  -- Reconcile first, including late successes. Response rows are transient;
  -- permanent accepted state lives in our own logged table.
  for n in select * from private.halenn_enquiry_notifications
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
    if response.status_code between 200 and 299
      and jsonb_typeof(body->'id') = 'string'
      and (body->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      update private.halenn_enquiry_notifications set status = 'accepted', accepted_at = tick,
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
    update private.halenn_enquiry_notifications set
      status = case when retryable then 'pending' else 'attention' end,
      request_id = null, last_error = error_code,
      next_attempt_at = tick + private.halenn_notification_backoff(n.attempts)
      where enquiry_id = n.enquiry_id;
  end loop;
  for n in select * from private.halenn_enquiry_notifications
    where status = 'pending' and next_attempt_at <= tick
    order by next_attempt_at, created_at limit 10 for update skip locked
  loop
    begin
      perform private.halenn_dispatch_enquiry_notification(n.enquiry_id);
    exception when others then
      -- Keep one unexpected notification failure from blocking the rest. Do not
      -- retain SQLERRM: platform errors can contain credentials or message data.
      update private.halenn_enquiry_notifications set status = 'attention',
        last_error = 'dispatch_error' where enquiry_id = n.enquiry_id;
    end;
  end loop;
end;
$$;

create function private.halenn_queue_enquiry_notification() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into private.halenn_enquiry_notifications(enquiry_id) values (new.id) on conflict do nothing;
  begin
    perform private.halenn_dispatch_enquiry_notification(new.id);
  exception when others then
    update private.halenn_enquiry_notifications set status = 'attention',
      last_error = 'dispatch_error' where enquiry_id = new.id;
  end;
  return new;
end;
$$;

-- No backfill: existing enquiries must not produce unexpected historical mail.
create trigger halenn_enquiry_notification after insert on public.halenn_website_enquiries
  for each row execute function private.halenn_queue_enquiry_notification();

create function public.halenn_enquiry_notification_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  c private.halenn_enquiry_notification_config;
  key_exists boolean;
  result jsonb;
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
    'attention', count(*) filter (where status = 'attention'),
    'lastAcceptedAt', max(accepted_at)
  ) into result from private.halenn_enquiry_notifications;
  return result;
end;
$$;

revoke all on function private.halenn_notification_escape(text),
  private.halenn_notification_backoff(integer), private.halenn_notification_payload(uuid),
  private.halenn_dispatch_enquiry_notification(uuid), private.halenn_process_enquiry_notifications(),
  private.halenn_queue_enquiry_notification(), public.halenn_enquiry_notification_status()
  from public, anon, authenticated;
grant execute on function public.halenn_enquiry_notification_status() to authenticated;
notify pgrst, 'reload schema';
commit;
