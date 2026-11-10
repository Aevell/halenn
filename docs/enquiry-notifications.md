# Website enquiry emails

Website enquiries are saved in the private Leads workspace before any email is sent. Email delivery is a separate, recoverable notification. The homepage, quiz and pricing forms all use the same path, including enquiries submitted without analytics consent. Founder alerts and customer confirmations have independent delivery records; a problem sending either does not discard the enquiry.

## Current setup

- Current approved recipient: `aevellgroup@gmail.com`.
- Future approved recipient: `contact@halenn.com`, once that mailbox is working.
- Sender: `Halenn <enquiries@notifications.halenn.com>`.
- Provider: Resend, with a verified sending subdomain and a sending-only API key restricted to that domain.
- Sending defaults to **disabled**. Enable it only after the sending domain, restricted key and selected receiving inbox have been tested; a new Halenn mailbox is not required to use the approved Gmail inbox.
- Existing enquiries are not backfilled when the integration is installed.
- **Account → Enquiry emails** shows separate founder-alert and customer-confirmation counts, including queued requests, provider acceptances, requests needing review and intentionally skipped confirmations. Accepted does not mean delivered to the inbox.

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


## Customer confirmations

`202611100001_customer_confirmations.sql` adds a separate private `halenn_customer_confirmations` outbox and `customer_confirmations_enabled` rollout flag, initially false. It preserves the existing founder configuration, accepted records, frozen payloads, verified sender, restricted Vault key and five-minute cron job. Apply it once after migrations 005 and 006. There is no historical backfill. Enquiries submitted while confirmations are paused are recorded as skipped and are never sent later merely because sending is enabled.

The customer receives a concise branded acknowledgement from `Halenn <enquiries@notifications.halenn.com>`, with subject **We’ve received your enquiry | Halenn**. It confirms receipt, explains that Halenn will review the enquiry and get in touch about next steps, and invites replies. It makes no response-time promise. The body contains only fixed copy, a timestamp and the enquiry UUID; visitor-supplied names, business names, messages, links and admin links are deliberately omitted because the submitted address has not been verified. Both HTML and plain text are included, with automatic-response suppression headers.

Delivery uses one normalized address saved with the enquiry. A strict single-address check rejects malformed mailbox syntax for customer sending without discarding the enquiry or its founder alert. The customer email's Reply-To is the approved founder inbox selected in Account (`aevellgroup@gmail.com` now); it is frozen with the whole payload at the first dispatch. Switching the founder inbox later affects new first sends, not retries already in progress. The customer idempotency namespace is `halenn-customer-confirmation/<enquiry UUID>` and is separate from founder alerts.

### Sending limits and recovery

Customer first-send attempts are reserved under a database transaction advisory lock, including requests waiting for a response or failing to enter the network queue. Limits are **one per recipient per rolling hour**, **three per recipient per rolling 24 hours**, and **40 customer confirmations across all recipients per rolling 24 hours**. The shared cap leaves some of the free Resend plan's daily capacity for founder alerts; it does not guarantee founder delivery if total account usage exceeds the provider allowance. Limits apply even when the public database intake is called directly. The throttle key strips plus suffixes and treats Gmail/Googlemail dot aliases as the same mailbox; the actual delivery address is unchanged. Other providers' less common alias schemes are not resolved.

Extra enquiries remain saved and continue generating founder alerts, while their customer confirmation is marked `skipped` with a fixed reason (`recipient_limit`, `daily_limit`, `invalid_recipient` or `confirmations_disabled`). First sends delayed more than 24 hours are also skipped (`confirmation_expired`). These are not retroactively sent. Automatic retries use the same reserved slot and frozen payload, stopping at 20 attempts or 23 hours after the first attempt. Late provider acceptance is reconciled before retry limits, so a previously accepted email is never resent.

The existing cron entry point now calls the preserved founder worker and customer worker in separate exception blocks. Non-secret worker-health flags contribute to the respective Needs review count and clear after a healthy worker pass. A customer dispatch exception retains an attention row. A failure to create the customer queue row sets a separate sticky `customer_queue_error` flag; it remains visible after healthy passes and needs operator investigation. Only clear that flag after identifying the affected enquiry and deciding whether a confirmation is still appropriate. Never blanket-requeue accepted, skipped or old records, and never expose Vault values or raw provider response contents.

### Activation and live check

After deploying the status panel, applying the migration, reviewing the customer copy and checking the verified domain and existing key, activate only the new flag:

```sql
update private.halenn_enquiry_notification_config
set customer_confirmations_enabled = true
where singleton and enabled
returning enabled, customer_confirmations_enabled, recipient;
```

Submit one clearly labelled test using a working inbox you control. Confirm one saved enquiry, one founder alert and one customer confirmation with their distinct subjects, Resend delivery and actual inbox receipt. Check that Reply-To is the selected founder inbox and that the customer email contains no private admin link. Reconcile with `select private.halenn_process_enquiry_notifications();` or wait for the five-minute job, then confirm both accepted counts in Account. A browser retry with the same enquiry ID must not create another email.

To pause only customer confirmations, set `customer_confirmations_enabled = false`. Setting the existing `enabled = false` pauses both paths. Already queued HTTP requests may finish. The website keeps saving enquiries, and disabled customer confirmations are not sent as a backlog after resuming.

The founder-only status RPC retains its original fields and adds:

```text
customer: { enabled, pending, accepted, attention, skipped, lastAcceptedAt }
```

`customer.enabled` reports the customer flag combined with the main sending switch; the panel also checks the existing configured status. No recipient list, enquiry contents or secret is exposed by this RPC.

### Customer verification

`scripts/verify-customer-confirmations.mjs` applies the real migrations to an isolated PGlite database with local Vault, pg_net and cron stubs. It checks preservation of the previous setup, all three enquiry origins, deduplication, strict recipients, alias and global rate limits, independent failures, durable warnings, frozen replies, bounded retries, permissions and no historical or paused backfill. It does not make network calls. Set `HALENN_PGLITE_MODULE` as for the existing notification suite. Optionally set `HALENN_CONFIRMATION_PREVIEW` to a local HTML output path to export a synthetic customer email for visual review. The existing founder notification suite remains unchanged and should also pass.

### Website-aligned customer email design

`202611100002_branded_customer_confirmation.sql` replaces only the customer payload function's HTML template. It uses Halenn's dark website palette, wordmark and oval mark, thin rules, generous spacing, and a Manrope heading with Geist body text. The envelope, subject, Reply-To, automatic-response headers, plain text, receipt wording and delivery behaviour are unchanged. Previously frozen payloads are never updated: accepted mail stays accepted and in-flight retries keep their original body and idempotency key. New first sends use the revised design.

Deploy the public assets before applying this migration:

- `https://halenn.com/brand/email/halenn-wordmark-v1.png` — rendered at 167 × 24 pixels.
- `https://halenn.com/brand/halenn-mark-v2-180.png` — decorative oval mark rendered at 48 × 48 pixels.
- `https://halenn.com/brand/email/Manrope-Light.ttf` and `https://halenn.com/brand/email/Geist-Regular.ttf`, with the corresponding font licences included in the deployed asset directory.

The email uses fluid presentation tables with a 600-pixel maximum width and mobile spacing/headline overrides. The message, heading, reference and next steps remain real selectable text. A blocked logo still has an accessible Halenn alternative. External font support varies across mail clients: compatible clients use the website fonts, while other clients fall back to Helvetica Neue, Helvetica or Arial. Outlook's Word renderer explicitly uses Arial and a 600-pixel conditional table. A browser preview verifies layout but cannot guarantee every inbox's font loading or dark-mode transformations.

The customer verification suite now applies the branding migration between an original first send and its retry, proving that frozen pending/accepted rows and non-HTML fields remain unchanged. It also checks table accessibility, versioned asset/font references, safe narrow-screen rules and an HTML size below 20 KB. Existing delivery and permission scenarios run against the upgraded template.

### Matching internal enquiry alerts

`202611100003_branded_enquiry_notification.sql` applies the same dark email design to the notification sent to Halenn's selected inbox. It replaces only `private.halenn_notification_payload(uuid)` and explicitly retains its private execution boundary. It uses the already-deployed wordmark, oval mark, Manrope/Geist font assets, responsive presentation tables and Outlook fallback from the customer receipt. The customer confirmation function is untouched.

Internal mail continues to include the visitor's name, email, optional business name, source, received time, complete message, lead link and reply helper. The silver **View this lead** button appears before the message so a long enquiry does not bury the main action. Visitor fields are escaped once and concatenated into the HTML; template-like strings such as `{{received}}` or `%s` remain literal. Message line endings become explicit HTML line breaks after escaping, while spaces and indentation are retained. Names and messages wrap at normal word boundaries where possible, with long-token wrapping and a legacy Outlook fallback.

The sender, recipient, Reply-To, subject and complete plain-text content remain unchanged. The migration performs no sends, backfill or outbox updates. Already frozen pending/accepted payloads keep their previous HTML; only a new first dispatch uses the new design. Apply this migration after the public email assets are confirmed available, and verify a future notification without resetting or resending an existing record.

The internal notification suite adds upgrade preservation, hostile/literal-marker/long-text handling and branded layout checks, then runs the existing delivery scenarios against the updated function. Set `HALENN_NOTIFICATION_PREVIEW=/private/tmp/halenn-enquiry-notification-preview.html` when running `scripts/verify-enquiry-notifications.mjs` to export a clearly synthetic nail-studio enquiry for visual review. This local preview makes no network or email-sending requests.
