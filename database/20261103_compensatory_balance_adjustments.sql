-- Preserve the credit history while allowing audited decreases via PUT /users/:id.
-- The grant endpoint still accepts only positive grants up to 365 days.
BEGIN;
ALTER TABLE vacation_compensatory_credits
  DROP CONSTRAINT IF EXISTS vacation_compensatory_credits_days_check;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'vacation_compensatory_credits'::regclass
      AND conname = 'vacation_compensatory_credits_nonzero_days_check'
  ) THEN
    ALTER TABLE vacation_compensatory_credits
      ADD CONSTRAINT vacation_compensatory_credits_nonzero_days_check CHECK (days <> 0);
  END IF;
END $$;
COMMIT;
