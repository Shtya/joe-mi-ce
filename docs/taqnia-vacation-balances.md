# Taqnia employee vacation balances

This backend feature applies only to the project whose normalized name is `taqnia`. Existing vacation behavior for other projects is retained.

## Policy

- Annual entitlement is 21 days per contract year. Employees earn 1.75 days per 30-day month using the HR project's 360-day model. Accrual starts at zero on joining. July 1 through October 1 earns 5.25 days before usage.
- The contract year runs from the actual employment joining date to its anniversary. December 31 does not reset it. A February 29 joining date uses February 28 in non-leap years.
- On the anniversary, unused annual days expire and a fresh accrual period starts at zero. This does **not** grant 21 usable days immediately.
- Admin-granted compensatory credits do not accrue, expire monthly, or reset at the contract anniversary. Each grant records the administrator and reason.
- Requests use the existing `reason` field as their leave-type code. `annual_leave` uses only earned annual days. `compensatory_leave` uses only admin-granted compensatory days. Balances are never mixed. `weekend_vacation`, `weekly_leave`, `sick_leave`, `sick leave` and `permission_or_absence` do not consume either balance. Unknown legacy free-text reasons retain the annual default.
- Pending and approved requests reserve availability, including scheduled dates. Approval does not deduct twice. Rejection and deletion release reservations. Reapproval validates availability and overlaps again.
- Annual requests in another contract period cannot borrow unearned annual days or compensatory credits. A request with insufficient balance in its own type is rejected atomically.
- Historical weekly, sick and permission requests are excluded automatically. Historical annual requests count in their own contract period. Compensatory leave from before credit tracking is preserved without consuming new grants. A new compensatory request after the first grant, or an old request newly allocated/approved after that grant, consumes compensatory credit. Historical annual overuse does not consume compensatory credit. Annual debt from a completed period expires with that period.
- Employee row locks serialize requests, status changes, account edits and grants. The daily 00:05 Asia/Riyadh job refreshes each anniversary; reads and writes also refresh the period if a cron run was missed. Accrual is derived, so cron retries cannot double-credit days.

## API

Paths below are relative to the existing application API prefix. Existing authentication and vacation permissions apply, with additional employee/project authorization.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/vacations/balance/me` | Employee's balance |
| GET | `/vacations/balance/:userId` | Own balance or same-project admin view |
| PUT | `/vacations/balance/:userId/joining-date` | Project admin/super admin sets `{ "joiningDate": "2026-07-01" }` |
| POST | `/vacations/balance/:userId/compensatory` | Project admin/super admin grants `{ "days": 3, "reason": "Additional work" }` |

Grant requests are additive: submit once per intended grant. Adding credits requires the individual `canGrantCompensatoryLeave` permission in addition to project-admin access and `VACATION_UPDATE`. As of October 28, 2026, only `MAlhaj@aecksa.com` has that permission. Other project admins and super admins cannot grant compensatory credit. Employees and supervisors cannot grant credits. Joining dates cannot change while active requests have allocated balance.

Login, refresh and `/api/v1/auth/me` responses expose `canGrantCompensatoryLeave` as a boolean for the frontend. Show the grant control only when this value is `true`; the server rechecks the stored permission for every grant. It is not accepted by the public registration or user-update DTOs.

The balance response includes `joiningDate`, `periodStart`, `periodEndExclusive`, `asOf`, `annualEntitlementDays`, `accruedDays`, `annualUsedOrReservedDays`, `annualRemainingDays`, `compensatoryGrantedDays`, `compensatoryUsedOrReservedDays`, `compensatoryRemainingDays`, `pendingReservedDays` and `availableDays`.

Use `availableDays` to guide submission. `annualEntitlementDays` is a rate, not available leave. The server is authoritative. An insufficient request returns HTTP 400 with `code: "INSUFFICIENT_VACATION_BALANCE"`, numeric `availableDays`, `periodStart`, and an Arabic/English `message` selected by the existing language headers. Example: `رصيد الإجازات المتاح لديك هو 14 يومًا`.

`availableDays` is a summary total. Validate an annual selection against `annualRemainingDays`, and a compensatory selection against `compensatoryRemainingDays`. The error response includes `balanceType` and the available days for that type. Weekly leave needs no balance or registered joining date.

Example compensatory request: `POST /api/v1/vacations` with `{ "userId": "<employee UUID>", "reason": "compensatory_leave", "dates": ["2026-11-01"] }`. Use `reason: "annual_leave"` for annual leave or `reason: "weekend_vacation"` for a weekly day off. The grant endpoint remains unchanged.

Missing employment dates block Taqnia submissions with an actionable message. Set the date through the admin endpoint or the provided import.

## Migration and import

1. Back up the target database and apply `database/20261026_taqnia_vacation_balances.sql` before deploying the updated backend. The entity fields require these columns even when listing vacations from other projects.
2. Review and apply `database/20261026_import_taqnia_joining_dates.sql`. It contains only the 66 usernames and actual joining dates from Book5.xlsx Sheet1 C2:C67 and L2:L67. The workbook's Vacation=21 values, salaries, phones, IDs and other fields are not imported.
3. The import requires exactly one Taqnia project and one live Taqnia employee match for each username. Missing, ambiguous or conflicting joining-date matches abort the entire import. An identical rerun preserves existing accounts, allocations and credits.
4. Verify the 66 matches against the actual target database. Local fixture tests do not establish production matching. New Taqnia employees outside the sheet require their actual joining date through the admin endpoint.
5. Deploy the backend and integrate the balance/grant/date controls in the consuming frontend/mobile client. No frontend repository was modified by this backend change.

## Verification

Run unit tests with `node node_modules/jest/bin/jest.js --runInBand src/vacation`.

The opt-in PostgreSQL tests require a **disposable** local database named `taqnia_vacation_test` on `/tmp` Unix sockets, port 55439, owned by `mostafa`. They recreate that database's public schema. Run `TAQNIA_TEST_POSTGRES=1 node node_modules/jest/bin/jest.js --runInBand --runTestsByPath src/vacation/vacation-balance.integration.spec.ts`. They never use the application's database environment variables. The business clock is fixed to October 26, 2026 for repeatability.

The integration tests cover migrations from the previous schema, reruns, concurrent overspending, approval idempotency, rejection/deletion release, reapproval overlaps, anniversary expiry, persistent compensatory credits and the 66-row import/conflict rollback.

## Production deployment — October 26, 2026

- Deployed to `/var/www/joe-mi-ce/backend` on the Joemi server; restarted only `ce-api-back`. Existing feedback source changes and both frontend processes were preserved.
- A full readable database backup and previous code/build are retained in `/root/deployments/taqnia-vacation-20261026/backup` on the server.
- Schema migration applied; all 66 workbook usernames matched Taqnia uniquely and their joining dates were imported. No fixed Vacation=21 opening balances were imported.
- Fifteen focused unit tests passed on the server. The direct TypeScript compiler and direct Nest CLI succeeded. The server's npm build wrapper returned a silent exit code 1; use explicit compiler checks when diagnosing that wrapper.
- Production compiled files use relative module paths. An initial activation missed that convention and failed to start; the previous build was restored, staged aliases were resolved and the complete application module was loaded successfully before retrying. The corrected build is running.
- Verified HTTP 200 from local and public authenticated balance endpoints and HTTP 401 without authentication. The actual API prefix is `/api/v1`.
- Invoked the deployed anniversary refresh successfully for all 66 accounts. Verified the deployed cron metadata: `0 5 0 * * *`, `Asia/Riyadh`, `waitForCompletion: true`. A future scheduled invocation has not yet occurred during this verification.
- Live example verified joining date May 12, 2026 and contract end May 12, 2027. Historical annual usage can leave no current availability; the server does not grant 21 days upfront.
- No frontend UI changes or Git push were included in this backend deployment.

## Leave-type correction — October 26, 2026

The existing client already identifies the leave type through `reason`. Production investigation found `weekend_vacation` had incorrectly been counted as annual usage by the initial balance implementation. The corrected backend classifies the stable type codes before computing usage or reserving days. This also corrects historical weekly/sick/permission usage without modifying or deleting requests.

The user chose to preserve compensatory leave from before credit tracking without charging it against new admin grants. A grant of 3 days therefore provides 3 new compensatory days, less only usage tracked after grants began. Previously allocated compensatory requests or reapprovals made after a grant remain tracked. Annual debt cannot consume compensatory credit, and neither type can fall back to the other balance.

- Deployed the scoped correction to `ce-api-back`; no schema migration was necessary. Code and compiled rollback copies are retained under `/root/deployments/taqnia-vacation-types-20261026/backup`.
- Build and typecheck passed. All 38 vacation tests passed locally, including 9 PostgreSQL integration tests; all 29 non-database tests passed on the server.
- The full application import check passed before restart, using production's relative module-path convention.
- Live read-only verification returned HTTP 200 through the public API, HTTP 401 without authentication, and an empty allocation for weekly leave. Independent SQL confirmed annual usage includes annual leave only.
- Existing feedback changes, both frontends and the anniversary cron configuration were preserved. No frontend request-format change is required.

## Exclusive granter account — October 28, 2026

- The user explicitly authorized creating `MAlhaj@aecksa.com` in Taqnia with the existing `admin` role and exclusive permission to grant compensatory days. The original Taqnia project owner was not replaced.
- Added `users.can_grant_compensatory_leave`, default false, via `database/20261028_compensatory_grant_permission.sql`. Enabled it for the new account only. Roles, including `super_admin`, do not bypass this individual check.
- Login now selects the direct `project_id` as well as the permission, allowing additional project administrators to receive the correct scope without owning the project. Profile responses include `project_id` and the permission flag.
- Full database and source/build backups are retained under `/root/deployments/taqnia-compensatory-permission-20261028/backup` on the server. An initial random password was generated server-side and stored only as an Argon2 hash in the users table; the protected provisioning credentials file is mode 0600. No password was added to repository documentation.
- All 50 authentication/vacation tests passed locally, including migration reruns and real PostgreSQL denial cases. All 40 non-database tests passed on the server. Build, typecheck and application-import validation passed before activation.
- Deployed by restarting only `ce-api-back`; preserved unrelated feedback changes and both frontends. Verified real password login through the login service, public profile HTTP 200, the authorized account reaching post-permission validation, and HTTP 403 for the existing Taqnia admin and super admin. No credits were created during verification.
- The initial password is not automatically expired by the existing application. Change it after first login. No frontend UI change or Git push was included.
