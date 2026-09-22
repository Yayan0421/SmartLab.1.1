-- A receipt belongs to an arrival, not to a row.
--
-- Migration 006 made receipt_no unique, on the assumption that one booking
-- means one person at one machine. A member of staff reserving a class set
-- breaks that: they present their card once, and every machine in the batch
-- is checked in together under a single receipt — so the same receipt_no now
-- appears on every row of that batch, and the unique index refuses it.
--
-- The index becomes an ordinary one. It exists to find a receipt quickly,
-- which is what the administrator's receipt list does; uniqueness was never
-- what it was for.

drop index if exists bookings_receipt_no_key;

create index if not exists bookings_receipt_no_idx on bookings (receipt_no);
