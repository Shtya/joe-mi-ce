-- Back up first. Apply before deploying the plan/journey entity changes.
BEGIN;
SET LOCAL lock_timeout = '10s';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema=current_schema() AND table_name='journey_plans'
      AND column_name='allowAttendanceFromAnyProjectLocation') THEN
    ALTER TABLE journey_plans ADD COLUMN "allowAttendanceFromAnyProjectLocation"
      boolean NOT NULL DEFAULT false;
    UPDATE journey_plans SET "allowAttendanceFromAnyProjectLocation"=true
      WHERE "projectId"='7ea269b3-058f-4475-a162-989823e78205';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema=current_schema() AND table_name='journeys'
      AND column_name='allowAttendanceFromAnyProjectLocation') THEN
    ALTER TABLE journeys ADD COLUMN "allowAttendanceFromAnyProjectLocation"
      boolean NOT NULL DEFAULT false;
    UPDATE journeys j SET "allowAttendanceFromAnyProjectLocation"=p."allowAttendanceFromAnyProjectLocation"
      FROM journey_plans p WHERE j."journeyPlanId"=p.id;
    UPDATE journeys SET "allowAttendanceFromAnyProjectLocation"=true
      WHERE "projectId"='7ea269b3-058f-4475-a162-989823e78205'
        AND "journeyPlanId" IS NULL;
  END IF;
  ALTER TABLE journey_plans ALTER COLUMN "branchId" DROP NOT NULL;
END $$;
COMMIT;
