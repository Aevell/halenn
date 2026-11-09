# Founder analytics

Open `/admin/analytics` after signing in with an existing founder account.

## Daily workflow

- In a lead's **Sales details & analytics**, set its acquisition source, service, owner, industry and offer. The existing Source URL remains the research link, separate from the acquisition source.
- Update the lead stage as the sale progresses. Stage changes are recorded automatically and atomically.
- Use **Record activity** for attempts, conversations, booked/held/missed meetings, proposals, payments, refunds, costs, commissions, agreed upsells, referrals and subscription changes.
- Use **Correct entry** in the activity log to exclude a mistaken manual entry with a reason, then record its replacement. The original stays visible for audit. Stage history cannot be edited through this form.
- An activity does not automatically change a lead's stage. This keeps activity counts and pipeline status distinct.

## Five views

| View             | Purpose                                                                                                                    |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Overview         | Period lead/win/meeting/cash totals, trends, observed milestones, sources and today's follow-up priorities                 |
| Acquisition      | Lead cohorts by source, service and industry; conversion counts and rates; recorded acquisition spend per dated win        |
| Sales process    | Current pipeline, known stage ages, outreach, meeting attendance, known first-contact/sales-cycle medians and lost reasons |
| Offers & revenue | Payments less refunds, recorded costs and contribution; offer conversion                                                   |
| Customer growth  | Recorded monthly recurring totals, subscribers, opening-cohort churn, upsells, referrals and customer collections          |

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
- Website sessions, quiz abandonment, calling platforms, calendars, payment providers and accounting systems are not automatically connected. Enquiries must exist in the leads workspace to appear in these reports.

## Database and deployment

Migration `202611090001_sales_analytics.sql` extends lead metadata/stages and adds founder-only activity records and an atomic stage trigger. Apply it before deploying the corresponding app version. It preserves all existing leads and access rules and adds one baseline per lead. Do not re-run the migration after successful application.

All reads and writes use the existing signed-in founder session and require the initial password change. Database RLS also enforces those restrictions. Manual events use client-generated UUIDs for safe retries; a reused UUID with a different payload is rejected. No service role key is used by the app.

Validation: `npm run typecheck`, `npm run lint`, `npm run verify:analytics`, `npm run verify:founder`, `npm run build`. The migration was additionally executed against a temporary PostgreSQL-compatible database to verify preservation, stage triggers, corrections, invalid writes and founder/anonymous isolation.
