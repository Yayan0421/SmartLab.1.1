-- =====================================================================
-- SMARTLAB migration 004
-- Stores the public URL of a user's profile picture.
--
-- The image itself lives in Supabase Storage (the "avatars" bucket), not
-- in this table: a database row is the wrong place for binary data, and a
-- URL keeps every user query small.
-- Safe to re-run.
-- =====================================================================

alter table users add column if not exists avatar_url text;
