# Deleted visits still shown in the supervisor list

The `GET /journeys/plans/project/supervisor/all` response synthesized a row
for every active promoter assigned to a supervisor's branches, even when the
promoter had no active plan or visit. These rows had `planId: null`,
`journeyId: null`, `journeyStatus: null`, and `days: []`.

Read-only production queries on November 8, 2026 confirmed this for supervisor
Bashar Ahmed Taib (`gte-sup2`) in gatemea. Ahmed Hasan (`gate-051`, Saco Dhran)
and Mohssen Baheshwen (`gate-028`, Extra Azizia KS3) were still assigned to his
branches, but neither had an active plan. Ahmed's November 8 journey was
inactive; Mohssen had no journey on or after that date. Ahmed also had a
separate active November 9 journey. No records were modified during diagnosis.

The controller now builds the response from active plans and actual unplanned
journeys, without inventing rows solely from branch assignments. Active plans
remain visible before daily journey generation. Existing historical attendance,
authorization, and deletion behavior are unchanged. No migration, environment
change, or mobile release is required.

Regression coverage in `src/journey/supervisor-plan-list.spec.ts` reproduces the
empty synthetic card before the fix and verifies its removal, preservation of
an active plan, and preservation of a real unplanned visit.

Local verification: the three regression tests, TypeScript checking, direct
Nest compilation, scoped ESLint with an isolated syntax/control-flow config,
test formatting, and diff whitespace checks passed. The full suite has 360
passing, 15 skipped, and 15 failing tests. All 15 failures were reproduced in a
scratch baseline with the original controller, with identical failed test names.
The executable legacy ESLint configuration and `init`
build wrapper were not run.

Delivery status: local changes only; no production deployment or data changes.
