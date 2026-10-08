-- CivicPulse Location Fields Migration
-- Adds optional latitude/longitude and location_name to wards, complaints, and projects.
-- This is purely additive — no existing data is changed, no columns are removed.

-- WARDS: An officer may record where a ward's administrative centre is located.
alter table public.wards
  add column if not exists latitude  double precision check (latitude  between -90  and  90),
  add column if not exists longitude double precision check (longitude between -180 and 180),
  add column if not exists location_name text;

-- COMPLAINTS: A complaint may be filed at a specific street / area.
alter table public.complaints
  add column if not exists latitude      double precision check (latitude  between -90  and  90),
  add column if not exists longitude     double precision check (longitude between -180 and 180),
  add column if not exists location_name text;

-- PROJECTS: A project may be tied to a physical site.
alter table public.projects
  add column if not exists latitude      double precision check (latitude  between -90  and  90),
  add column if not exists longitude     double precision check (longitude between -180 and 180),
  add column if not exists location_name text;

-- Partial indexes: only rows that actually have coordinates are indexed.
create index if not exists wards_location_idx
  on public.wards (user_id)
  where latitude is not null and longitude is not null;

create index if not exists complaints_location_idx
  on public.complaints (user_id)
  where latitude is not null and longitude is not null and archived_at is null;

create index if not exists projects_location_idx
  on public.projects (user_id)
  where latitude is not null and longitude is not null;
