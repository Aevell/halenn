# Optional 30-minute project calls

## Combined confirmation upgrade — live

`202611120001_combined_call_confirmations.sql` adds an optional booking page on Halenn backed by the same Aevell calendar. A newly confirmed appointment sends one white, branded Halenn email containing the date, Amsterdam time, duration, language/host arrangement, Meet link, enquiry excerpt and next steps. It also includes a calendar download and a private cancellation link. Google events have **no customer attendees**, avoiding a separate Google invitation. The host must admit the customer to Meet. Calendar downloads are static entries: subsequent changes are communicated by email and may require updating the downloaded calendar entry.

The enquiry remains submitted whether or not a call is booked. An unattempted enquiry acknowledgement is suppressed after booking; a pending calendar write holds it until the result is known. Customers who do not book retain the existing acknowledgement policy. An email already sent cannot be recalled: a customer booking after their enquiry acknowledgement was dispatched receives the later appointment confirmation too. Confirmed changes and cancellations have their own necessary updates, deduplicated by provider revision.

The upgrade is live on `halenn.com`. The owner approved the expanded Calendar permission and signed web endpoint, completed Google authorization, and both online-booking flags are enabled. The migration passed preservation assertions for existing enquiries, activities, bookings, email configuration and frozen outboxes. No existing enquiries or frozen emails were backfilled, rewritten or resent.

The production test verified a real enquiry, a Dutch call with a Meet link, one combined confirmation delivered to the test inbox, and one linked booked-call milestone. The separate enquiry acknowledgement was skipped with zero send attempts. The test appointment was then cancelled through Halenn; the excluded audit trail and original conversion were retained. The analytics drill-down showed the test when explicitly included and excluded it under the normal filter. Automated checks passed: 126 tests, TypeScript, targeted lint and a production build, with desktop and mobile visual review.

The old standalone Google appointment schedule was deleted with owner approval. Google confirmed that existing appointments are preserved. Do not distribute its old `calendar.app.google` link; all new invitations must use the private Halenn booking route.

### Approval and rollout

1. Complete local tests and review the booking page and email previews. Capture counts/digests of existing enquiries, activities and both existing outboxes before applying the new migration. Its expected configuration change is the additional `call_worker_error=false` field; its worker/status wrappers are intentional.
2. Obtain action-time approval to add the Google `calendar.events.owned` permission and deploy the signed Apps Script web endpoint as Aevell, accessible to anyone. This expands the previous read-only grant. The code restricts writes to the Aevell calendar and deterministic Halenn-tagged events; Google grants broader access to owned calendars. Do not imply the OAuth scope itself is confined to Halenn events.
3. Apply the migration, deploy the Next.js routes and add `OnlineBooking.gs` alongside the revised `Code.gs` and manifest. Reuse the existing secret; never display or copy it into code. Leave `online_booking_enabled=false` and `HALENN_ONLINE_BOOKING_ENABLED=false` during setup.
4. After the owner authorizes Google, deploy the web app to execute as that owner, with access set to Anyone. Store its exact `/macros/s/<deployment-id>/exec` URL in `private.halenn_project_call_config.online_booking_endpoint`. Requests and responses use separate HMAC prefixes and a five-minute freshness window. An unauthenticated request cannot read availability or create an event. Website clients receive neither the signing secret nor the signed request envelope.
5. Set the Apps Script property `HALENN_ONLINE_BOOKING_ENABLED=true`, then set the database `online_booking_enabled=true`. Keep the original sync enabled for historical Google bookings, recovery callbacks and the acknowledgement-worker heartbeat. The existing trigger runs both modules.
6. Test a deliberately classified internal enquiry through the actual Halenn page: create one call, verify one customer confirmation, its enquiry excerpt and Meet link, and one linked analytics conversion. Retry the same operation and verify no duplicate. Verify cancellation and the non-booking acknowledgement path. Record provider acceptance separately from actual inbox delivery. Cancel the test appointment and preserve the excluded test audit trail.
7. Retire the old Google appointment schedule without deleting existing appointments, and verify old native-booking links cannot create new appointments. Deleting the schedule requires explicit owner approval. Preserve historical sync and existing appointment records.

To suspend booking, set `enabled=false` while keeping `online_booking_enabled=true` and Apps Script recovery enabled. This removes new booking offers; existing confirmed appointment details remain visible, but self-service booking and cancellation are temporarily unavailable. Founders must manage necessary changes in Google Calendar until service is restored. Enquiries and email follow-up continue. Do not simply set `online_booking_enabled=false`: that restores a redirect to the retired native Google page. Suspension does not cancel appointments or stop delivery/recovery of already-created confirmations. Never reset outboxes or delete sales history as a rollback.

Availability uses 30-minute calls on a 40-minute grid, daily 09:00–23:00 Amsterdam time (last start 22:20), 12 hours' notice, 10-minute buffers and three calls per day. Free/busy and capacity are rechecked under a script lock before creation. A timeout retains the deterministic event/request ID so retrying cannot create another appointment. The one shared calendar must contain the attending founder's unavailable times; this is not automatic round-robin scheduling across two personal calendars.

Founder notification settings include separate call-email pending, provider-accepted and attention counts. Unknown booking results older than 15 minutes need review. The outbox preserves retry payloads and provider idempotency keys, and caps first sends at six per recipient and twenty total daily; quota exhaustion is surfaced for review. A confirmed calendar event is not evidence of email delivery or attendance.

### Verification

```sh
node --test scripts/verify-project-call-routes.mjs scripts/google-project-calls/bridge.test.mjs scripts/google-project-calls/online-booking.test.mjs
HALENN_PGLITE_MODULE=/absolute/path/to/pglite/dist/index.js node scripts/verify-combined-call-bookings.mjs
```

These tests exercise real migration functions and HMAC validation with isolated transport doubles. They do not themselves prove production Google authorization, Meet creation or inbox delivery; those were checked separately during the live rollout described above.

## Original read-only setup — historical reference

The native Google booking page has been retired. The following sections describe the original integration and its retained historical-event sync, not the current customer booking route. Both sync triggers remain installed, and the matching signing secret remains in Script Properties and Supabase Vault. Database configuration and `HALENN_BOOKING_SYNC_ENABLED` are separate activation controls; deploying these files alone does not enable either. For the current route, permissions and suspension procedure, use the live upgrade section above.

An enquiry is saved before offering a call. The receipt and newly rendered customer confirmation can include an optional “Book a project call” link; visitors can continue by email. Only a signed, verified Calendar booking creates a booked-call milestone. Opening a link is not a booking, and a booking is not evidence that a meeting took place.

The appointment schedule belongs to `aevellgroup@gmail.com`. The approved schedule is 30 minutes, daily 09:00–23:00 Europe/Amsterdam, a 10-minute buffer, 12 hours’ notice and at most three appointments per day. A Dutch call is with Dave; an English call can be with Dave or Terence. These availability settings and host arrangements are managed in Google Calendar. Recording a preferred language does not assign a host or check a second founder’s calendar.

## Database contract

Apply `202611110003_project_call_bookings.sql`, then `202611110004_project_call_reporting.sql`. The first migration defaults to disabled and never enables or changes existing email configuration, workers, outboxes or frozen retry payloads. It replaces only the customer confirmation renderer, adding an optional navy call button and a plain-text URL when configured. The internal notification renderer is unchanged. The customer renderer’s `supported-color-schemes` declaration is corrected to light.

The private tables are not exposed to browser roles. They store the approved calendar/configuration, random invitation tokens, minimal booking details and one first-call conversion per lead. There is no service-role key in the website or bridge.

| RPC | Access and result |
| --- | --- |
| `halenn_submit_website_enquiry_with_booking(payload jsonb)` | Existing public intake checks and limits, returning `{result, bookingUrl}`. The optional URL is `/project-call/<random UUID>` or null. Failure to create the optional invitation never discards a saved enquiry. |
| `halenn_project_call_destination(token uuid)` | Public, returns only the approved Google booking URL for a valid token and enabled configuration. Returns null otherwise. No contact information is returned. |
| `halenn_receive_project_call_events(raw_body text, signature text, sent_at text)` | Public but requires a valid shared-secret HMAC and recent timestamp. Returns `{accepted:true, changed, ignored, activities}` after committing a valid batch. |
| `halenn_project_call_status()` | Verified founder with completed password setup only. Returns `enabled`, `configured`, `lastSyncAt`, newest 100 `unmatched` records, and next five future confirmed linked `upcoming` records. Dates are JSON strings, guest identity and preferred language may be null. |
| `halenn_link_project_call(booking_id uuid, lead_id uuid)` | Same founder/password checks. Returns `{linked:true, alreadyLinked}`. Same-lead retries are idempotent; reassignment to another lead is rejected. Linking a cancelled booking does not create an activity. |

Status lists contain `id`, `attendeeName`, `attendeeEmail`, `startsAt`, `endsAt`, `status`, `bookedAt` and nullable `preferredLanguage` (`nl` or `en`). Upcoming rows also contain `leadId`.

## Signed bridge messages

See [Google bridge setup](../scripts/google-project-calls/README.md) for the Apps Script implementation and provider filtering. The bridge must send only the approved project-call schedule’s events, with the approved calendar as organizer. The database validates the fixed calendar ID, trusted sender signature and exact 30-minute duration. No event descriptions, notes, conferencing links, unrelated event data or full guest lists are stored.

The signature is the hexadecimal HMAC-SHA256 of `sent_at + "." + raw_body`, using the identical UTF-8 bytes sent to the endpoint. `sent_at` is Unix seconds as text and must be within five minutes of database time. The database authenticates a bounded body (100,000 bytes maximum) before parsing JSON. The bridge uses a smaller 80 KB batch budget; a batch may contain at most 50 events. The endpoint must pass the original body unchanged.

```json
{
  "version": 1,
  "calendarId": "aevellgroup@gmail.com",
  "events": [{
    "id": "provider_event_id",
    "status": "confirmed",
    "updated": "2026-11-11T12:01:00Z",
    "created": "2026-11-11T12:00:00Z",
    "start": "2026-11-12T13:00:00Z",
    "end": "2026-11-12T13:30:00Z",
    "attendeeEmail": "guest@example.test",
    "attendeeName": "Guest",
    "preferredLanguage": "en"
  }]
}
```

For confirmed events, `updated`, `created`, `start` and `end` are required RFC3339 timestamps. When the provider cannot identify exactly one external guest, email/name may be null or absent. These bookings remain unmatched. The optional language must be `nl`, `en` or null. Event IDs are bounded to 1,024 characters. Unexpected fields, wrong calendar/version, invalid timestamps or invalid durations reject the entire batch atomically.

A cancelled tombstone may contain only `id` and `status: "cancelled"`. An unknown cancelled ID is ignored. For a known booking, a missing provider update time remains null; the signed delivery timestamp is used separately as its ordering version. Stale updates cannot resurrect a cancellation. Duplicate batches and reschedules do not add activities. A valid signed empty batch updates the sync heartbeat.

RPC errors are intentionally generic:

- `28000`: invalid signature, malformed authentication, oversized body or timestamp outside the five-minute window.
- `22023`: authenticated but malformed payload. No partial writes.
- `55000`: disabled or unconfigured connection. Retry after configuration is restored.
- Other database errors remain failures for retry; never acknowledge an unexpected failed write as a successful sync.

## Matching and analytics meaning

Email matching uses only trimmed, lowercase equality. It does not strip Gmail dots, remove aliases, use a name, pick the newest lead or guess from several guests. An automatic match requires exactly one existing website enquiry with that email received no later than five minutes after the provider’s booking-created time. Multiple enquiries, no matching enquiry and missing identity remain visible for founder review. A changed guest identity clears the booking’s association for review instead of silently transferring it to another lead.

A matched confirmed booking adds at most one automatic `meeting_booked` activity for the lead. Its time is the actual provider-created time, capped at database now; it is not the future appointment time. An existing non-voided manually recorded booked-call milestone is reused. Rescheduling, cancellation and new event IDs preserve the original conversion history. They never mark a meeting held, update the lead’s sales stage or create another first-call conversion.

The source report reads the existing lead and activity records, so consented acquisition source and internal/test exclusions keep their existing meaning. Operational booking sync creates no website-visitor events and does not manufacture attribution when analytics consent was declined. Calls from an unrecognized email can be linked to a lead manually, without claiming a website enquiry match.

## Publication and activation

Apply the database and website changes before enabling the connection, then verify an explicitly classified test enquiry and booking.

1. Capture the read-only preservation checks below before applying the migration. Apply both SQL migrations and deploy the matching APIs/UI while the booking configuration stays disabled. Existing enquiry and email behaviour continues.
2. Create the approved 30-minute Google appointment schedule with the agreed availability. Store its exact public URL in `private.halenn_project_call_config.booking_url`. Only `https://calendar.google.com/calendar/appointments/schedules/<id>` and `https://calendar.app.google/<id>` (optionally `?gv=true`) are accepted. Do not use arbitrary redirects.
3. Generate a dedicated random signing secret (at least 32 characters). Store it securely under the Vault name `halenn_google_booking_secret` and the matching Apps Script property described in the bridge guide. Do not paste it into source, logs, URLs, screenshots or enquiry payloads. The configuration RPCs never return it.
4. Configure the bridge and endpoint, then set `enabled=true`. Run the bridge once, inspect its safe result and verify `lastSyncAt` through the founder status RPC. An empty first sync is a valid heartbeat. If synchronization is not working, disable the connection until it is resolved.
5. Verify one deliberate internal/test enquiry and one real test calendar booking, checking its receipt, optional customer CTA, correct language, booked milestone and cancellation handling. Use explicit test classification so this verification cannot distort sales reports. Remove/cancel test appointments and retain an accurate test audit trail; do not invent a held meeting.
6. Compare email preservation checks and confirm existing outboxes/configuration were untouched by deployment. New customer payloads get the invitation only when freshly rendered. Previously frozen retry bodies remain exactly as originally sent; existing enquiries are not backfilled or resent.

To enable only after the URL and secret are securely configured:

```sql
update private.halenn_project_call_config set enabled = true where singleton;
select enabled, booking_url is not null as has_booking_url,
  private.halenn_project_call_configured() as configured, last_sync_at
from private.halenn_project_call_config where singleton;
```

To suspend scheduling safely:

```sql
update private.halenn_project_call_config set enabled = false where singleton;
```

This hides new booking offers. With the live online-booking upgrade, keep `online_booking_enabled=true`; confirmed details remain visible but booking/cancellation actions are unavailable until re-enabled. Enquiries and ordinary email follow-up continue. Booking history, existing appointments and frozen emails remain intact. Keep recovery running while pending results or existing appointments need synchronization. Do not roll back by deleting enquiry/activity history or resetting either email outbox.

The following checks expose counts/digests only, not messages or secret values. Compare across migration application, accounting for genuine live enquiries or worker progress during the window. The migration itself performs no outbox writes or sends.

```sql
select
  (select count(*) from public.halenn_website_enquiries) as enquiry_count,
  (select count(*) from public.halenn_activity) as activity_count,
  (select md5(coalesce(jsonb_agg(to_jsonb(c) order by c.enquiry_id)::text, '[]'))
    from private.halenn_customer_confirmations c) as customer_outbox_digest,
  (select md5(coalesce(jsonb_agg(to_jsonb(n) order by n.enquiry_id)::text, '[]'))
    from private.halenn_enquiry_notifications n) as internal_outbox_digest,
  (select md5(to_jsonb(c)::text) from private.halenn_enquiry_notification_config c where singleton) as email_config_digest,
  md5(pg_get_functiondef('private.halenn_notification_payload(uuid)'::regprocedure)) as internal_renderer_digest,
  md5(pg_get_functiondef('private.halenn_process_enquiry_notifications()'::regprocedure)) as email_worker_digest;
```

## Local verification

```sh
HALENN_PGLITE_MODULE=/absolute/path/to/pglite/dist/index.js node scripts/verify-project-call-bookings.mjs
```

The suite loads the real migrations and real pgcrypto HMAC implementation into isolated PGlite. Vault and pg_net are local test doubles, and no network calls occur. Coverage includes forged signatures, body and timestamp bounds, malformed atomic batches, original intake limits, optional-link failure, matching ambiguity/null identity, stale/cancel/reschedule behaviour, manual matching permissions, source/test/declined-consent reporting, upcoming-list limits and unchanged frozen email retries. Set `HALENN_PROJECT_CALL_EMAIL_PREVIEW` to a local HTML path to render a synthetic customer confirmation for visual review; this does not send email.
