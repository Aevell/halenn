# Halenn privacy dock and legal release, 1 November 2026

## Scope and publication decision

User explicitly authorized publication to halenn.com using AEVELL with registration/address placeholders. This release does not invent a registered entity, address, KVK or VAT number. Business details clearly identify what is pending. Internal design-preview and legal-review instructions have been removed from public copy. Project terms remain proposal-specific; no payment, cancellation, liability or delivery promises have been invented.

This is a website/UI release, not a certification of legal compliance. Current operator identity/address, registration, actual email-provider arrangements, retention and project contract terms still need final business review when available.

## Changes

- Compact silk dock (70vw desktop, responsive mobile) minimizes into a 48px cookie icon at bottom left over 460ms. Copy fades before the surface shrinks; icon appears as the dock reaches it. Accept and reject have equal prominence and behavior.
- Icon idles at 55% opacity on fine pointers, 70% on touch, full opacity on hover or keyboard focus. Footer also retains a text Cookie preferences control.
- Privacy preferences use a native modal dialog with focus trapping, Escape, cancellation without saving and focus return. Reduced motion and hidden tabs skip the flight; resize/preferences changes finish active motion. No continuous banner loop.
- Restored original footer layout and Services, Pricing, About, How we work, FAQ and Contact links. Added Privacy, Cookies, Terms and Business details.
- New public server-rendered /privacy, /cookies, /terms and /business pages, canonical URLs and sitemap entries. Homepage remains statically rendered. Development prototype routes remain non-indexable and unavailable in production.
- New versioned host-only preference cookie: halenn_privacy, Path=/, 180 days, SameSite=Lax, Secure over HTTPS. Stores only version 2, optional boolean and save timestamp. Old preview choices are not imported.
- No optional tracking is connected. UI makes this explicit; a future optional service requires a fresh purpose-specific choice/version. No API, personal-data storage or dependency added.

## Verification

- npm run lint: pass, including repair of existing internal-link lint failures in the touched shared footer.
- npm run typecheck: pass.
- npm run build: pass. Homepage and legal routes static.
- 43 targeted tests passed with development and optimized production servers: consent parsing, expiry, legacy/invalid preferences, SSR legal content, restored links, production route isolation, homepage motion, solution guide, pricing handoff and tab titles.
- Browser: accept/reject, re-open, unsaved switch cancellation, reload persistence, keyboard focus trap, Escape, save and cross-page preferences verified. Optimized production browser error log empty in tested flow.
- Visual inspection: 1400x900, 1400x600, 768x900, 390x844 and 320x568. No horizontal overflow. 320px dock 288x208.6px; 1400px dock 980x132px. Narrow/short modal scrolls and keyboard reaches Save. Saved screenshots in this folder.
- Reduced motion guard and scoped CSS reviewed; native OS reduced-motion setting was not changed in this pass. The layout tests do not replace testing on physical low-end phones.
- An initial CSS grouping regression was caught in browser inspection and fixed before the final build. A dev-only stale response during compilation was resolved; subsequent development and production tests passed.
- Logo SHA256 unchanged: 1368d9073d88415f31a51a409c25d8f8b837cbe522127b0de17a5308cd94b0b8 (halenn-ribbon-2x.webp).
- No homepage content, hero motion, pricing catalogue, logo artwork, DNS or environment settings changed.

## References

- https://business.gov.nl/regulations/cookies/
- https://business.gov.nl/regulations/draw-up-privacy-statement/
- https://business.gov.nl/regulations/general-terms-conditions/

## Release target

GitHub Aevell/halenn. Vercel project halenn (prj_pXkepQF5Z1bQaG8gynAqmw33nn4U), team ripplstudios (team_sn7JZxvUY2QcxC4sV7gLHIcl). Previous production commit 8d4161730bfa047819e6170505839c32d57f6e70, deployment dpl_GmT5zXBMpkKdav7L8JYV9cfzoBL5. No DNS or protection change required.
