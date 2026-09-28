-- =====================================================================
-- 009_rename_bookings_to_reservations
--
-- The laboratory calls these reservations, so the system does too - all
-- the way down, not just on the screen.
--
-- Every statement here is a rename. No row is read, written or moved, so
-- this is fast even on a full table and nothing can be lost in the middle
-- of it. Renames are also transactional in PostgreSQL: the whole file
-- either applies or none of it does, which is why - unlike the super
-- admin migration - this one can be pasted into the Supabase SQL editor
-- in a single go.
--
-- Deploy the matching code at the same time. Between this migration and
-- the new build, the API is looking for a table that no longer answers to
-- that name. The kiosk especially: it talks to /api/bookings today and
-- must be reloaded afterwards, not merely left open.
--
-- Safe to re-run: every step checks first and skips what is already done.
-- =====================================================================

do $rename$
begin

  -- ---------------------------------------------------------------
  -- The table itself
  -- ---------------------------------------------------------------
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'bookings') then
    alter table bookings rename to reservations;
  end if;

  -- ---------------------------------------------------------------
  -- The date column. `status` keeps its name; only its type is renamed.
  -- ---------------------------------------------------------------
  if exists (select 1 from information_schema.columns
             where table_schema = 'public'
               and table_name = 'reservations'
               and column_name = 'booking_date') then
    alter table reservations rename column booking_date to reservation_date;
  end if;

  -- ---------------------------------------------------------------
  -- The enum type behind `status`
  -- ---------------------------------------------------------------
  if exists (select 1 from pg_type where typname = 'booking_state') then
    alter type booking_state rename to reservation_state;
  end if;


  -- ---------------------------------------------------------------
  -- The updated_at trigger
  -- ---------------------------------------------------------------
  if exists (select 1 from pg_trigger where tgname = 'trg_bookings_updated_at') then
    alter trigger trg_bookings_updated_at on reservations
      rename to trg_reservations_updated_at;
  end if;

  -- ---------------------------------------------------------------
  -- The settings group, which the API exposes by key
  -- ---------------------------------------------------------------
  if exists (select 1 from system_settings where key = 'booking') then
    update system_settings
       set key = 'reservation',
           description = 'Reservation policy limits'
     where key = 'booking';
  end if;

  -- The stored JSON carries the old key name inside it, and the code now
  -- reads the new one. Settings are merged over defaults rather than
  -- replaced, so without this a laboratory that had customised its limit
  -- would silently fall back to the default of 4 hours and nobody would
  -- see an error.
  update system_settings
     set value = (value - 'max_hours_per_booking')
                 || jsonb_build_object('max_hours_per_reservation',
                                       value -> 'max_hours_per_booking')
   where key = 'reservation'
     and value ? 'max_hours_per_booking';

end
$rename$;


-- ---------------------------------------------------------------------
-- Every constraint the table carries: the primary key, the three foreign
-- keys and the check.
--
-- The foreign keys matter more than they look. PostgREST embeds a related
-- row by naming the constraint - users!reservations_user_id_fkey - and the
-- API does exactly that in six places. Rename the table without renaming
-- the constraint and every one of those queries fails, which reads as a
-- 500 with nothing obviously wrong in the code.
-- ---------------------------------------------------------------------
do $con$
declare
  c record;
begin
  for c in
    select conname
      from pg_constraint
     where conrelid = 'public.reservations'::regclass
       and conname like 'bookings%'
  loop
    execute format('alter table reservations rename constraint %I to %I',
                   c.conname,
                   replace(c.conname, 'bookings_', 'reservations_'));
  end loop;
end
$con$;


-- ---------------------------------------------------------------------
-- The indexes, including the ones added by migrations 006 and 008.
-- Done outside the block so a database missing any of them still applies
-- the rest.
-- ---------------------------------------------------------------------
do $idx$
declare
  pair text[];
begin
  foreach pair slice 1 in array array[
    ['bookings_user_idx',       'reservations_user_idx'],
    ['bookings_computer_idx',   'reservations_computer_idx'],
    ['bookings_date_idx',       'reservations_date_idx'],
    ['bookings_status_idx',     'reservations_status_idx'],
    ['bookings_subject_idx',    'reservations_subject_idx'],
    ['bookings_batch_idx',      'reservations_batch_idx'],
    ['bookings_created_at_idx', 'reservations_created_at_idx'],
    ['bookings_conflict_idx',   'reservations_conflict_idx'],
    ['bookings_receipt_no_idx', 'reservations_receipt_no_idx'],
    ['bookings_checked_in_idx', 'reservations_checked_in_idx']
  ]
  loop
    if exists (select 1 from pg_class where relname = pair[1] and relkind = 'i') then
      execute format('alter index %I rename to %I', pair[1], pair[2]);
    end if;
  end loop;
end
$idx$;


-- ---------------------------------------------------------------------
-- Check it landed. Every row should read 'reservations'.
-- ---------------------------------------------------------------------
-- select table_name from information_schema.tables
--  where table_schema = 'public' and table_name in ('bookings', 'reservations');
--
-- select indexname from pg_indexes
--  where tablename = 'reservations' order by indexname;
