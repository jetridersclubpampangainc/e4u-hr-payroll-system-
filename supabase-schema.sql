-- E4U HR & Payroll Management System v2
-- Supabase SQL setup: paste this entire file in Supabase Dashboard > SQL Editor > Run.

create extension if not exists pgcrypto;

-- 1) Core tables
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  tin text,
  sss_no text,
  philhealth_no text,
  pagibig_no text,
  contact_person text,
  contact_no text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  full_name text,
  email text,
  role text not null default 'employee' check (role in ('super_admin','hr_admin','payroll_officer','supervisor','employee')),
  status text not null default 'Active' check (status in ('Active','Inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id) on delete cascade,
  standard_days numeric(10,2) not null default 26,
  grace_minutes integer not null default 15,
  overtime_multiplier numeric(10,2) not null default 1.25,
  default_pagibig numeric(12,2) not null default 200,
  payroll_officer text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  employee_no text not null,
  last_name text not null,
  first_name text not null,
  middle_name text,
  birth_date date,
  date_hired date,
  position text,
  department text,
  status text not null default 'Active' check (status in ('Active','Inactive','Resigned','On Leave')),
  basic_salary numeric(12,2) not null default 0,
  daily_rate numeric(12,2) not null default 0,
  hourly_rate numeric(12,2) not null default 0,
  sss_no text,
  philhealth_no text,
  pagibig_no text,
  tin text,
  contact_no text,
  address text,
  emergency_contact text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, employee_no)
);

create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  schedule_date date not null,
  shift_name text,
  start_time time,
  end_time time,
  is_rest_day boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, schedule_date)
);

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  attendance_date date not null,
  time_in time,
  time_out time,
  break_minutes integer not null default 60,
  work_mode text not null default 'Office' check (work_mode in ('Office','WFH','Hybrid','Field')),
  hours_worked numeric(10,2) not null default 0,
  late_minutes integer not null default 0,
  undertime_minutes integer not null default 0,
  overtime_hours numeric(10,2) not null default 0,
  status text not null default 'Present',
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, attendance_date)
);

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  leave_type text not null,
  start_date date not null,
  end_date date not null,
  days numeric(10,2) not null default 1,
  reason text,
  status text not null default 'Pending' check (status in ('Pending','Approved','Rejected')),
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  period_label text not null,
  period_start date not null,
  period_end date not null,
  pay_date date not null,
  total_gross_pay numeric(14,2) not null default 0,
  total_deductions numeric(14,2) not null default 0,
  total_net_pay numeric(14,2) not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.payroll_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  payroll_run_id uuid not null references public.payroll_runs(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  days_worked numeric(10,2) not null default 0,
  overtime_hours numeric(10,2) not null default 0,
  late_minutes integer not null default 0,
  undertime_minutes integer not null default 0,
  basic_pay numeric(14,2) not null default 0,
  overtime_pay numeric(14,2) not null default 0,
  gross_pay numeric(14,2) not null default 0,
  late_deduction numeric(14,2) not null default 0,
  undertime_deduction numeric(14,2) not null default 0,
  sss numeric(14,2) not null default 0,
  philhealth numeric(14,2) not null default 0,
  pagibig numeric(14,2) not null default 0,
  withholding_tax numeric(14,2) not null default 0,
  cash_advance numeric(14,2) not null default 0,
  total_deductions numeric(14,2) not null default 0,
  net_pay numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (payroll_run_id, employee_id)
);

-- 2) Helpful indexes
create index if not exists idx_profiles_company_id on public.profiles(company_id);
create index if not exists idx_employees_company_id on public.employees(company_id);
create index if not exists idx_schedules_company_date on public.schedules(company_id, schedule_date);
create index if not exists idx_attendance_company_date on public.attendance_records(company_id, attendance_date);
create index if not exists idx_leaves_company_status on public.leave_requests(company_id, status);
create index if not exists idx_payroll_runs_company on public.payroll_runs(company_id);
create index if not exists idx_payroll_items_run on public.payroll_items(payroll_run_id);

-- 3) Security helper functions
create or replace function public.current_user_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from public.profiles where id = auth.uid()
$$;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_company_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() in ('super_admin','hr_admin','payroll_officer'), false)
$$;

create or replace function public.is_payroll_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() in ('super_admin','payroll_officer'), false)
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'super_admin', false)
$$;

-- 4) Automatic profile creation after Auth signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    case when (select count(*) from public.profiles) = 0 then 'super_admin' else 'employee' end,
    'Active'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- 5) Initial setup RPC: creates company, settings, and links current user as super admin.
create or replace function public.create_company_for_current_user(
  p_name text,
  p_address text default null,
  p_tin text default null,
  p_sss_no text default null,
  p_philhealth_no text default null,
  p_pagibig_no text default null,
  p_contact_person text default null,
  p_contact_no text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if exists (select 1 from public.profiles where id = auth.uid() and company_id is not null) then
    raise exception 'User already belongs to a company';
  end if;

  insert into public.companies (name, address, tin, sss_no, philhealth_no, pagibig_no, contact_person, contact_no, created_by)
  values (p_name, p_address, p_tin, p_sss_no, p_philhealth_no, p_pagibig_no, p_contact_person, p_contact_no, auth.uid())
  returning id into v_company_id;

  update public.profiles
  set company_id = v_company_id,
      role = 'super_admin',
      updated_at = now()
  where id = auth.uid();

  insert into public.settings (company_id, payroll_officer)
  values (v_company_id, coalesce(p_contact_person, 'Payroll Officer'));

  return v_company_id;
end;
$$;

-- 6) Enable Row Level Security
alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.employees enable row level security;
alter table public.schedules enable row level security;
alter table public.attendance_records enable row level security;
alter table public.leave_requests enable row level security;
alter table public.payroll_runs enable row level security;
alter table public.payroll_items enable row level security;

-- 7) Drop old policies if rerunning this script
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('companies','profiles','settings','employees','schedules','attendance_records','leave_requests','payroll_runs','payroll_items')
  LOOP
    EXECUTE format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- 8) Policies
-- Companies
create policy "companies_select_own"
on public.companies for select to authenticated
using (id = public.current_user_company_id() or created_by = auth.uid());

create policy "companies_update_admin"
on public.companies for update to authenticated
using (id = public.current_user_company_id() and public.is_company_admin())
with check (id = public.current_user_company_id() and public.is_company_admin());

-- Profiles
create policy "profiles_select_company_or_admin"
on public.profiles for select to authenticated
using (id = auth.uid() or company_id = public.current_user_company_id() or public.is_super_admin());

create policy "profiles_insert_own"
on public.profiles for insert to authenticated
with check (id = auth.uid());

create policy "profiles_update_admin"
on public.profiles for update to authenticated
using (public.is_company_admin())
with check (public.is_company_admin());

-- Settings
create policy "settings_select_company"
on public.settings for select to authenticated
using (company_id = public.current_user_company_id());

create policy "settings_insert_admin"
on public.settings for insert to authenticated
with check (company_id = public.current_user_company_id() and public.is_company_admin());

create policy "settings_update_admin"
on public.settings for update to authenticated
using (company_id = public.current_user_company_id() and public.is_company_admin())
with check (company_id = public.current_user_company_id() and public.is_company_admin());

-- Employees
create policy "employees_select_company_or_self"
on public.employees for select to authenticated
using (company_id = public.current_user_company_id() or user_id = auth.uid());

create policy "employees_insert_admin"
on public.employees for insert to authenticated
with check (company_id = public.current_user_company_id() and public.is_company_admin());

create policy "employees_update_admin"
on public.employees for update to authenticated
using (company_id = public.current_user_company_id() and public.is_company_admin())
with check (company_id = public.current_user_company_id() and public.is_company_admin());

create policy "employees_delete_admin"
on public.employees for delete to authenticated
using (company_id = public.current_user_company_id() and public.is_company_admin());

-- Schedules
create policy "schedules_select_company"
on public.schedules for select to authenticated
using (company_id = public.current_user_company_id());

create policy "schedules_write_admin"
on public.schedules for all to authenticated
using (company_id = public.current_user_company_id() and public.is_company_admin())
with check (company_id = public.current_user_company_id() and public.is_company_admin());

-- Attendance
create policy "attendance_select_company"
on public.attendance_records for select to authenticated
using (company_id = public.current_user_company_id());

create policy "attendance_write_admin"
on public.attendance_records for all to authenticated
using (company_id = public.current_user_company_id() and public.is_company_admin())
with check (company_id = public.current_user_company_id() and public.is_company_admin());

-- Leave requests
create policy "leave_select_company"
on public.leave_requests for select to authenticated
using (company_id = public.current_user_company_id());

create policy "leave_insert_company"
on public.leave_requests for insert to authenticated
with check (company_id = public.current_user_company_id());

create policy "leave_update_admin"
on public.leave_requests for update to authenticated
using (company_id = public.current_user_company_id() and public.is_company_admin())
with check (company_id = public.current_user_company_id() and public.is_company_admin());

create policy "leave_delete_admin"
on public.leave_requests for delete to authenticated
using (company_id = public.current_user_company_id() and public.is_company_admin());

-- Payroll runs and items
create policy "payroll_runs_select_company"
on public.payroll_runs for select to authenticated
using (company_id = public.current_user_company_id());

create policy "payroll_runs_write_payroll"
on public.payroll_runs for all to authenticated
using (company_id = public.current_user_company_id() and public.is_payroll_user())
with check (company_id = public.current_user_company_id() and public.is_payroll_user());

create policy "payroll_items_select_company"
on public.payroll_items for select to authenticated
using (company_id = public.current_user_company_id());

create policy "payroll_items_write_payroll"
on public.payroll_items for all to authenticated
using (company_id = public.current_user_company_id() and public.is_payroll_user())
with check (company_id = public.current_user_company_id() and public.is_payroll_user());

-- 9) Grant RPC execution
revoke all on function public.create_company_for_current_user(text,text,text,text,text,text,text,text) from public;
grant execute on function public.create_company_for_current_user(text,text,text,text,text,text,text,text) to authenticated;

-- Setup done.
