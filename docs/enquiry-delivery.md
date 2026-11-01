# Website enquiry delivery

Both homepage and pricing enquiries use `POST /api/enquiries`. Pricing enquiries include the existing project brief, selected services, custom requirements and starting estimate. The server sends plain-text email to the fixed recipient `contact@halenn.com`, with the visitor's validated email as Reply-To. It never sends to a recipient supplied by the visitor.

## Enable delivery

1. In Halenn's Resend account, verify a sending domain. A dedicated subdomain such as `send.halenn.com` keeps sending records separate from the existing inbox setup. Add exactly the DNS records supplied by Resend. Do not replace the root domain's existing inbox MX records.
2. Create a sending-only Resend API key restricted to that domain.
3. Set `RESEND_API_KEY` and `ENQUIRY_FROM_EMAIL` as server-only environment variables on the existing Halenn Vercel project. The sender must be a bare address on the verified domain, for example `enquiries@send.halenn.com`. Configure Production and any preview environment used for delivery testing. Do not commit the key.
4. Deploy the form update only after configuration is ready. Perform one clearly labelled test enquiry and verify receipt at `contact@halenn.com`, including Reply-To and the pricing brief. Check Resend's delivery event as well as the website confirmation. API acceptance alone does not establish inbox delivery.

The code includes a five-attempt, ten-minute limiter per running instance, a honeypot, size limits and same-origin checks. For shared rate limiting across serverless instances, configure a Vercel Firewall rule for `POST /api/enquiries`. The application limiter alone is not shared across instances.

Missing configuration returns 503. Provider errors return a failure, retain the visitor's form details and permit a retry. The client reuses the same request ID for an unchanged retry, and Resend deduplicates those requests for 24 hours. A successful UI state means the sending service accepted the email. Delivery monitoring remains necessary.

No acknowledgement email is sent to the visitor. Confirmation appears directly on the website. This prevents the public form being used to send arbitrary acknowledgement emails to third parties. Enquiry content is not written to application logs or a local database. Resend processes the email as the configured sending provider.

## Verification

Run `node --experimental-strip-types --test scripts/verify-enquiries.mjs`, the existing pricing checks and the production build. The enquiry checks use a simulated provider and do not send email. Browser-check both dialogs, failure/retry, the contextual homepage prompts and narrow-screen layout. A live inbox test still requires the configured Resend account.
