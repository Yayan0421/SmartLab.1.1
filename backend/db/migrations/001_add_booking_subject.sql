-- =====================================================================
-- SMARTLAB migration 001
-- Adds the laboratory subject a booking belongs to.
-- Safe to re-run.
-- =====================================================================

alter table bookings add column if not exists subject text;

-- Reports and the admin booking table filter by subject.
create index if not exists bookings_subject_idx on bookings (subject);

-- Existing rows predate the field; label them so nothing reads as blank.
update bookings set subject = 'Unspecified' where subject is null;
