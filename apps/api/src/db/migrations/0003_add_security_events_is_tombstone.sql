-- Adds is_tombstone column to security_events.
-- Tombstone rows (account.deleted audit records) carry is_tombstone=true and user_id=NULL
-- so the account purge DELETE WHERE user_id=uid AND is_tombstone=false leaves them intact.
ALTER TABLE `security_events`
  ADD COLUMN `is_tombstone` BOOLEAN NOT NULL DEFAULT false;
