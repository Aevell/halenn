begin;
-- Extend the existing report without changing the visitor cohort or permissions.
-- Booked calls are distinct acquired leads with observed booking activity to date,
-- not clicks, scheduled call dates, or a count of reschedules. Existing JSON fields
-- and the original compatibility wrapper retain their meanings.
create or replace function public.halenn_website_report_v2(p_from date,p_to date,p_source text default '',p_device text default '',p_include_tests boolean default false) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; lower_date date; upper_date date; available_date date; empty_range boolean;
begin
 if not public.halenn_is_founder() or public.halenn_needs_password() then raise exception 'Founder access required' using errcode='42501';end if;
 if p_from is null or p_to is null or p_from>p_to or p_source is null or length(p_source)>64 or p_device is null or p_device not in ('','desktop','tablet','mobile') then raise exception 'Invalid report range';end if;
 available_date:=greatest((select (started_at at time zone 'Europe/Amsterdam')::date from private.halenn_website_tracking),(now() at time zone 'Europe/Amsterdam')::date-89);
 lower_date:=greatest(p_from,available_date);upper_date:=least(p_to,(now() at time zone 'Europe/Amsterdam')::date);
 empty_range:=lower_date>upper_date;
 -- An entirely unavailable period stays an honest empty period, never an inverted range.
 if empty_range then lower_date:=p_from;upper_date:=p_to;end if;
 with
 candidates as (select * from public.halenn_website_visits where not empty_range and started_at>=(lower_date::timestamp at time zone 'Europe/Amsterdam') and started_at<((upper_date+1)::timestamp at time zone 'Europe/Amsterdam') and (p_source='' or source=p_source) and (p_device='' or device=p_device)),
 s as (select v.* from candidates v where coalesce(p_include_tests,false) or (
   not v.is_internal and not (
     exists(select 1 from public.halenn_website_events e join public.halenn_website_enquiries q on q.id=e.id join public.halenn_leads l on l.id=q.lead_id where e.session_id=v.id and e.kind='enquiry_received' and l.is_test)
     and not exists(select 1 from public.halenn_website_events e join public.halenn_website_enquiries q on q.id=e.id join public.halenn_leads l on l.id=q.lead_id where e.session_id=v.id and e.kind='enquiry_received' and not l.is_test)
   )
 )),
 e as (select e.* from public.halenn_website_events e join s on s.id=e.session_id
   where coalesce(p_include_tests,false) or not exists (
     select 1 from public.halenn_website_enquiries q join public.halenn_leads l on l.id=q.lead_id
     where l.is_test and (q.id=e.id or (q.form_id=e.form_id and not exists (
       select 1 from public.halenn_website_enquiries real_q join public.halenn_leads real_l on real_l.id=real_q.lead_id
       where real_q.form_id=q.form_id and not real_l.is_test
     )))
   )),
 acquired as (select distinct s.source,l.id,l.status from s
   join e on e.session_id=s.id and e.kind='enquiry_received'
   join public.halenn_website_enquiries q on q.id=e.id
   join public.halenn_leads l on l.id=q.lead_id
   where coalesce(p_include_tests,false) or not l.is_test),
 customers as (select a.* from acquired a where a.status='Won' or exists (
   select 1 from public.halenn_activity h where h.lead_id=a.id and h.kind in ('stage','baseline') and h.to_stage='Won' and h.voided_at is null
 )),
 v as (select s.*,
  count(e.id) filter(where e.kind='page_view') as views,
  count(e.id) filter(where e.kind='enquiry_received') as receipts,
  coalesce(bool_or(e.kind='quiz_view'),false) as quiz_seen,
  coalesce(bool_or(e.kind='quiz_start'),false) as quiz_started,
  (array_agg(e.path order by e.occurred_at desc,e.sequence_id desc) filter(where e.kind='page_view'))[1] as last_page
  from s left join e on s.id=e.session_id group by s.id,s.visitor_id,s.started_at,s.last_seen_at,s.source,s.medium,s.campaign,s.referrer,s.landing_path,s.device,s.consent_version,s.is_internal),
 q0 as (select session_id,quiz_id,
  (array_agg(goal order by occurred_at desc,sequence_id desc) filter(where goal is not null))[1] as goal,
  (array_agg(question order by occurred_at desc,sequence_id desc) filter(where kind='quiz_question'))[1] as last_question,
  bool_or(kind='quiz_complete') as completed,
  bool_or(kind='enquiry_received') as enquired,
  bool_or(kind='enquiry_open') as form_open,
  max(occurred_at) as last_at
  from e where quiz_id is not null group by session_id,quiz_id having bool_or(kind='quiz_start')),
 q as (select q0.*,s.last_seen_at>now()-interval '30 minutes' as active from q0 join s on s.id=q0.session_id),
 fq as (select session_id,form_id,
  (array_agg(origin order by occurred_at desc,sequence_id desc) filter(where origin is not null))[1] as origin,
  bool_or(kind='enquiry_open') as opened,bool_or(kind='enquiry_start') as started,bool_or(kind='enquiry_received') as received,
  count(*) filter(where kind='enquiry_error') as errors
  from e where form_id is not null group by session_id,form_id),
 f as (select fq.*,s.last_seen_at>now()-interval '30 minutes' as active from fq join s on s.id=fq.session_id),
 qpoints as (select e.session_id,e.quiz_id,coalesce(e.goal,q.goal,'unsure') as goal,e.question,
   bool_or(e.kind='quiz_question') as seen,bool_or(e.kind='quiz_answer') as continued,
   bool_or(e.kind='quiz_question' and q.last_question=e.question and not q.completed and not q.enquired and not q.active) as dropped,
   bool_or(e.kind='quiz_question' and q.last_question=e.question and not q.completed and not q.enquired and q.active) as pending
   from e join q on e.session_id=q.session_id and e.quiz_id=q.quiz_id where e.question is not null and (e.goal is null or e.goal=q.goal) group by e.session_id,e.quiz_id,coalesce(e.goal,q.goal,'unsure'),e.question)
 select jsonb_build_object(
  'from',lower_date,'to',upper_date,'availableFrom',available_date,'updatedAt',now(),
  'totals',jsonb_build_object('visitors',(select count(distinct visitor_id) from s),'visits',(select count(*) from s),'pageViews',(select coalesce(sum(views),0) from v),'quizStarts',(select count(*) from q),'quizCompletions',(select count(*) from q where completed),'enquiries',(select count(*) from e where kind='enquiry_received'),'quizEnquiries',(select count(*) from e where kind='enquiry_received' and origin='quiz'),'formOpens',(select count(*) from f where opened),'formStarts',(select count(*) from f where started)),
  'trend',coalesce((select jsonb_agg(jsonb_build_object('date',d::date,'visits',(select count(*) from v where (started_at at time zone 'Europe/Amsterdam')::date=d::date),'enquiries',(select coalesce(sum(receipts),0) from v where (started_at at time zone 'Europe/Amsterdam')::date=d::date)) order by d) from generate_series(lower_date::timestamp,case when empty_range then lower_date-1 else upper_date end::timestamp,interval '1 day') d),'[]'::jsonb),
  'sources',coalesce((select jsonb_agg(to_jsonb(t) order by t.visits desc,t.source) from (
   select v.source,count(*) as visits,count(distinct visitor_id) as visitors,count(*) filter(where quiz_started) as "quizStarts",count(*) filter(where receipts>0) as enquiries,
   (select count(*) from acquired a where a.source=v.source) as leads,
   (select count(*) from acquired a where a.source=v.source and exists (
     select 1 from public.halenn_activity h where h.lead_id=a.id and h.kind='meeting_booked' and h.voided_at is null
   )) as "bookedCalls",
   (select count(*) from customers c where c.source=v.source) as customers
   from v group by v.source) t),'[]'::jsonb),
  'devices',coalesce((select jsonb_agg(to_jsonb(t) order by t.visits desc,t.device) from (select device,count(*) as visits,count(*) filter(where receipts>0) as enquiries from v group by device) t),'[]'::jsonb),
  'pages',coalesce((select jsonb_agg(jsonb_build_object('path',p.path,'views',p.views,'entrances',(select count(*) from v where landing_path=p.path),'exits',(select count(*) from v where last_page=p.path and last_seen_at<=now()-interval '30 minutes')) order by p.views desc,p.path) from (select path,count(*) as views from e where kind='page_view' group by path) p),'[]'::jsonb),
  'journey',jsonb_build_array(
    jsonb_build_object('label','Website visits','count',(select count(*) from v)),
    jsonb_build_object('label','Quiz seen','count',(select count(*) from v where quiz_seen)),
    jsonb_build_object('label','Quiz started','count',(select count(*) from v where quiz_seen and quiz_started)),
    jsonb_build_object('label','Recommendation reached','count',(select count(*) from v where quiz_seen and exists(select 1 from q where q.session_id=v.id and q.completed))),
    jsonb_build_object('label','Enquiry form opened','count',(select count(*) from v where quiz_seen and exists(select 1 from q where q.session_id=v.id and q.completed and q.form_open))),
    jsonb_build_object('label','Enquiry after recommendation','count',(select count(*) from v where quiz_seen and exists(select 1 from q where q.session_id=v.id and q.completed and q.form_open and q.enquired)))
  ),
  'quiz',jsonb_build_object('started',(select count(*) from q),'completed',(select count(*) from q where completed),'enquired',(select count(*) from q where not completed and enquired),'pending',(select count(*) from q where not completed and not enquired and active),'abandoned',(select count(*) from q where not completed and not enquired and not active),
    'branches',coalesce((select jsonb_agg(to_jsonb(t) order by t.started desc,t.goal) from (select coalesce(goal,'unsure') as goal,count(*) as started,count(*) filter(where completed) as completed,count(*) filter(where not completed and enquired) as enquired,count(*) filter(where not completed and not enquired and active) as pending,count(*) filter(where not completed and not enquired and not active) as abandoned from q group by coalesce(goal,'unsure'))t),'[]'::jsonb),
    'questions',coalesce((select jsonb_agg(to_jsonb(t) order by t.goal,t.dropped desc,t.question) from (select goal,question,count(*) filter(where seen) as seen,count(*) filter(where seen and continued) as continued,count(*) filter(where dropped) as dropped,count(*) filter(where pending) as pending from qpoints group by goal,question)t),'[]'::jsonb)
  ),
  'forms',coalesce((select jsonb_agg(to_jsonb(t) order by t.origin) from (select coalesce(origin,'homepage') as origin,count(*) filter(where opened) as opened,count(*) filter(where started) as started,count(*) filter(where received) as received,coalesce(sum(errors),0) as errors,count(*) filter(where opened and not received and active) as pending,count(*) filter(where opened and not received and not active) as abandoned from f group by coalesce(origin,'homepage'))t),'[]'::jsonb),
  'coverage',jsonb_build_object('retentionDays',90,'consentOnly',true,'includesTests',coalesce(p_include_tests,false),'excludedVisits',(select count(*) from candidates)-(select count(*) from s))
 ) into result;
 return result;
end;$$;
revoke all on function public.halenn_website_report_v2(date,date,text,text,boolean) from public,anon;
grant execute on function public.halenn_website_report_v2(date,date,text,text,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
