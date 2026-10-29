-- Apply before deploying code that reads the per-user permission field.
-- All users start denied; provisioning explicitly enables the selected account.
BEGIN;
SET LOCAL lock_timeout = '10s';
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_grant_compensatory_leave boolean NOT NULL DEFAULT false;
COMMIT;
