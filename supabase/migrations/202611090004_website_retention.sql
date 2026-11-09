-- Supabase's supported pg_cron extension enforces retention even during quiet periods.
-- Only analytics visits/events are removed. Enquiries and sales leads are preserved.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('halenn-website-analytics-retention','17 3 * * *','select private.halenn_prune_website_analytics();');
