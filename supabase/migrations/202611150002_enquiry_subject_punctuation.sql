-- Preserve the deployed email template, replacing only the authored subject separator.
do $$
declare definition text;
begin
  definition := pg_get_functiondef('private.halenn_notification_payload(uuid)'::regprocedure);
  if position('New Halenn enquiry ' || chr(8212) || ' ' in definition) > 0 then
    execute replace(definition, 'New Halenn enquiry ' || chr(8212) || ' ', 'New Halenn enquiry: ');
  end if;
end $$;
