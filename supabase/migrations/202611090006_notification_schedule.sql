begin;
-- Install after 005. This is the same existing extension used for analytics
-- retention; the named job is replaced if this scheduling statement is repeated.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule(
  'halenn-enquiry-notifications',
  '*/5 * * * *',
  'select private.halenn_process_enquiry_notifications();'
);
commit;
