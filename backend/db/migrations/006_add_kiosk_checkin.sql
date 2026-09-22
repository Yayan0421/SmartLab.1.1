-- =====================================================================
-- SMARTLAB migration 006
-- Self-service kiosk: check-in, verification photo and receipts.
--
-- A booking is a promise; a check-in is the moment it is honoured. Keeping
-- them on the same row means the session clock, the receipt and the
-- no-show rule all read from one place.
-- Safe to re-run.
-- =====================================================================

alter table bookings add column if not exists checked_in_at timestamptz;
alter table bookings add column if not exists checked_out_at timestamptz;
alter table bookings add column if not exists check_in_photo_url text;
alter table bookings add column if not exists receipt_no text;

-- The kiosk looks a receipt up when reprinting, and the admin table lists
-- today's check-ins.
create unique index if not exists bookings_receipt_no_key on bookings (receipt_no);
create index if not exists bookings_checked_in_idx on bookings (checked_in_at desc);
