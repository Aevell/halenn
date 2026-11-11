# Google Calendar project-call sync

Owner-run Apps Script for Halenn's optional project calls. The original sync reads the shared Gmail calendar and sends verified booking changes to `https://halenn.com/api/project-call-events`. The separately gated `OnlineBooking.gs` module adds signed availability, creation and cancellation requests and sends results to `/api/project-call-result`. It creates organizer-only events without customer attendees; Halenn's existing Resend connection sends the combined confirmation.

**The combined-confirmation upgrade is prepared but not activated.** It requires new owner approval for `calendar.events.owned` and a web-app deployment. Follow the [combined confirmation rollout](../../docs/project-call-bookings.md#combined-confirmation-upgrade--prepared-not-activated) before changing live permissions or enabling `HALENN_ONLINE_BOOKING_ENABLED`. The older setup instructions below describe the original read-only integration; they are not authorization for the new write grant. Add both `.gs` files when installing the updated manifest, and keep the new flag false until the new endpoint is configured and verified.

The implementation is **not activated by adding these files to the repository**. A calendar owner must install and authorize the script. Validate Google's actual booking-event format before enabling the production sync.

## Booking page settings

Use the personal Google Calendar account **aevellgroup@gmail.com** and its primary calendar. Native Google supports one free appointment schedule on a personal account. Automatic reminders, additional booking schedules and some availability features require a paid subscription; none is required by this bridge. [Google feature comparison](https://support.google.com/calendar/answer/16287038?hl=en)

Configure the schedule in Google Calendar:

| Setting | Value |
| --- | --- |
| Title | `Halenn · Project call` |
| Duration | 30 minutes |
| Time zone | Europe/Amsterdam |
| Availability | Every day, 09:00–23:00 |
| Buffer | 10 minutes |
| Minimum booking notice | 12 hours |
| Maximum bookings | 3 per day |
| Meeting location | Google Meet |
| Booking-form question | `Preferred language (Dutch or English)` |
| Guest invitations | Off; one booking guest per project call |

Include this exact natural sentence in the description:

> A 30-minute conversation about your business, what you’d like to achieve and how Halenn could help.

The sentence and title distinguish project calls from unrelated calendar entries. There is no customer-visible technical marker. Google may append the guest's name to the event title; the filter accepts a delimiter following the title. Standard HTML wrapping and curly/straight apostrophes in the description are normalized.

Dutch calls are handled by Dave; English calls can be handled by Dave or Terence. The shared calendar records the selected language. This script does not guess personal host email addresses or route invitations between people. It emits `preferredLanguage: "nl"` or `"en"` only when exactly one recognizable answer exists. Missing or unrecognized answers remain unset for admin review.

## Install without activating

1. Sign in to [Google Apps Script](https://script.google.com/) as **aevellgroup@gmail.com** and create a standalone project named **Halenn project-call sync**.
2. Replace `Code.gs` with this directory's `Code.gs`. In Project Settings, enable **Show appsscript.json manifest file in editor**, then replace that file with this directory's manifest.
3. Confirm the **Calendar API v3** advanced service appears in Services. The manifest enables it. If the project uses a manually selected Google Cloud project, also enable Calendar API there. Default Apps Script projects handle this automatically. [Advanced service setup](https://developers.google.com/apps-script/guides/services/advanced)
4. In Project Settings → Script Properties, add:

   | Property | Value |
   | --- | --- |
   | `HALENN_BOOKING_WEBHOOK_SECRET` | The same strong random secret stored server-side for Halenn's booking endpoint; at least 32 characters |
   | `HALENN_BOOKING_SYNC_ENABLED` | `false` |

   Never place the secret in source code, a public environment variable, chat, screenshots, or logs. No Supabase service-role key is needed in Apps Script.
5. Select `setupHalennProjectCallSync` and run it once. Review and authorize the requested **read-only Calendar**, external HTTPS request, and trigger-management permissions. The setup verifies calendar read access and installs an event-update trigger plus a five-minute recovery trigger. Existing triggers for these two handler names are replaced, so rerunning setup does not duplicate them.
6. Keep `HALENN_BOOKING_SYNC_ENABLED=false` until the endpoint is deployed and the checks below pass. Setup itself makes no request to Halenn; installed triggers return immediately while disabled.

The original read-only integration requires no web-app deployment. The new optional booking module does require the separately approved signed endpoint described above. Google retains the Calendar OAuth grant; Halenn does not receive a Google refresh token. Installable triggers run as their creator. [Trigger ownership](https://developers.google.com/apps-script/guides/triggers/installable)

## Verify and activate

Use an explicitly designated test enquiry and booking email. Keep the test records excluded from commercial analytics.

1. Make one test booking through the actual public Google appointment page. Verify the resulting event's organizer is `aevellgroup@gmail.com`, the title prefix and description sentence are present, the duration is exactly 30 minutes, and the booking guest appears among the attendees.
2. Inspect the event's description locally in Google and verify how the custom language answer is represented. The parser recognizes `Preferred language: Dutch`, `Preferred language: English`, or the exact parenthetical question label above, with HTML tags or line breaks between label and answer. It deliberately omits uncertain answers. Do not assume Google's undocumented question rendering is stable; adapt and retest only if the observed format differs.
3. Confirm Halenn's endpoint verifies HMAC against the same secret and accepts the contract below. Its database must deduplicate provider event IDs, preserve source attribution and apply stale-event ordering.
4. Change `HALENN_BOOKING_SYNC_ENABLED` to `true` and run `syncHalennProjectCalls` once. Verify the actual booking appears in admin analytics and links to the intended enquiry.
5. Change the test appointment time, then cancel it. Verify admin shows the changed time and cancellation, with no second lead or second initial-booking conversion. Also check Google's customer rescheduling link: the public API does not promise whether that flow preserves the event ID.
6. Verify a duplicate sync is harmless and an invalid signature is rejected by the endpoint. Check the Apps Script **Executions** panel for successful runs; `inspectHalennProjectCallSync` returns only enabled status, last successful sync time and tracked count.
7. Only after this round trip succeeds should the production integration be described as verified. Keep actual attendance as a separate manual outcome; a scheduled end time does not prove a call was held.

## Transport contract

Each batch contains at most 50 changes and at most 80,000 UTF-8 bytes, leaving headroom below the receiver's request-size limit:

```json
{
  "version": 1,
  "calendarId": "aevellgroup@gmail.com",
  "events": [{
    "id": "provider-event-id",
    "status": "confirmed",
    "updated": "2026-11-11T12:00:00.000Z",
    "created": "2026-11-11T12:00:00.000Z",
    "start": "2026-11-13T09:00:00.000Z",
    "end": "2026-11-13T09:30:00.000Z",
    "attendeeEmail": "customer@example.com",
    "attendeeName": "Example Customer",
    "preferredLanguage": "en"
  }]
}
```

`preferredLanguage` is optional. `attendeeEmail` and `attendeeName` are `null` when there are zero or multiple distinct external guests, or an external guest has an unsupported email format, so the actual booking is retained for manual matching without guessing a customer. Names are stripped of control characters and capped at 180 Unicode characters to match the database contract. Cancellations contain only `id`, `status: "cancelled"` and `updated` when Google supplies it. **No provider timestamp is fabricated** for an ID-only deletion. The endpoint can use the separately signed observation timestamp for ordering such tombstones. Calendar deletions may expose only the event ID. [Google event resource](https://developers.google.com/workspace/calendar/api/v3/reference/events)

Headers:

- `X-Halenn-Timestamp`: Unix time in integer **seconds**, as text.
- `X-Halenn-Signature`: lowercase hex HMAC-SHA256 of `timestamp + "." + rawJSON`, keyed by `HALENN_BOOKING_WEBHOOK_SECRET`.

The same payload bytes, timestamp and signature are reused for retries. The receiver must verify the raw body before parsing, compare signatures safely, enforce a short timestamp window and deduplicate event deliveries. HTTP 2xx means the complete batch was accepted. Redirects are rejected. Transport failures, HTTP 429 and HTTP 5xx receive up to three attempts; other failures stop immediately. Do not return 2xx if only part of a batch was accepted.

Every completed scan sends a signed request. A scan with no matching changes sends `{ "version": 1, "calendarId": "aevellgroup@gmail.com", "events": [] }` as a heartbeat, including when the only changes were unrelated calendar entries. Accepting that empty batch lets the database update `last_sync_at` without creating a booking or transmitting unrelated details. If the heartbeat fails, the local sync token and success timestamp do not advance.

Google appointment links have no documented hidden enquiry-metadata interface used here. The backend should match normalized attendee email only when exactly one eligible enquiry exists. Ambiguous, different-email or otherwise unmatched bookings require manual matching. The booking's existence and its enquiry attribution are separate facts; clicks are never bookings.

## Recovery, privacy and capacity

- `EventUpdated` indicates a calendar changed, not which event changed. The bridge follows Google's incremental-sync model. It saves the next token only after every accepted batch and a complete scan. [Trigger event documentation](https://developers.google.com/apps-script/guides/triggers/events)
- Script locking prevents overlapping trigger runs. The five-minute fallback retries changes after transient failures. This is eventual synchronization, not an instantaneous UI guarantee.
- On an expired sync token, the bridge performs a full scan while retaining known booking IDs. Previously tracked confirmed IDs missing from the scan are checked individually; a confirmed not-found/deleted result becomes a cancellation. Other lookup errors stop the sync without guessing.
- A partially accepted run can replay accepted events. Server-side event-ID/version idempotency is required. A failed run does not advance the sync token. [Google sync guidance](https://developers.google.com/workspace/calendar/api/guides/sync)
- Only matching booking IDs, status and version/observation timestamps are persisted in Script Properties. No attendee names, emails, descriptions or unrelated calendar events are cached. Only minimal matching booking fields leave Google.
- The cache is bounded at 1,500 tracked events and 180,000 serialized characters. Cancelled records are pruned after 90 days; active records are never silently evicted. A capacity error stops before posting and leaves the prior token intact. At that point migrate/extend the cache or retire old completed records through a reviewed maintenance process; do not delete the state blindly, because that loses recognition of later ID-only deletions.
- State is written in small chunks and published using one manifest pointer. An interrupted write leaves the previous complete state usable. Do not manually edit or delete `HALENN_PROJECT_CALL_STATE` or `HALENN_PROJECT_CALL_CHUNK_*` properties.
- To pause immediately, set `HALENN_BOOKING_SYNC_ENABLED=false`. To disconnect, also remove the two installed triggers and revoke the script's Calendar authorization in the Google account. Keep the CRM's historical booking records.
- A private calendar read scope necessarily permits the script to read the whole calendar. Local filtering prevents unrelated events from being transmitted or stored. This script neither logs event payloads nor requests Calendar write access.

## Offline verification

From the repository root, run:

```sh
node --test scripts/google-project-calls/bridge.test.mjs
```

Tests execute `Code.gs` in an isolated JavaScript context with mocked Google/network interfaces. They cover strict filtering, payload minimization, language parsing, stale and ID-only tombstones, HMAC bytes, pagination, retry behavior, signed empty heartbeats, partial failure, expired-token recovery and atomic bounded storage. They do not install triggers, call Google, call Halenn or send messages.
