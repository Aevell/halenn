begin;
-- Publish the versioned wordmark and licensed font files before applying this
-- template change. Only first sends use it: previously frozen payloads retain
-- their exact HTML so retries remain safe under the existing idempotency key.
create or replace function private.halenn_customer_confirmation_payload(enquiry uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  e public.halenn_website_enquiries;
  c private.halenn_enquiry_notification_config;
  n private.halenn_customer_confirmations;
  received text;
  reference text;
  plain_body text;
  html_body text;
begin
  select * into strict e from public.halenn_website_enquiries where id = enquiry;
  select * into strict c from private.halenn_enquiry_notification_config where singleton;
  select * into strict n from private.halenn_customer_confirmations where enquiry_id = enquiry;
  received := to_char(e.received_at at time zone 'Europe/Amsterdam', 'DD Mon YYYY, HH24:MI') || ' (Amsterdam)';
  reference := e.id::text;
  -- Do not reflect visitor-supplied text or links into an email to an unverified
  -- address. The enquiry itself stays in the private founder workspace.
  plain_body := 'HALENN' || E'\n\nWe’ve received your enquiry.\n\n'
    || 'Thank you for getting in touch with Halenn.'
    || E'\n\nWe’ll review what you’ve shared and get in touch about the next steps.'
    || E'\n\nHave something to add? Simply reply to this email.'
    || E'\n\nReceived: ' || received || E'\nReference: ' || reference
    || E'\n\nIf you didn’t submit an enquiry, you can ignore this email.'
    || E'\n\nThe Halenn team\nhttps://halenn.com';
  html_body := replace(replace($html$<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>We’ve received your enquiry | Halenn</title>
  <!--[if !mso]><!-->
  <style>
    @font-face { font-family:'Halenn Manrope'; font-style:normal; font-weight:300; font-display:swap; src:url('https://halenn.com/brand/email/Manrope-Light.ttf') format('truetype'); }
    @font-face { font-family:'Halenn Geist'; font-style:normal; font-weight:400; font-display:swap; src:url('https://halenn.com/brand/email/Geist-Regular.ttf') format('truetype'); }
    .halenn-heading { font-family:'Halenn Manrope','Helvetica Neue',Helvetica,Arial,sans-serif !important; }
    .halenn-body { font-family:'Halenn Geist','Helvetica Neue',Helvetica,Arial,sans-serif !important; }
  </style>
  <!--<![endif]-->
  <style>
    :root { color-scheme:dark; supported-color-schemes:dark; }
    table { border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }
    img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
    @media only screen and (max-width:480px) {
      .halenn-outer { padding:12px 12px !important; }
      .halenn-content { padding:32px 24px !important; }
      .halenn-heading { font-size:32px !important; line-height:39px !important; }
      .halenn-logo-space { padding-bottom:48px !important; }
    }
  </style>
  <!--[if mso]><style>body,table,td,p,a,h1,.halenn-body,.halenn-heading { font-family:Arial,sans-serif !important; }</style><![endif]-->
</head>
<body bgcolor="#07090d" style="margin:0;padding:0;width:100%;background-color:#07090d;color:#f2f1ed;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <div aria-hidden="true" style="display:none;font-size:1px;line-height:1px;color:#07090d;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">Thank you for getting in touch. We’ll review your enquiry and get in touch about the next steps.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#07090d" style="width:100%;background-color:#07090d;">
    <tr><td align="center" class="halenn-outer" style="padding:32px 12px;">
      <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a1018" style="width:100%;max-width:600px;table-layout:fixed;background-color:#0a1018;">
        <tr><td class="halenn-content halenn-body" style="padding:48px 48px 40px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;">
            <tr><td class="halenn-logo-space" style="padding:0 0 64px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;">
                <tr><td width="167" valign="middle" style="width:167px;padding:0;">
                  <a href="https://halenn.com" style="color:#f2f1ed;text-decoration:none;"><img src="https://halenn.com/brand/email/halenn-wordmark-v1.png" alt="Halenn" width="167" height="24" style="display:block;width:167px;height:24px;max-width:100%;color:#f2f1ed;font-size:20px;line-height:24px;"></a>
                </td><td width="48" align="right" valign="middle" style="width:48px;padding:0;">
                  <img src="https://halenn.com/brand/halenn-mark-v2-180.png" alt="" width="48" height="48" style="display:block;width:48px;height:48px;max-width:100%;">
                </td></tr>
              </table>
            </td></tr>
            <tr><td style="padding:0 0 16px;">
              <p class="halenn-body" style="margin:0;color:#b8c7d9;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:10px;line-height:16px;font-weight:400;letter-spacing:2.8px;">ENQUIRY RECEIVED</p>
            </td></tr>
            <tr><td style="padding:0 0 28px;">
              <h1 class="halenn-heading" style="margin:0;color:#f2f1ed;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:40px;line-height:48px;font-weight:300;letter-spacing:-1.2px;">We’ve received<br>your enquiry.</h1>
            </td></tr>
            <tr><td class="halenn-body" style="padding:0;color:#b8c7d9;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:16px;line-height:26px;font-weight:400;">
              <p style="margin:0 0 20px;">Thank you for getting in touch with Halenn.</p>
              <p style="margin:0 0 20px;">We’ll review what you’ve shared and get in touch about the next steps.</p>
              <p style="margin:0 0 32px;">Have something to add? Simply reply to this email.</p>
              <p style="margin:0 0 36px;color:#f2f1ed;">The Halenn team</p>
            </td></tr>
            <tr><td style="padding:0;border-top:1px solid #263347;font-size:0;line-height:0;">&nbsp;</td></tr>
            <tr><td class="halenn-body" style="padding:24px 0 28px;color:#b8c7d9;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;line-height:20px;font-weight:400;">
              <p style="margin:0 0 12px;">RECEIVED<br>{{received}}</p>
              <p style="margin:0;">REFERENCE<br><span style="word-break:break-all;overflow-wrap:anywhere;">{{reference}}</span></p>
            </td></tr>
            <tr><td class="halenn-body" style="padding:0;color:#b8c7d9;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;line-height:20px;font-weight:400;">
              <p style="margin:0 0 20px;">If you didn’t submit an enquiry, you can ignore this email.</p>
              <p style="margin:0;"><a href="https://halenn.com" style="color:#f2f1ed;text-decoration:none;">halenn.com</a></p>
            </td></tr>
          </table>
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>$html$, '{{received}}', received), '{{reference}}', reference);
  return jsonb_build_object(
    'from', c.sender, 'to', jsonb_build_array(n.recipient), 'reply_to', c.recipient,
    'subject', 'We’ve received your enquiry | Halenn', 'text', plain_body, 'html', html_body,
    'headers', jsonb_build_object('Auto-Submitted', 'auto-replied', 'X-Auto-Response-Suppress', 'All')
  );
end;
$$;

revoke all on function private.halenn_customer_confirmation_payload(uuid)
  from public, anon, authenticated;
commit;
