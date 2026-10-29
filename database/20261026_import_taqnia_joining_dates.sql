-- Book5.xlsx / Sheet1 / C2:C67 usernames, L2:L67 joining dates.
-- Only usernames and joining dates are imported. Vacation=21 is not an opening balance.
BEGIN;
CREATE TEMP TABLE taqnia_joining_import (username text PRIMARY KEY, joining_date date NOT NULL) ON COMMIT DROP;
INSERT INTO taqnia_joining_import (username, joining_date) VALUES
  ('AEC-04', '2026-05-12'::date),
  ('AEC-232', '2026-06-11'::date),
  ('AEC-219', '2026-05-15'::date),
  ('AEC-195', '2026-04-25'::date),
  ('AEC-47', '2026-05-21'::date),
  ('AEC-189', '2026-04-27'::date),
  ('AEC-35', '2026-04-13'::date),
  ('AEC-159', '2026-04-07'::date),
  ('AEC-38', '2026-04-27'::date),
  ('AEC-40', '2026-04-27'::date),
  ('AEC-41', '2026-04-27'::date),
  ('AEC-37', '2026-04-27'::date),
  ('AEC-62', '2026-04-27'::date),
  ('AEC-63', '2026-04-27'::date),
  ('AEC-130', '2026-04-27'::date),
  ('AEC-183', '2026-04-16'::date),
  ('AEC-60', '2026-04-13'::date),
  ('AEC-75', '2026-04-27'::date),
  ('AEC-74', '2026-04-27'::date),
  ('AEC-80', '2026-04-23'::date),
  ('AEC-70', '2026-04-27'::date),
  ('AEC-97', '2026-04-27'::date),
  ('AEC-163', '2026-04-17'::date),
  ('AEC-135', '2026-04-27'::date),
  ('AEC-65', '2026-04-27'::date),
  ('AEC-66', '2026-04-10'::date),
  ('AEC-103', '2026-04-13'::date),
  ('AEC-136', '2026-04-25'::date),
  ('AEC-187', '2026-04-27'::date),
  ('AEC-68', '2026-04-23'::date),
  ('AEC-99', '2026-04-17'::date),
  ('AEC-69', '2026-04-14'::date),
  ('AEC-204', '2026-04-27'::date),
  ('AEC-201', '2026-04-26'::date),
  ('AEC-93', '2026-04-17'::date),
  ('AEC-164', '2026-04-20'::date),
  ('AEC-143', '2026-04-23'::date),
  ('AEC-106', '2026-04-14'::date),
  ('AEC-226', '2026-06-08'::date),
  ('AEC-150', '2026-04-10'::date),
  ('AEC-280', '2026-09-28'::date),
  ('AEC-118', '2026-04-23'::date),
  ('AEC-234', '2026-06-17'::date),
  ('AEC-112', '2026-04-29'::date),
  ('AEC-113', '2026-04-10'::date),
  ('AEC-125', '2026-04-23'::date),
  ('AEC-193', '2026-04-13'::date),
  ('AEC-121', '2026-08-06'::date),
  ('AEC-161', '2026-04-06'::date),
  ('AEC-24', '2026-10-14'::date),
  ('AEC-01', '2026-01-14'::date),
  ('AEC-174', '2026-04-26'::date),
  ('AEC-02', '2026-01-01'::date),
  ('AEC-17', '2026-04-15'::date),
  ('AEC-145', '2026-05-03'::date),
  ('AEC-220', '2026-05-13'::date),
  ('AEC-86', '2026-04-02'::date),
  ('AEC-91', '2026-04-05'::date),
  ('AEC-155', '2026-04-02'::date),
  ('AEC-107', '2026-05-04'::date),
  ('AEC-126', '2026-05-21'::date),
  ('AEC-166', '2026-07-04'::date),
  ('AEC-182', '2026-04-15'::date),
  ('AEC-115', '2026-04-13'::date),
  ('AEC-119', '2025-02-25'::date),
  ('AEC-152', '2026-07-22'::date);
DO $$
DECLARE target_project uuid; bad_matches integer;
BEGIN
  IF (SELECT count(*) FROM project WHERE lower(trim(name)) = 'taqnia' AND deleted_at IS NULL) <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one active Taqnia project';
  END IF;
  SELECT id INTO target_project FROM project WHERE lower(trim(name)) = 'taqnia' AND deleted_at IS NULL;
  SELECT count(*) INTO bad_matches FROM taqnia_joining_import i
  WHERE (SELECT count(*) FROM users u LEFT JOIN branches b ON b.id = u."branchId"
         WHERE u.username = i.username AND u.deleted_at IS NULL
           AND COALESCE(u.project_id::uuid, b."projectId") = target_project) <> 1;
  IF bad_matches > 0 THEN RAISE EXCEPTION '% workbook rows do not uniquely match Taqnia employees; no dates imported', bad_matches; END IF;
  IF EXISTS (SELECT 1 FROM vacation_balance_accounts a JOIN users u ON u.id=a.user_id
             JOIN taqnia_joining_import i ON i.username=u.username
             WHERE a.project_id <> target_project OR a.joining_date <> i.joining_date) THEN
    RAISE EXCEPTION 'An existing joining date or account project conflicts with Book5; review before importing';
  END IF;
  INSERT INTO vacation_balance_accounts(user_id, project_id, joining_date, period_start)
  SELECT u.id, target_project, i.joining_date, i.joining_date
  FROM taqnia_joining_import i JOIN users u ON u.username=i.username
  LEFT JOIN branches b ON b.id=u."branchId"
  WHERE u.deleted_at IS NULL AND COALESCE(u.project_id::uuid,b."projectId")=target_project
  ON CONFLICT(user_id) DO NOTHING;
END $$;
-- A balance read / daily cron advances period_start to the current contract year.
SELECT count(*) AS matched_imported_accounts FROM vacation_balance_accounts a
JOIN users u ON u.id=a.user_id JOIN taqnia_joining_import i ON i.username=u.username;
COMMIT;
