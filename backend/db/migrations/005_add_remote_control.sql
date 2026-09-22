-- =====================================================================
-- SMARTLAB migration 005
-- Remote control of laboratory workstations.
--
-- A browser cannot reach into a PC, so the agent running on each machine
-- polls for work and reports back. Commands therefore live in a table:
-- the administrator queues one, the agent claims it, runs it, and records
-- the outcome. Nothing is ever executed from the browser directly.
-- Safe to re-run.
-- =====================================================================

do $enum$ begin
  create type command_state as enum ('PENDING', 'SENT', 'DONE', 'FAILED', 'EXPIRED');
exception when duplicate_object then null; end $enum$;

create table if not exists computer_commands (
  id           uuid primary key default gen_random_uuid(),
  computer_id  uuid not null references computers (id) on delete cascade,
  -- shutdown | restart | lock | unlock | message | wake | screenshot
  action       text not null,
  payload      jsonb not null default '{}'::jsonb,
  status       command_state not null default 'PENDING',
  issued_by    uuid references users (id) on delete set null,
  issued_at    timestamptz not null default now(),
  claimed_at   timestamptz,
  finished_at  timestamptz,
  result       text
);

-- The agent's poll: "anything pending for me?"
create index if not exists commands_pending_idx on computer_commands (computer_id, status, issued_at);
create index if not exists commands_issued_idx  on computer_commands (issued_at desc);

-- Latest desktop capture, one row per machine. The image itself lives in
-- Supabase Storage; keeping only a URL stops this table growing heavy.
create table if not exists computer_screens (
  computer_id  uuid primary key references computers (id) on delete cascade,
  image_url    text not null,
  width        integer,
  height       integer,
  captured_at  timestamptz not null default now()
);

create index if not exists screens_captured_idx on computer_screens (captured_at desc);

-- Wake-on-LAN needs the network card address, and the agent reports who is
-- signed in at the machine.
alter table computers add column if not exists mac_address text;
alter table computers add column if not exists logged_in_user text;
alter table computers add column if not exists is_locked boolean not null default false;

alter table computer_commands enable row level security;
alter table computer_screens  enable row level security;
