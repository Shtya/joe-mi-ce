-- Compensatory credits do not require an annual account or a joining date.
-- Preserve all existing credits and the administrator FK. Rerunnable.
BEGIN;
SET LOCAL lock_timeout = '5s';
LOCK TABLE vacation_compensatory_credits IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
  old_constraint record;
  user_column smallint;
BEGIN
  SELECT attnum INTO STRICT user_column
  FROM pg_attribute
  WHERE attrelid = 'vacation_compensatory_credits'::regclass
    AND attname = 'user_id' AND NOT attisdropped;

  -- Handle both SQL-created and TypeORM-generated constraint names.
  FOR old_constraint IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'vacation_compensatory_credits'::regclass
      AND contype = 'f' AND conkey = ARRAY[user_column]
      AND confrelid = 'vacation_balance_accounts'::regclass
  LOOP
    EXECUTE format('ALTER TABLE vacation_compensatory_credits DROP CONSTRAINT %I', old_constraint.conname);
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'vacation_compensatory_credits'::regclass
      AND contype = 'f' AND conkey = ARRAY[user_column]
      AND confrelid = 'users'::regclass
  ) THEN
    ALTER TABLE vacation_compensatory_credits
      ADD CONSTRAINT vacation_compensatory_credits_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

COMMIT;
