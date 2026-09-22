-- =====================================================================
-- SMARTLAB - Smart Computer Management System
-- Supabase PostgreSQL schema
-- Run this file in the Supabase SQL editor (or via psql) before seeding.
-- Safe to re-run: every object is created IF NOT EXISTS.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Enumerated types
-- ---------------------------------------------------------------------
do $enum$ begin
  create type user_role as enum ('admin', 'faculty', 'student');
exception when duplicate_object then null; end $enum$;

do $enum$ begin
  create type user_status as enum ('active', 'inactive', 'suspended');
exception when duplicate_object then null; end $enum$;

do $enum$ begin
  create type computer_state as enum ('AVAILABLE', 'IN_USE', 'OFFLINE', 'MAINTENANCE', 'RESERVED');
exception when duplicate_object then null; end $enum$;

do $enum$ begin
  create type booking_state as enum ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED', 'EXPIRED');
exception when duplicate_object then null; end $enum$;

-- ---------------------------------------------------------------------
-- roles (reference table - descriptive metadata for the role enum)
-- ---------------------------------------------------------------------
create table if not exists roles (
  id          serial primary key,
  name        user_role not null unique,
  description text not null default '',
  created_at  timestamptz not null default now()
);

insert into roles (name, description) values
  ('admin',   'Full system management, monitoring, energy and audit access'),
  ('faculty', 'Can book computers and manage their own profile'),
  ('student', 'Can book computers and manage their own profile')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------
create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  full_name     text not null,
  email         text not null,
  password_hash text not null,
  role          user_role not null default 'student',
  status        user_status not null default 'active',
  department    text,
  id_number     text,
  phone         text,
  -- `department` holds the programme (e.g. Computer Engineering) and
  -- `course` the degree and year level (e.g. BSCpE - 2nd Year).
  course        text,
  -- Public URL of the profile picture; the file lives in Supabase Storage.
  avatar_url    text,
  qr_code       text,
  last_login_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Emails are normalised to lowercase by the API; the index enforces one
-- account per address regardless of casing.
create unique index if not exists users_email_key on users (lower(email));
create index if not exists users_role_idx       on users (role);
create index if not exists users_status_idx     on users (status);
create index if not exists users_created_at_idx on users (created_at desc);
create index if not exists users_full_name_idx  on users (lower(full_name));
-- Scanned at the laboratory to identify a student or faculty member.
create unique index if not exists users_qr_code_key on users (qr_code);
create index if not exists users_course_idx on users (course);

-- ---------------------------------------------------------------------
-- laboratories
-- ---------------------------------------------------------------------
create table if not exists laboratories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  building    text,
  room_number text,
  capacity    integer not null default 0 check (capacity >= 0),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- computers
-- ---------------------------------------------------------------------
create table if not exists computers (
  id               uuid primary key default gen_random_uuid(),
  computer_number  integer not null,
  name             text not null,
  laboratory_id    uuid references laboratories (id) on delete set null,
  ip_address       text,
  operating_system text,
  specs            text,
  status           computer_state not null default 'AVAILABLE',
  is_bookable      boolean not null default true,
  current_user_id  uuid references users (id) on delete set null,
  last_seen_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (laboratory_id, computer_number)
);

create index if not exists computers_status_idx     on computers (status);
create index if not exists computers_laboratory_idx on computers (laboratory_id);
create index if not exists computers_name_idx       on computers (lower(name));

-- ---------------------------------------------------------------------
-- computer_status (latest telemetry snapshot, one row per computer)
-- ---------------------------------------------------------------------
create table if not exists computer_status (
  id             uuid primary key default gen_random_uuid(),
  computer_id    uuid not null unique references computers (id) on delete cascade,
  cpu_usage      numeric(5,2) not null default 0 check (cpu_usage >= 0 and cpu_usage <= 100),
  ram_usage      numeric(5,2) not null default 0 check (ram_usage >= 0 and ram_usage <= 100),
  disk_usage     numeric(5,2) not null default 0 check (disk_usage >= 0 and disk_usage <= 100),
  temperature    numeric(5,2) not null default 0,
  uptime_seconds bigint not null default 0,
  is_online      boolean not null default false,
  heartbeat_at   timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists computer_status_computer_idx  on computer_status (computer_id);
create index if not exists computer_status_heartbeat_idx on computer_status (heartbeat_at desc);

-- ---------------------------------------------------------------------
-- bookings
-- ---------------------------------------------------------------------
create table if not exists bookings (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references users (id) on delete cascade,
  computer_id    uuid not null references computers (id) on delete cascade,
  booking_date   date not null,
  start_time     time not null,
  end_time       time not null,
  purpose        text not null default '',
  subject        text,
  -- Set when several machines are reserved in one action, so the rows can
  -- be shown and approved as a single booking.
  batch_id       uuid,
  status         booking_state not null default 'PENDING',
  approved_by    uuid references users (id) on delete set null,
  approved_at    timestamptz,
  decision_note  text,
  cancelled_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint bookings_time_order check (start_time < end_time)
);

create index if not exists bookings_user_idx       on bookings (user_id);
create index if not exists bookings_computer_idx   on bookings (computer_id);
create index if not exists bookings_date_idx       on bookings (booking_date desc);
create index if not exists bookings_status_idx     on bookings (status);
create index if not exists bookings_subject_idx    on bookings (subject);
create index if not exists bookings_batch_idx      on bookings (batch_id);
create index if not exists bookings_created_at_idx on bookings (created_at desc);
-- the conflict lookup: same machine, same day, active states
create index if not exists bookings_conflict_idx   on bookings (computer_id, booking_date, status);

-- ---------------------------------------------------------------------
-- schedules (recurring laboratory reservations / class blocks)
-- ---------------------------------------------------------------------
create table if not exists schedules (
  id             uuid primary key default gen_random_uuid(),
  laboratory_id  uuid not null references laboratories (id) on delete cascade,
  title          text not null,
  day_of_week    smallint not null check (day_of_week between 0 and 6),
  start_time     time not null,
  end_time       time not null,
  faculty_id     uuid references users (id) on delete set null,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint schedules_time_order check (start_time < end_time)
);

create index if not exists schedules_lab_idx on schedules (laboratory_id, day_of_week);

-- ---------------------------------------------------------------------
-- energy_readings (high volume - time series)
-- ---------------------------------------------------------------------
create table if not exists energy_readings (
  id           bigserial primary key,
  computer_id  uuid not null references computers (id) on delete cascade,
  voltage      numeric(7,2) not null default 0,
  current_amp  numeric(7,3) not null default 0,
  power_watt   numeric(9,2) not null default 0,
  energy_kwh   numeric(12,5) not null default 0,
  temperature  numeric(5,2),
  recorded_at  timestamptz not null default now()
);

create index if not exists energy_computer_idx on energy_readings (computer_id);
create index if not exists energy_recorded_idx on energy_readings (recorded_at desc);
create index if not exists energy_lookup_idx   on energy_readings (computer_id, recorded_at desc);

-- ---------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------
create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users (id) on delete cascade,
  title      text not null,
  message    text not null default '',
  type       text not null default 'info',
  link       text,
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx   on notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on notifications (user_id, is_read);

-- ---------------------------------------------------------------------
-- audit_logs
-- ---------------------------------------------------------------------
create table if not exists audit_logs (
  id          bigserial primary key,
  actor_id    uuid references users (id) on delete set null,
  actor_email text,
  action      text not null,
  entity      text not null,
  entity_id   text,
  details     jsonb not null default '{}'::jsonb,
  ip_address  text,
  created_at  timestamptz not null default now()
);

create index if not exists audit_actor_idx   on audit_logs (actor_id);
create index if not exists audit_created_idx on audit_logs (created_at desc);
create index if not exists audit_entity_idx  on audit_logs (entity, entity_id);

-- ---------------------------------------------------------------------
-- system_settings (key/value configuration)
-- ---------------------------------------------------------------------
create table if not exists system_settings (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  description text not null default '',
  updated_at  timestamptz not null default now()
);

insert into system_settings (key, value, description) values
  ('booking', '{"max_active_per_user":3,"max_hours_per_booking":4,"advance_days":14,"auto_approve_faculty":true,"auto_approve_student":false}', 'Booking policy limits'),
  ('energy',  '{"rate_per_kwh":11.5,"currency":"PHP"}', 'Energy tariff used for cost estimates'),
  ('general', '{"site_name":"SMARTLAB","offline_after_seconds":120}', 'General system configuration')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------
create or replace function set_updated_at() returns trigger as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$ language plpgsql;

do $trg$
declare t text;
begin
  foreach t in array array['users','laboratories','computers','computer_status','bookings','schedules']
  loop
    execute format('drop trigger if exists trg_%1$s_updated_at on %1$s', t);
    execute format('create trigger trg_%1$s_updated_at before update on %1$s for each row execute function set_updated_at()', t);
  end loop;
end $trg$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- The API authenticates with the service_role key and enforces RBAC in
-- Express, so RLS is enabled with no permissive policies: the anon key
-- can read nothing directly from the browser.
-- ---------------------------------------------------------------------
alter table users           enable row level security;
alter table laboratories    enable row level security;
alter table computers       enable row level security;
alter table computer_status enable row level security;
alter table bookings        enable row level security;
alter table schedules       enable row level security;
alter table energy_readings enable row level security;
alter table notifications   enable row level security;
alter table audit_logs      enable row level security;
alter table system_settings enable row level security;
