-- ============================================================================
-- Sprint Command Centre — Supabase schema
-- Run this once in your Supabase project's SQL Editor (Dashboard > SQL Editor
-- > New query > paste this whole file > Run).
-- ============================================================================

-- One row per employee. `ee_number` is the business ID from the spec
-- (the same one shown on the dashboard); `id` is an internal key the app
-- uses to link attendance records.
create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  ee_number text unique not null,
  name text not null,
  designation text not null,
  nationality text default '',
  business_line text default '',
  employee_class text default '',
  assignment text default '',
  rotation_cycle text not null,
  joining_date date not null,
  leave_balance numeric default 0,
  created_at timestamptz default now()
);

-- One row per employee per day. status_code is one of the dropdown codes
-- (SJ, SB, DO, RTD, TD, WE, PH, LOA, SL, T) or blank for "no entry".
create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  date date not null,
  status_code text not null default '',
  updated_at timestamptz default now(),
  unique (employee_id, date)
);

create index if not exists attendance_date_idx on attendance (date);
create index if not exists attendance_employee_idx on attendance (employee_id);

-- ----------------------------------------------------------------------------
-- Row Level Security — this is what makes it safe for the app to talk to
-- Supabase directly from the browser. With RLS on and this policy, only
-- someone who has logged in (via the app's login screen) can read or write
-- any data. Nobody else — including someone who finds the public API URL —
-- can touch the tables.
-- ----------------------------------------------------------------------------
alter table employees enable row level security;
alter table attendance enable row level security;

create policy "Logged-in users can manage employees"
  on employees for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "Logged-in users can manage attendance"
  on attendance for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
