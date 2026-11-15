# Users search: balance display compatibility

Searching for `AEC-04` exposed a frontend rendering exception: the Users table
renders `vacationBalance` directly as a React child, but the teams endpoint
returned `{ annualRemainingDays, compensatoryRemainingDays }` for eligible
Taqnia employees. React cannot render that object. The account and its balance
account were confirmed using a read-only production query.

The correction is confined to the backend response for
`GET /api/v1/projects/:projectId/teams`:

- `vacationBalance` is now display text, for example
  `Annual: 4 | Compensatory: 2`.
- `lang: ar` (including `ar-SA`) returns `سنوي: 4 | تعويضي: 2`.
- `vacationBalanceDetails` retains the authorized numeric breakdown.
- Both fields remain null when balance access/data is unavailable.
- Zero and negative balances remain visible. The two leave types are not added
  together or treated as interchangeable.
- Search, project filters, pagination, and balance authorization remain intact.
- `/users`, `/users/:id`, and the dedicated vacation APIs retain their existing
  structured balance contracts.

No frontend update or schema migration is required. Consumers of the teams
endpoint that need numeric fields should use `vacationBalanceDetails`.

Validation: the unchanged deployed frontend cell reproduced React's object-child
exception. Backend response tests cover the employee search, pagination/filter
preservation, Arabic text, null balances, zero/negative values, and unchanged user
API contracts. A repeat search on the original device remains outstanding.

Checks completed:

- 34 focused vacation response/service/list tests passed.
- TypeScript checking and direct Nest compilation passed.
- The actual compiled controller response rendered successfully through the
  unchanged deployed frontend balance cell in English and Arabic. The original
  object response failed through that same cell.
- Formatting and `git diff --check` passed.
- The full suite reported 15 failures across six unrelated payroll, journey,
  and document-builder suites (369 passed, 15 skipped).
- Scoped lint reported two existing unused imports in the project controller.

The normal build wrapper and repository lint configuration contain unrelated
obfuscated executable code in `init` and `.eslintrc.js`. They were not executed
or modified. Compilation used the Nest CLI directly, and scoped lint used a
temporary configuration containing only the visible lint settings.

## Production deployment — November 12, 2026

Deployed only `src/project/project.controller.ts` and its three compiled artifacts
to `/var/www/joe-mi-ce/backend`. Restarted only `ce-api-back` once. Both frontend
processes retained their PIDs/restart counts, and the frontend build ID and route
manifest checksums remained unchanged. No migration or production data write was
performed.

Live authenticated HTTP checks for `AEC-04` returned HTTP 200 and a string balance
in English and Arabic, with numeric `vacationBalanceDetails` retained. A request
without authentication still returned HTTP 401. The public Users page returned
HTTP 200. Verification used a short-lived in-memory session for an existing
authorized administrator; no credential was printed or persisted.

Rollback archive:
`/root/deployments/users-search-20261112-backend-only/backup.tgz`
(SHA-256 `addd892b53e32b164df79fbab1c1ef99c657cfd26c20f8f6cbe449031fb06cf4`).
Restore the four backed-up files under the backend directory and restart only
`ce-api-back` if rollback is required.
