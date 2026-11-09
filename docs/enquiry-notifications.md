# Website enquiry emails

Website enquiries are saved in the private Leads workspace before any email is sent. Email delivery is a separate, recoverable notification. The homepage, quiz and pricing forms all use the same path, including enquiries submitted without analytics consent.

## Current setup

- Current approved recipient: `aevellgroup@gmail.com`.
- Future approved recipient: `contact@halenn.com`, once that mailbox is working.
- Sender: `Halenn <enquiries@notifications.halenn.com>`.
- Provider: Resend, with a verified sending subdomain and a sending-only API key restricted to that domain.
- Sending defaults to **disabled**. Enable it only after the sending domain, restricted key and selected receiving inbox have been tested; a new Halenn mailbox is not required to use the approved Gmail inbox.
- Existing enquiries are not backfilled when the integration is installed.
- **Account → Enquiry emails** shows enabled/paused/setup status, queued requests, provider acceptances and requests needing review. Accepted does not mean delivered to the inbox.

## Installation

Apply after the founder, sales analytics and website enquiry migrations. Use the project's database owner through the Supabase dashboard. No new Vercel environment variables or service-role credentials are needed.

1. Confirm Supabase Vault is enabled and `vault.decrypted_secrets` exists. Confirm `pg_net` is available and its `net.http_post` supports `url`, `body`, `headers` and `timeout_milliseconds`; its `net._http_response` must expose `id`, `status_code`, `content`, `timed_out` and `error_msg`.
2. Apply `202611090005_enquiry_notifications.sql`. This creates private, RLS-protected configuration and outbox tables, restricted functions and the insert trigger. Leave the configuration disabled.
3. Apply `202611090006_notification_schedule.sql`. Confirm `cron.job` contains the active `halenn-enquiry-notifications` job scheduled for `*/5 * * * *`, and check its run results. The existing analytics retention job stays in place.
4. Verify `notifications.halenn.com` in Resend using the exact DNS records displayed by Resend. Keep receiving and email open/click tracking off for this sending subdomain. Preserve the website's existing records and the root domain's future mailbox records.
5. Create a Resend key with **Sending access**, restricted to `notifications.halenn.com`. Save it directly through Supabase Vault's secret form as `halenn_resend_api_key`. Never paste the key into the SQL editor, source control, screenshots, logs or chat.
6. Deploy the account status panel and privacy notice. The panel handles a missing migration by showing that the status is unavailable.

Useful non-secret checks:

```sql
select extname, extversion from pg_extension
where extname in ('pg_net', 'pg_cron', 'supabase_vault');

select jobname, schedule, active from cron.job
where jobname in ('halenn-enquiry-notifications', 'halenn-website-analytics-retention');

select status, last_error, count(*)
from private.halenn_enquiry_notifications
group by status, last_error;
```

## Activating enquiry emails

1. Verify that the selected recipient can receive normal email, and that Resend shows the sending domain as verified. Start with `aevellgroup@gmail.com`; use `contact@halenn.com` only after its mailbox is ready.
2. Review any queued enquiries accumulated while sending was disabled. Activating processes those entries as well as new submissions. Do not send a historical backlog without deciding which notifications are still useful.
3. Enable sending and run one recovery pass:

```sql
update private.halenn_enquiry_notification_config
set enabled = true where singleton;
select private.halenn_process_enquiry_notifications();
```

4. Send one clearly labelled test enquiry through the website. Confirm one lead and one outbox row, Resend's delivery result, the message in the receiving mailbox, the lead link and Reply-To behaviour. Retrying the same submission must not send another notification.
5. Confirm the scheduled recovery pass runs successfully. Routine provider acceptance appears in the account panel after the next pass, normally within five minutes.

To pause sending, set `enabled = false`. Already queued HTTP requests can still finish; new dispatches wait. The website continues saving enquiries in Leads.

## Changing the receiving inbox

In **Account → Enquiry emails**, a signed-in founder who has completed the initial password change can select either approved address. The default is `aevellgroup@gmail.com`; switch to `contact@halenn.com` after confirming that the mailbox receives email. Other addresses are rejected by both the recipient-setting function and the database constraint.

`public.halenn_set_enquiry_notification_recipient(recipient text)` accepts one approved address, normalizes surrounding spaces and letter case, and returns the saved address. It changes only the recipient setting. It does not enable sending, change the sender or key, or resend accepted notifications.

The selected inbox applies when a notification is first dispatched. Enquiries waiting without a frozen payload use the new selection. A notification already attempted keeps its original inbox and complete frozen payload for every retry, even after the selection changes. This preserves the provider's duplicate-send protection; changing the recipient does not reroute or resend those notifications.

## Reliability and review

Each new enquiry creates one durable outbox record keyed by its enquiry UUID. The insert trigger queues an immediate asynchronous request; `pg_net` sends it after the transaction commits. The five-minute job reconciles provider responses and retries temporary failures in small batches. The private outbox remains the source of truth even if the transient `pg_net` queue or responses disappear.

The first actual dispatch freezes the recipient, sender, Reply-To, subject and message body. Every retry uses that same payload and the same `halenn-enquiry/<UUID>` idempotency key. Automatic retries stop after 20 attempts or 23 hours from the first attempt, before Resend's 24-hour idempotency window expires. A confirmed provider acceptance is permanent. Raw provider errors and credentials are never copied into status fields.

`Needs review` covers provider configuration/validation problems, idempotency conflicts, exhausted retry windows and unexpected local dispatch failures. Check the matching request in Resend before any manual retry, especially after a timeout or expired window. Never reset accepted records or blanket-reset all attention records: an ambiguous request may already have been sent. Fix the cause and recover individual records only after checking their delivery history.

Secrets and outbox contents are not exposed to browser clients. The status RPC returns aggregate counts and non-secret configuration only. Both the status and recipient-setting RPCs require an authenticated founder who has completed the initial password change. Database administrators can inspect `pg_net`'s temporary request queue, including queued authorization headers, so the Resend key must remain sending-only and restricted to the one domain.

## Verification

`scripts/verify-enquiry-notifications.mjs` runs isolated PostgreSQL checks using PGlite and local stubs for Vault, `pg_net` and scheduling. These exercise database permissions, transactional enquiry preservation, duplicate submissions, frozen/escaped payloads, retry cutoffs, late success, approved recipient switching and job scheduling. They do not prove live extension compatibility or actual email delivery; those require the installation checks above.

Run with `HALENN_PGLITE_MODULE` pointing to an installed PGlite module, followed by the normal typecheck, lint and production build. No production email is sent by these tests.
