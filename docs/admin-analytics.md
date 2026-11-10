# Founder analytics

Open `/admin/analytics` after signing in with an existing founder account.

## Daily workflow

- In a lead's **Sales details & analytics**, set its acquisition source, service, owner, industry and offer. The existing Source URL remains the research link, separate from the acquisition source.
- Update the lead stage as the sale progresses. Stage changes are recorded automatically and atomically.
- Use **Record activity** for attempts, conversations, booked/held/missed meetings, proposals, payments, refunds, costs, commissions, agreed upsells, referrals and subscription changes.
- Use **Correct entry** in the activity log to exclude a mistaken manual entry with a reason, then record its replacement. The original stays visible for audit. Stage history cannot be edited through this form.
- An activity does not automatically change a lead's stage. This keeps activity counts and pipeline status distinct.

## Five views

| View                  | Purpose                                                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Overview              | Period lead/win/meeting/cash totals, trends, observed milestones, sources and today's follow-up priorities                 |
| Visitors & leads      | Website sources, quiz journey and enquiry drop-off; a separate Leads view shows acquisition cohorts and recorded spend     |
| Sales pipeline        | Current pipeline, known stage ages, outreach, meeting attendance, known first-contact/sales-cycle medians and lost reasons |
| Revenue & costs       | Payments less refunds, recorded costs and contribution; offer conversion                                                   |
| Customers & retention | Recorded monthly recurring totals, subscribers, opening-cohort churn, upsells, referrals and customer collections          |

## Website visitors and the quiz

In **Visitors & leads**, choose **Website traffic** to see the journey before an enquiry or **Sales leads** to see sales records. Website charts use the report dates plus their own visitor-source and device filters. Lead source, service, owner and offer filters describe the sales records, not anonymous website activity.

Website reporting covers only visitors who accept optional analytics. A declined choice records no visitor or quiz analytics, and an enquiry can still be submitted. Consent accepted halfway through a visit gives a partial history; nothing before consent is reconstructed. Browser blocking, network failures and traffic limits can also reduce coverage. These are observed numbers for the consented subset, not estimates of all traffic.

| Metric                   | What it means                                                                                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Visitors                 | Distinct random browser identifiers within the selected visits. One person using different browsers or clearing cookies can count more than once.                                                          |
| Visits                   | Tracked sessions that started in the selected date range. A new session begins after 30 minutes without recorded activity.                                                                                    |
| Page views               | Recorded views of the allowed public pages. Reloads and revisits can add views; admin pages, private routes and complete URLs are excluded.                                                                   |
| Visitor source           | A safe `utm_source` label takes precedence over an external referring hostname. Known platforms are grouped; an absent or unavailable source is Direct. Direct does not prove that someone typed the address. |
| Device                   | A desktop, tablet or mobile category based on the browser width when the visit starts. It is not a precise hardware identification.                                                                           |
| Enquiries received       | Enquiries durably saved on the server and linked to a tracked visit. Clicking Send or opening an email app is not a completed enquiry.                                                                        |
| Source-to-sale conversion | Customers won to date divided by consented enquiries linked to visits starting in the selected period. Device details still show enquiring visits / visits.                                                                 |
| Entry page               | The first allowed page recorded for the visit.                                                                                                                                                                |
| Last page / exit         | The last observed page in a visit with no recorded activity for at least 30 minutes. It is not a confirmed browser-close event.                                                                               |

Website reports select visits by their start date, then include their observed events to date. The trend places a visit and its linked enquiries on the visit's start day. This differs from the sales reports that select activity by its event date. Website reporting starts when tracking is installed and is limited to the latest 90 days, including when **All time** is selected. Older history is not backfilled.

### Reading the quiz journey

- The journey chart follows visits through seeing the quiz, starting it, reaching a recommendation, opening that attempt's enquiry form and receiving its enquiry. It is the quiz route; visitors can also enquire directly from the homepage or pricing page.
- A quiz attempt starts with the first deliberate choice. Back keeps the same attempt; **Start again** creates a new attempt when the next choice is made. One visit can therefore contain several attempts.
- Quiz completion means reaching the recommendation, once per attempt. The attempt reports include only attempts with an observed start. A recommendation seen after consent was accepted midway does not create an invented start or inflate the full-journey completion rate.
- Branch and question tables use stable question IDs rather than a fixed five-question funnel. Actual routes contain three to five questions. Going back to the same question does not count as another person.
- **Still active** means the visit has recorded activity in the last 30 minutes. An incomplete attempt becomes a drop-off only after that interval; a visitor who enquires before finishing is counted separately from a drop-off.
- Question drop-off is assigned to the last observed question on an inactive, incomplete attempt without an enquiry. It indicates where activity stopped, not why someone left.
- Counts accompany percentages. Small samples and partial coverage should be considered before changing a question or an offer.

### Enquiry forms and sales records

The homepage contact form, quiz enquiry and pricing enquiry send directly on the website. A successful submission creates an enquiry record and a new **Website** lead with the contact details and full message. The pricing form includes its selected scope and the quiz can include its answers in the enquiry. Those details belong to the enquiry/lead record; names, emails, messages and free-text answers are never included in visitor analytics.

The form breakdown separates **Homepage contact**, **Homepage quiz** and **Pricing page**. An open means the form appeared; a start means its first input; an attempt means the visitor tried to submit; a received enquiry means the server saved it. Validation, network and server errors are tracked as broad categories without the field contents. Active unfinished forms remain pending for 30 minutes; inactive forms without a receipt are shown as unfinished.

Retries of the same submission reuse its request identifier and do not create another lead. Changed content after an already received request prompts the visitor to start a new enquiry. The success message confirms receipt only. Email notifications are handled separately from receipt. Check **Account → Enquiry emails** for the sending status and continue to review Leads for new enquiries. Sending starts disabled until a working receiving inbox, verified Resend domain and restricted sending key are configured. The current approved inbox is `aevellgroup@gmail.com`. A founder can switch it to `contact@halenn.com` in the account panel once that mailbox is working. Changing the inbox leaves sending status and credentials unchanged; already attempted notifications keep their original recipient during retries. See `docs/enquiry-notifications.md`. A direct email fallback remains available once the public mailbox is working.

All successfully submitted enquiries appear in Leads, including those sent without analytics consent. Website enquiry totals can therefore be lower than the number of Website leads. Do not treat that difference as lost enquiries.

### Privacy and retention

Optional tracking uses a random visitor cookie for up to 30 days and a browser-session record with a 30-minute inactivity timeout and a 24-hour maximum visit length. It retains only public page paths, broad device/source information, safe campaign tags and finite event metadata. Referrer credentials, paths, search strings, fragments and IP-address hosts are excluded. No session replay or fingerprinting is used. Updated consent is required for this tracking version; withdrawing consent stops tracking and clears its browser identifiers.

Website visits and their events are removed after 90 days through scheduled database cleanup, with cleanup also run during event intake. Operational enquiries and sales leads are not deleted by that analytics cleanup. Founder access is required to read the reports or enquiry records.

## Definitions and limits

- Report dates use Europe/Amsterdam. Entry dates use the operator's local time and are stored as timestamps.
- Acquisition/cohort reports select leads by creation date and measure their observed conversions to date. Activity/cash reports select records by event date. Current pipeline and attention lists show today's open leads regardless of acquisition date.
- The first recorded win is counted once per lead. Existing customers receive an undated historical baseline and are excluded from dated win totals. Earlier stage changes and first-contact dates are not invented.
- EUR, USD and GBP stay separate. No currency conversion is performed. Record amounts excluding VAT or sales tax.
- Collections are cash received less refunds, not invoiced revenue. Contribution subtracts only recorded costs; it is not accounting profit or a complete gross margin. Record delivery time as a cost if it should be included.
- Acquisition spend per win is period spend (including commissions) divided by first dated wins in that period. It is not lifetime CAC. Unallocated shared acquisition costs are excluded when filtering by service or offer.
- Subscription amounts are each customer's total monthly amount in a currency. Changes replace the previous amount, cancellations set it to zero, and these events do not count as cash payments. Churn counts opening subscribers inactive at period end, divided by opening subscribers.
- Pipeline milestones use recorded evidence and do not infer skipped stages. Attendance uses held / (held + no-show) events in the period, not bookings made in the period.
- A dash means there is insufficient recorded data to calculate the metric. Counts are shown alongside rates.
- Website visits, quiz activity and on-site enquiry submissions are connected as described above. Calling platforms, calendars, payment providers and accounting systems are not automatically connected; their sales activities must still be recorded.

## Database and deployment

Migration `202611090001_sales_analytics.sql` extends lead metadata/stages and adds founder-only activity records and an atomic stage trigger. Apply it before deploying the corresponding app version. It preserves all existing leads and access rules and adds one baseline per lead. Do not re-run the migration after successful application.

Apply website migrations in order before deploying visitor tracking and on-site forms:

1. `202611090002_website_analytics.sql` adds bounded website event intake and transactional enquiry/lead creation.
2. `202611090003_website_reporting.sql` adds the founder-only aggregate report and tracking start date.
3. `202611090004_website_retention.sql` schedules daily cleanup with Supabase's `pg_cron` extension. Confirm the scheduled job exists and runs successfully.

Admin reads and sales activity writes use the existing signed-in founder session and require the initial password change. Database RLS also enforces those restrictions. Public forms and tracking use narrow write-only intake functions; they cannot read visitor data, enquiries or leads. Manual events and enquiries use client-generated UUIDs for safe retries; a reused enquiry UUID with a different payload is rejected. No service role key is used by the app.

Validation: `npm run typecheck`, `npm run verify:analytics`, `npm run verify:website`, `npm run verify:founder`, `npm run build`. The sales migration was additionally executed against a temporary PostgreSQL-compatible database to verify preservation, stage triggers, corrections, invalid writes and founder/anonymous isolation. Website validation must also cover consent on/off, source capture, every quiz branch, direct and pricing enquiries, retry/error handling, and receipt persistence before success is shown.


## Clean reporting and source-to-sale attribution

Apply `202611100004_analytics_clarity.sql` before deploying the updated dashboard. It is additive and preserves lead records, activity history, email outboxes and founder-only permissions. The original report function remains a compatibility wrapper; the new endpoint calls `halenn_website_report_v2`.

- Analytics excludes test leads, their linked activities, and internal visits by default. **Include test data** reveals them again. Leads remain available and show a **Test** badge; the lead editor’s checkbox changes their classification without deleting records.
- Only the two identified email setup submissions are backfilled as tests. Related visits are marked internal only when the same browser has no genuine submitted enquiries. Names containing “test” are not used as a classification rule.
- New public visits and enquiries made while signed in as a verified founder are automatically classified as internal tests. Signed-out browsing, another browser, or incognito cannot be reliably recognised as internal. A manually marked test enquiry excludes its whole visit only when that visit has no genuine enquiries; mixed visits retain genuine conversions.
- Source, medium and campaign come from the consented visit associated with a server-confirmed enquiry. The intake channel stays **Website**; sales reports use the captured source when available. A deliberate manual channel override takes precedence. No source is guessed when consent or a valid visit link is missing.
- Attribution is **the source of the enquiry’s visit**, not first-ever touch, multi-touch attribution or cross-device identity. Source/campaign labels remain on the lead after the 90-day visit history expires. No visitor/session identifier is copied onto the lead. Use Sales leads for older source-to-customer comparisons.
- **Visitor sources → sales** selects visits by start date, then follows their enquiries to recorded customer wins to date. Several submissions by the same business can create several leads; this is enquiry/lead conversion, not deduplicated company conversion. Mark duplicates as test only when they really are tests; otherwise correct your lead records deliberately.
- A customer means a current Won lead or a non-void historical Won stage/baseline, matching the sales model. It does not imply that payment has been collected. Receipts and payment totals still require recorded activities.
- **During this period**, **Current position**, and **Leads added in this period · results to date** distinguish different date bases. The limited-data note appears below 20 leads/visits as a reading aid, not a statistical confidence threshold.

Additional checks: `node scripts/verify-analytics-attribution.mjs` with `HALENN_PGLITE_MODULE` set to an installed PGlite module. This covers exact setup backfill, authenticated internal detection, consented snapshots, source-to-sale reporting, mixed test/genuine visits, reversible exclusions, retention, and read/write isolation. `/prototypes/analytics` provides fictional populated/empty views in development only; production returns 404.


## Chart presentation

- Traffic and enquiry trends are stacked, with identical dates and independent vertical scales. Enquiries remain assigned to their visit's start date. A recorded zero-enquiry period shows a zero line; an absence of tracked visits retains the empty state.
- The quiz journey includes previous-step progression as well as the share of all visits. Question drop-off bars share a fixed 0–100% scale and use dropped attempts / attempts reaching that question. Counts and still-active attempts remain visible; the full question table is expandable. Routes retain their own question order and are not combined into a fixed-length funnel.
- Collections and costs use paired columns on the same currency scale, including below-zero collections when refunds exceed payments. Exact interval values remain available without relying on hover.
- Retention compares only opening subscribers: still active versus inactive at period end. New subscribers do not enter that comparison. With no opening subscribers, the view explains that retention is not yet available. Upsells remain a separate headline metric; referrals are shown separately below retention.
- The development-only preview includes `sample=refunds` for negative net collections, `sample=lost` for full opening-cohort churn and `sample=no-enquiries` for tracked visits without enquiries, alongside its populated and empty states.
