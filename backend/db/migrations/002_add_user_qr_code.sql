-- =====================================================================
-- SMARTLAB migration 002
-- Gives every student and faculty member a scannable identity code.
--
-- The code is deliberately NOT the user's database id: it is an opaque
-- random value, so a printed QR reveals nothing about the system and can
-- be reissued if a card is lost, without touching the account itself.
-- Safe to re-run.
-- =====================================================================

alter table users add column if not exists qr_code text;

-- Scanning looks a user up by this value, so it must be unique and indexed.
create unique index if not exists users_qr_code_key on users (qr_code);

-- Issue a code to everyone who does not have one yet.
update users
set qr_code = 'SL-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
where qr_code is null;
