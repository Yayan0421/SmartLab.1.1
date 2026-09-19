-- =====================================================================
-- SMARTLAB migration 003
-- Adds the year level / degree a user belongs to.
--
-- The programme itself reuses the existing `department` column rather than
-- adding a near-duplicate: "which department you belong to" and "which
-- programme you are in" are the same fact here.
-- Safe to re-run.
-- =====================================================================

alter table users add column if not exists course text;

-- Reports group by programme and year level.
create index if not exists users_course_idx on users (course);
