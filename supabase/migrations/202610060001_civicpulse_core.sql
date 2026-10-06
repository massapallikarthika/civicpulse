create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null,
  department text,
  title text,
  timezone text not null default 'Asia/Kolkata',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  code text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wards_user_code_unique unique (user_id, code)
);

create table if not exists public.complaints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ward_id uuid not null references public.wards(id) on delete restrict,
  title text not null,
  description text not null,
  category text not null default 'other' check (category in ('water_supply', 'sanitation', 'roads', 'street_lighting', 'healthcare', 'public_safety', 'other')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  department text,
  status text not null default 'open' check (status in ('open', 'acknowledged', 'in_progress', 'resolved', 'closed')),
  ai_summary text,
  ai_recommended_action text,
  ai_model text,
  ai_analyzed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ward_id uuid references public.wards(id) on delete set null,
  name text not null,
  description text,
  department text not null,
  budget numeric(16, 2) not null check (budget >= 0),
  amount_spent numeric(16, 2) not null default 0 check (amount_spent >= 0),
  progress integer not null default 0 check (progress between 0 and 100),
  status text not null default 'planned' check (status in ('planned', 'active', 'on_hold', 'completed', 'cancelled')),
  deadline date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  department text not null,
  name text not null,
  allocated_amount numeric(16, 2) not null check (allocated_amount >= 0),
  spent_amount numeric(16, 2) not null default 0 check (spent_amount >= 0),
  year integer not null check (year between 2000 and 2200),
  currency_code char(3) not null default 'INR' check (currency_code ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ward_id uuid not null references public.wards(id) on delete restrict,
  service_type text not null check (service_type in ('water', 'waste_management', 'roads', 'street_lights', 'healthcare')),
  coverage numeric(5, 2) not null check (coverage between 0 and 100),
  satisfaction numeric(5, 2) not null check (satisfaction between 0 and 100),
  status text not null check (status in ('good', 'needs_attention', 'critical', 'unavailable')),
  reporting_period date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint services_user_ward_type_period_unique unique (user_id, ward_id, service_type, reporting_period)
);

create table if not exists public.ai_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  title text not null,
  summary text not null,
  recommended_action text not null,
  payload jsonb not null default '[]'::jsonb check (jsonb_typeof(payload) = 'array'),
  source_type text,
  source_scope jsonb not null default '{}'::jsonb check (jsonb_typeof(source_scope) = 'object'),
  model text not null,
  prompt_version text not null,
  status text not null default 'new' check (status in ('new', 'acknowledged', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  summary text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  complaint_id uuid references public.complaints(id) on delete set null,
  feature text not null,
  model text not null,
  prompt_version text not null,
  status text not null check (status in ('started', 'succeeded', 'failed')),
  input_tokens integer,
  output_tokens integer,
  duration_ms integer,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.ai_usage_windows (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0)
);

create index if not exists complaints_user_created_idx on public.complaints (user_id, created_at desc) where archived_at is null;
create index if not exists complaints_user_status_idx on public.complaints (user_id, status, priority) where archived_at is null;
create index if not exists complaints_ward_idx on public.complaints (user_id, ward_id);
create index if not exists projects_user_updated_idx on public.projects (user_id, updated_at desc);
create index if not exists resources_user_year_idx on public.resources (user_id, year desc);
create index if not exists services_user_period_idx on public.services (user_id, reporting_period desc);
create index if not exists insights_user_status_idx on public.ai_insights (user_id, status, created_at desc);
create index if not exists activity_user_created_idx on public.activity_events (user_id, created_at desc);
create index if not exists ai_runs_user_created_idx on public.ai_runs (user_id, created_at desc);

create or replace function public.civicpulse_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.civicpulse_set_updated_at();
drop trigger if exists wards_set_updated_at on public.wards;
create trigger wards_set_updated_at before update on public.wards for each row execute function public.civicpulse_set_updated_at();
drop trigger if exists complaints_set_updated_at on public.complaints;
create trigger complaints_set_updated_at before update on public.complaints for each row execute function public.civicpulse_set_updated_at();
drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at before update on public.projects for each row execute function public.civicpulse_set_updated_at();
drop trigger if exists resources_set_updated_at on public.resources;
create trigger resources_set_updated_at before update on public.resources for each row execute function public.civicpulse_set_updated_at();
drop trigger if exists services_set_updated_at on public.services;
create trigger services_set_updated_at before update on public.services for each row execute function public.civicpulse_set_updated_at();
drop trigger if exists ai_insights_set_updated_at on public.ai_insights;
create trigger ai_insights_set_updated_at before update on public.ai_insights for each row execute function public.civicpulse_set_updated_at();

create or replace function public.civicpulse_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(coalesce(new.email, ''), '@', 1))
  )
  on conflict (user_id) do update
    set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists civicpulse_auth_user_created on auth.users;
create trigger civicpulse_auth_user_created
after insert on auth.users
for each row execute function public.civicpulse_handle_new_user();

create or replace function public.civicpulse_log_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_entity_id uuid;
  v_action text;
  v_label text;
  v_summary text;
begin
  if tg_op = 'DELETE' then
    v_user_id := old.user_id;
    v_entity_id := old.id;
    v_action := 'deleted';
    v_label := tg_table_name;
  else
    v_user_id := new.user_id;
    v_entity_id := new.id;
    v_action := lower(tg_op);
    v_label := tg_table_name;
    if tg_table_name in ('wards', 'projects', 'resources') then
      v_label := coalesce(nullif(new.name, ''), tg_table_name);
    elsif tg_table_name = 'complaints' then
      v_label := coalesce(nullif(new.title, ''), tg_table_name);
    end if;
    if tg_table_name = 'complaints' and new.archived_at is not null and (tg_op = 'INSERT' or old.archived_at is distinct from new.archived_at) then
      v_action := 'archived';
    end if;
  end if;

  if v_user_id is not null then
    v_summary := case
      when v_action = 'insert' then 'Created ' || replace(tg_table_name, '_', ' ') || ': ' || left(v_label, 100)
      when v_action = 'update' then 'Updated ' || replace(tg_table_name, '_', ' ') || ': ' || left(v_label, 100)
      when v_action = 'archived' then 'Archived complaint: ' || left(v_label, 100)
      else 'Deleted ' || replace(tg_table_name, '_', ' ') || ': ' || left(v_label, 100)
    end;
    insert into public.activity_events (user_id, actor_user_id, entity_type, entity_id, action, summary)
    values (v_user_id, v_user_id, tg_table_name, v_entity_id, v_action, v_summary);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.civicpulse_check_ward_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ward_id is not null and not exists (
    select 1
    from public.wards w
    where w.id = new.ward_id
      and w.user_id = new.user_id
  ) then
    raise exception 'Ward does not belong to this account' using errcode = '23503';
  end if;
  return new;
end;
$$;

drop trigger if exists complaints_check_ward_owner on public.complaints;
create trigger complaints_check_ward_owner before insert or update of ward_id, user_id on public.complaints for each row execute function public.civicpulse_check_ward_owner();
drop trigger if exists projects_check_ward_owner on public.projects;
create trigger projects_check_ward_owner before insert or update of ward_id, user_id on public.projects for each row execute function public.civicpulse_check_ward_owner();
drop trigger if exists services_check_ward_owner on public.services;
create trigger services_check_ward_owner before insert or update of ward_id, user_id on public.services for each row execute function public.civicpulse_check_ward_owner();

drop trigger if exists wards_activity_log on public.wards;
create trigger wards_activity_log after insert or update or delete on public.wards for each row execute function public.civicpulse_log_change();
drop trigger if exists complaints_activity_log on public.complaints;
create trigger complaints_activity_log after insert or update or delete on public.complaints for each row execute function public.civicpulse_log_change();
drop trigger if exists projects_activity_log on public.projects;
create trigger projects_activity_log after insert or update or delete on public.projects for each row execute function public.civicpulse_log_change();
drop trigger if exists resources_activity_log on public.resources;
create trigger resources_activity_log after insert or update or delete on public.resources for each row execute function public.civicpulse_log_change();
drop trigger if exists services_activity_log on public.services;
create trigger services_activity_log after insert or update or delete on public.services for each row execute function public.civicpulse_log_change();
drop trigger if exists ai_insights_activity_log on public.ai_insights;
create trigger ai_insights_activity_log after insert or update or delete on public.ai_insights for each row execute function public.civicpulse_log_change();

insert into public.profiles (user_id, email, full_name)
select
  u.id,
  coalesce(u.email, ''),
  coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), split_part(coalesce(u.email, ''), '@', 1))
from auth.users u
on conflict (user_id) do nothing;

alter table public.profiles enable row level security;
alter table public.wards enable row level security;
alter table public.complaints enable row level security;
alter table public.projects enable row level security;
alter table public.resources enable row level security;
alter table public.services enable row level security;
alter table public.ai_insights enable row level security;
alter table public.activity_events enable row level security;
alter table public.ai_runs enable row level security;
alter table public.ai_usage_windows enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists wards_owner_all on public.wards;
create policy wards_owner_all on public.wards for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists complaints_owner_all on public.complaints;
create policy complaints_owner_all on public.complaints for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists projects_owner_all on public.projects;
create policy projects_owner_all on public.projects for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists resources_owner_all on public.resources;
create policy resources_owner_all on public.resources for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists services_owner_all on public.services;
create policy services_owner_all on public.services for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists ai_insights_owner_all on public.ai_insights;
create policy ai_insights_owner_all on public.ai_insights for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists activity_owner_all on public.activity_events;
create policy activity_owner_all on public.activity_events for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists ai_runs_owner_all on public.ai_runs;
drop policy if exists ai_runs_owner_select on public.ai_runs;
create policy ai_runs_owner_select on public.ai_runs for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists ai_runs_owner_insert on public.ai_runs;
create policy ai_runs_owner_insert on public.ai_runs for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists activity_owner_all on public.activity_events;
drop policy if exists activity_owner_select on public.activity_events;
create policy activity_owner_select on public.activity_events for select to authenticated using (user_id = (select auth.uid()));

grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
revoke insert, update, delete on public.profiles from authenticated;
grant update (full_name, department, title, timezone) on public.profiles to authenticated;
grant select, insert, update, delete on
  public.wards,
  public.complaints,
  public.projects,
  public.resources,
  public.services,
  public.ai_insights
to authenticated;
grant select on public.activity_events to authenticated;
grant select, insert on public.ai_runs to authenticated;
revoke update, delete on public.ai_runs from authenticated;
revoke all on public.ai_usage_windows from public, anon, authenticated;

revoke all on function public.civicpulse_handle_new_user() from public, anon, authenticated;
revoke all on function public.civicpulse_set_updated_at() from public, anon, authenticated;
revoke all on function public.civicpulse_log_change() from public, anon, authenticated;
revoke all on function public.civicpulse_check_ward_owner() from public, anon, authenticated;

create or replace function public.civicpulse_claim_ai_usage(p_limit integer default 12)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_requests integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  insert into public.ai_usage_windows (user_id, window_started_at, request_count)
  values (v_user_id, now(), 1)
  on conflict (user_id) do update
    set window_started_at = case
          when public.ai_usage_windows.window_started_at <= now() - interval '1 hour' then now()
          else public.ai_usage_windows.window_started_at
        end,
        request_count = case
          when public.ai_usage_windows.window_started_at <= now() - interval '1 hour' then 1
          else public.ai_usage_windows.request_count + 1
        end
  returning request_count into v_requests;

  return v_requests <= greatest(1, least(p_limit, 60));
end;
$$;

grant execute on function public.civicpulse_claim_ai_usage(integer) to authenticated;
revoke all on function public.civicpulse_claim_ai_usage(integer) from public, anon;

create or replace function public.civicpulse_dashboard_summary()
returns jsonb
language sql
stable
security invoker
set search_path = public, auth
as $$
  select jsonb_build_object(
    'complaints', jsonb_build_object(
      'total', (select count(*)::integer from public.complaints c where c.user_id = auth.uid() and c.archived_at is null),
      'pending', (select count(*)::integer from public.complaints c where c.user_id = auth.uid() and c.archived_at is null and c.status in ('open', 'acknowledged', 'in_progress')),
      'high_critical', (select count(*)::integer from public.complaints c where c.user_id = auth.uid() and c.archived_at is null and c.priority in ('high', 'critical')),
      'by_priority', coalesce((
        select jsonb_agg(jsonb_build_object('priority', p.priority, 'count', coalesce(c.total, 0)) order by p.sort_order)
        from (values ('low', 1), ('medium', 2), ('high', 3), ('critical', 4)) as p(priority, sort_order)
        left join (
          select priority, count(*)::integer as total
          from public.complaints
          where user_id = auth.uid() and archived_at is null
          group by priority
        ) c on c.priority = p.priority
      ), '[]'::jsonb)
    ),
    'projects', jsonb_build_object(
      'active', (select count(*)::integer from public.projects p where p.user_id = auth.uid() and p.status = 'active'),
      'delayed', (select count(*)::integer from public.projects p where p.user_id = auth.uid() and p.deadline < current_date and p.status not in ('completed', 'cancelled')),
      'average_progress', coalesce((select round(avg(p.progress)::numeric, 1)::float from public.projects p where p.user_id = auth.uid()), 0)
    ),
    'resources', jsonb_build_object(
      'allocated', coalesce((select sum(r.allocated_amount)::float from public.resources r where r.user_id = auth.uid()), 0),
      'spent', coalesce((select sum(r.spent_amount)::float from public.resources r where r.user_id = auth.uid()), 0),
      'remaining', coalesce((select sum(r.allocated_amount - r.spent_amount)::float from public.resources r where r.user_id = auth.uid()), 0),
      'currency_code', coalesce((select r.currency_code::text from public.resources r where r.user_id = auth.uid() order by r.year desc, r.created_at desc limit 1), 'INR')
    ),
    'services', jsonb_build_object(
      'average_coverage', coalesce((select round(avg(s.coverage)::numeric, 1)::float from public.services s where s.user_id = auth.uid()), 0),
      'average_satisfaction', coalesce((select round(avg(s.satisfaction)::numeric, 1)::float from public.services s where s.user_id = auth.uid()), 0)
    ),
    'ward_performance', coalesce((
      select jsonb_agg(jsonb_build_object(
        'ward_id', w.id,
        'ward_name', w.name,
        'open_complaints', coalesce(c.open_count, 0),
        'service_score', coalesce(s.score, 0)
      ) order by w.name)
      from (
        select id, name
        from public.wards
        where user_id = auth.uid()
        order by name
        limit 12
      ) w
      left join (
        select ward_id, count(*)::integer as open_count
        from public.complaints
        where user_id = auth.uid() and archived_at is null and status in ('open', 'acknowledged', 'in_progress')
        group by ward_id
      ) c on c.ward_id = w.id
      left join (
        select ward_id, round(avg((coverage + satisfaction) / 2)::numeric, 1)::float as score
        from public.services
        where user_id = auth.uid()
        group by ward_id
      ) s on s.ward_id = w.id
    ), '[]'::jsonb),
    'recent_activity', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'entity_type', a.entity_type,
        'entity_id', a.entity_id,
        'action', a.action,
        'summary', a.summary,
        'created_at', a.created_at
      ) order by a.created_at desc)
      from (
        select id, entity_type, entity_id, action, summary, created_at
        from public.activity_events
        where user_id = auth.uid()
        order by created_at desc
        limit 8
      ) a
    ), '[]'::jsonb),
    'ai_insights', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'kind', i.kind,
        'title', i.title,
        'summary', i.summary,
        'recommended_action', i.recommended_action,
        'payload', i.payload,
        'source_type', i.source_type,
        'source_scope', i.source_scope,
        'model', i.model,
        'prompt_version', i.prompt_version,
        'status', i.status,
        'created_at', i.created_at,
        'updated_at', i.updated_at
      ) order by i.created_at desc)
      from (
        select id, kind, title, summary, recommended_action, payload, source_type, source_scope, model, prompt_version, status, created_at, updated_at
        from public.ai_insights
        where user_id = auth.uid() and status = 'new'
        order by created_at desc
        limit 4
      ) i
    ), '[]'::jsonb)
  );
$$;

grant execute on function public.civicpulse_dashboard_summary() to authenticated;
