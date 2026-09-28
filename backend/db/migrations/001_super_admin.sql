-- =====================================================================
-- 001_super_admin
-- Adds the super_admin role above admin.
--
--   super_admin -> admin -> faculty / student
--
-- RUN THE TWO STEPS SEPARATELY.
--
-- PostgreSQL will not let a transaction use an enum value it added
-- itself, and the Supabase SQL editor wraps whatever you run in one
-- transaction. Running both steps together fails with
-- "unsafe use of new value of enum type user_role".
--
-- So: paste STEP 1, press Run, wait for success. Then clear the editor,
-- paste STEP 2, press Run. Both are safe to run more than once.
-- =====================================================================


-- ---------------------------------------------------------------------
-- STEP 1 - run this on its own, first.
-- ---------------------------------------------------------------------
alter type user_role add value if not exists 'super_admin';


-- ---------------------------------------------------------------------
-- STEP 2 - run this after step 1 has succeeded.
-- ---------------------------------------------------------------------
insert into roles (name, description) values
  ('super_admin', 'Owner of the system: manages administrators, system settings and audit logs'),
  ('admin',       'Day-to-day laboratory management: computers, bookings, monitoring, energy and non-admin users')
on conflict (name) do update set description = excluded.description;
