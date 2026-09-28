-- =====================================================================
-- 010_drop_mac_address
--
-- Removes the MAC address the system used to keep for every workstation.
--
-- It existed for one thing: Wake-on-LAN, the "Power on" button that sent a
-- magic packet to a machine that was switched off. That feature is gone,
-- and nothing else ever read this column.
--
-- A MAC address identifies a physical device, so the honest thing once the
-- reason for holding it disappears is to stop holding it. Dropping the
-- column removes the values with it.
--
-- Nothing depended on it: no index, no constraint, no foreign key. This is
-- one statement and it is safe to run more than once.
--
-- NOT REVERSIBLE. The values are gone once this runs. They can be
-- collected again - every agent knows its own MAC - but what was stored is
-- not coming back.
-- =====================================================================

alter table computers drop column if exists mac_address;


-- ---------------------------------------------------------------------
-- Check it landed. Should return no rows.
-- ---------------------------------------------------------------------
-- select column_name from information_schema.columns
--  where table_schema = 'public'
--    and table_name = 'computers'
--    and column_name = 'mac_address';
