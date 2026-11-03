## Plan-based attendance policy deployed — 2026-11-03

Enabled allowAttendanceFromAnyProjectLocation on all 91 Inatural plans and 364 journeys. The setting belongs to JourneyPlan and is copied to Journey; it is not a Shift field. Branch is optional when true, and a provided branch must belong to the same project. Plan edits update only unstarted active current/future journeys, preserving started/completed attendance. GET details/list/mobile outputs expose the boolean. The linked plan f0149981-3a6c-4dc3-84d9-079593837ae5 belongs to Taqnia and remains false.

Fresh full backup and focused backend deployment verified; other project flag values preserved. Live service workflow verification passed and test records rolled back. Deployment details: docs/plan-attendance-location-policy.md.

---

## Bashar identity resolved — 2026-11-01

User confirmed بشار المطيري (code 2347) is a different employee from existing بشار (inat#12). Created a separate active promoter with code-based login/password, Qassim planning reference النخيل بلازا القصيم, two all-week recurring plans and two current-day journeys: morning 09:00–16:00 and night 16:00–23:59 Saudi time. Original Bashar and every pre-existing account/plan were preserved. Total: 53 promoter accounts plus admin, 90 recurring plans. Workbook updated; no pending roster entries. Fresh full backup verified at /var/www/joe-mi-ce/backups/inatural-roster-2026-11-01T18-49-01-723Z/database.dump.

---

## Roster addition — 2026-11-01

Added 14 employees, 28 recurring plans and 28 current-day journeys. Updated 27 matched accounts to use inat#<Excel code> for both username and initial password, preserving leading zeros, and full source names. New employees have morning and night shifts on all seven days. Existing schedules are unchanged. Planned branches use an existing branch in the source city; actual attendance still resolves any project branch within 300m.

52 promoter accounts plus the existing admin; 88 recurring plans. Bashar Al-Mutairi (Qassim, code 2347) is pending identity confirmation against existing Bashar (inat#12, Dhahran); neither account creation nor reassignment was guessed. Four source codes marked Check were copied exactly and marked for review in the account workbook.

Fresh verified backup: /var/www/joe-mi-ce/backups/inatural-roster-2026-11-01T18-34-09-576Z/database.dump (43,301,619 bytes; SHA256 2bd278d1a560d999eefa710075c17a9c9e4394e61bd7ed55077fb632b791eb62). Dry run and post-commit rerun passed; rerun creates/updates zero records. Other projects and unmatched users preserved. No application code deployment required.

---

# Inatural onboarding — completed

The approved project data has been committed on Joemi and the backend changes deployed and live verified. 38 employee accounts, 27 branches at 300 m, 24 products, seven categories, one brand, three shifts, 60 plans and current-day journeys, and 648 product/branch links were verified. The existing project admin was preserved. Weekdays initially include all seven days.

Project-only attendance records the actual branch on the shift journey while its plan preserves the scheduled branch. Checkout retains the first check-in branch. Generation/recovery avoids duplicate journeys after attendance changes the actual branch. Far-location HTTP errors contain nearest branch name and distance in Arabic/English. Promotional pricing rounds each unit first, making the approved box 99 and ten units 990; other projects retain legacy calculations.

Passwords were generated and Argon2-hashed on the destination. No credential workbook or plaintext-password payload was transferred. The user explicitly approved the sanitized roster and code transfer to Joemi after automatic-review rejection.

Full database backup: `/var/www/joe-mi-ce/backups/before-inatural13-preview-2026-10-31T21-41-02-603Z.dump`, 42,896,942 bytes, SHA-256 `9ac6049c2d1e0a18212a90a858a0a9bad3b81c5cd2b687d01a177acb51633fcd`; archive index verified, no test restore. Code rollback copies are in `inatural-code-20261031T215534Z` and `inatural-code-20261031T220029Z` under the same backups directory.

Direct compilation and TypeScript passed, and 63 focused tests passed. Full suite: 280 passed, 10 skipped, 15 failed in six suites; all 15 failures were reproduced on unchanged HEAD. Limited lint checks passed using a temporary flat config; repository init and legacy lint wrappers were not executed.

Actual branch recording and checkout were verified against live records in a rolled-back transaction with notifications disabled; no permanent test attendance remained. Real first/last account login and a deployed HTTP 400 nearest-branch response succeeded. A rollback-only import rerun created zero new records, confirming idempotency. HTTP health recovered after restarting only ce-api-back. Frontends and unrelated feedback changes were not deployed. A real mobile-device/GPS UI test was not performed. No schema migrations or Git push were performed.

On 2026-11-01, all 27 Inatural branch radii and its project-only attendance validator were updated to 300 meters. A fresh full database/code backup was taken; 58 focused tests and compilation passed. Live verification accepted an approximately 222-meter test distance, rejected beyond 300 m, and confirmed the deployed HTTP 400 response advertises 300 m. Other project branch radii were compared before/after and remained unchanged. Backup: `/var/www/joe-mi-ce/backups/inatural-radius300-2026-11-01T06-49-49-970Z`.
