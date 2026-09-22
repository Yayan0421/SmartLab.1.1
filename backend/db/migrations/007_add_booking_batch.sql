-- =====================================================================
-- SMARTLAB migration 007
-- Groups the rows created by one multi-computer reservation.
--
-- Booking a class of 25 machines writes 25 rows, because each machine is
-- reserved separately and can be cancelled separately. But it is one act
-- by one person, and an administrator should see and approve it as one.
-- Safe to re-run.
-- =====================================================================

alter table bookings add column if not exists batch_id uuid;

-- The admin list groups by this, and batch approvals filter on it.
create index if not exists bookings_batch_idx on bookings (batch_id);
