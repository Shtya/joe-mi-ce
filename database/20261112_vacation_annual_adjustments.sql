-- Manual annual corrections expire with their contract period; rerunnable.
BEGIN;
CREATE TABLE IF NOT EXISTS vacation_annual_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  days numeric(10,4) NOT NULL CHECK (days <> 0),
  granted_by uuid NOT NULL REFERENCES users(id),
  reason text NOT NULL CHECK (length(trim(reason)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS vacation_annual_adjustments_user_period_idx
  ON vacation_annual_adjustments(user_id, period_start) WHERE deleted_at IS NULL;
COMMIT;
