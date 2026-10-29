# Pricing publication, 29 October 2026

User explicitly approved publication to halenn.com. Public route: /pricing.

## Release changes

- Shared pricing implementation under app/components/pricing, public metadata and canonical URL, server-rendered guide.
- Homepage desktop/mobile Pricing links point to /pricing; homepage composition and logo unchanged.
- Sitemap includes /pricing. Prototype routes remain excluded and return 404 in production.
- Starting-estimate language replaces draft/prototype labels in public copy, PDF and enquiry. All approved prices, scope, exclusions and proposal terms retained.
- Licensed PDF fonts moved to /brand/pricing-fonts; exports use production silk assets.

## Verification

- ESLint and TypeScript pass; Next.js production build passes.
- All 15 pricing tests pass against development and local production, including configuration totals, legacy URLs, notes privacy, public metadata and prototype isolation.
- All 7 PDF tests pass. Five sample exports, 17 pages rendered and visually reviewed; selectable text, euro symbols, links and scope checked.
- Local production browser: combined Web + App + custom AI configuration produced €7,980 starting investment and €248/month care, quote-required notice, successful PDF download and matching enquiry dialog. No email sent.
- Fresh independent release review found no blockers.

Deployment and live verification are recorded alongside this file after release.
