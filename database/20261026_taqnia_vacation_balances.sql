-- Apply before deploying the vacation balance code. Rerunnable, no balance reset.
BEGIN;

CREATE TABLE IF NOT EXISTS vacation_balance_accounts (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  joining_date date NOT NULL,
  period_start date NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vacation_balance_period_after_joining CHECK (period_start >= joining_date)
);
CREATE INDEX IF NOT EXISTS vacation_balance_accounts_project_idx ON vacation_balance_accounts(project_id);

CREATE TABLE IF NOT EXISTS vacation_compensatory_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES vacation_balance_accounts(user_id) ON DELETE CASCADE,
  days numeric(10,4) NOT NULL CHECK (days > 0 AND days <= 365),
  granted_by uuid NOT NULL REFERENCES users(id),
  reason text NOT NULL CHECK (length(trim(reason)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS vacation_compensatory_credits_user_idx ON vacation_compensatory_credits(user_id);

ALTER TABLE vacation_dates ADD COLUMN IF NOT EXISTS balance_period_start date;
ALTER TABLE vacation_dates ADD COLUMN IF NOT EXISTS annual_balance_days numeric(10,4);
ALTER TABLE vacation_dates ADD COLUMN IF NOT EXISTS compensatory_balance_days numeric(10,4);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vacation_dates_balance_allocation_check' AND conrelid = 'vacation_dates'::regclass) THEN
    ALTER TABLE vacation_dates ADD CONSTRAINT vacation_dates_balance_allocation_check CHECK (
      (balance_period_start IS NULL AND annual_balance_days IS NULL AND compensatory_balance_days IS NULL)
      OR (balance_period_start IS NOT NULL AND annual_balance_days IS NOT NULL AND compensatory_balance_days IS NOT NULL
        AND annual_balance_days >= 0 AND compensatory_balance_days >= 0
        AND annual_balance_days + compensatory_balance_days = 1)
    );
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS vacations_balance_user_idx ON vacations(user_id) WHERE deleted_at IS NULL AND overall_status IN ('pending', 'approved');
CREATE INDEX IF NOT EXISTS vacation_dates_balance_vacation_idx ON vacation_dates(vacation_id) WHERE deleted_at IS NULL;

COMMIT;
