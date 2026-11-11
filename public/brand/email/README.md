# Email brand assets

These stable public URLs support Halenn's transactional customer confirmation email.

- `halenn-wordmark-v1.png`: the exact path from `app/components/halenn/cinematic/Wordmark.tsx`, rasterized at 3× (501 × 72), with the website header colour `#eef2f7` on transparency. Display at 167 × 24. Raster PNG keeps the custom lettering intact in email clients that cannot display SVG.
- `Manrope-Light.ttf`: identical to the website's `app/fonts/Manrope-Light.ttf`, weight 300. See `Manrope-OFL.txt`.
- `Geist-Regular.ttf`: identical to `public/brand/pricing-fonts/Geist-Regular.ttf`, weight 400. See `Geist-OFL.txt` and the source attribution in that directory.

The email also uses the existing `/brand/halenn-mark-v2-180.png` brand mark. Fonts are progressive enhancement: clients that do not load web fonts use Helvetica Neue, Helvetica or Arial. Essential copy stays selectable HTML text.

Deploy these assets before applying migration `202611100002_branded_customer_confirmation.sql`. Keep versioned image URLs available for previously delivered emails.

## White email design

- `halenn-wordmark-navy-v1.png` (501 × 72) and `halenn-mark-navy-v1.png` (180 × 180): exact alpha silhouettes of the existing wordmark and mark, rendered in navy `#111c29` on a white canvas. No lettering or geometry changes. The white backing keeps the navy logos readable when a client forces dark-mode background inversion; no CSS image filters are required. Display at 167 × 24 and 48 × 48 respectively.
- The white templates retain Manrope Light and Geist Regular, with the existing mail-client fallbacks.

Deploy these two new image URLs before applying `202611110001_white_enquiry_emails.sql`. Keep all older assets available for previously sent emails.
