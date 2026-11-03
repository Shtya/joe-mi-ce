# Mobile journeys and intermittent login — backend update and mobile handoff

## Scope

Only the backend is changed. The separate mobile checkout is unchanged on `main`.
The mobile source was inspected read-only from `origin/joe_ce`, commit `ba811b6`
(manifest version `2.0.0+111`); the version actually installed on each phone is unknown.
No passwords, device bindings, plans, or attendance records are changed by this patch.

## Gray Journeys screen

The November 3 recording uses `inat#2345`. Its active journey has a null branch,
and both the plan and journey enable `allowAttendanceFromAnyProjectLocation`.
The live API accepted login and returned this journey with HTTP 200.

The mobile file
`lib/production/presention/promoter/screens/journey_screen/branch_list.dart`
dereferences `j.branch!.city!.name!` while filtering (line 130 in the inspected
commit), followed by `j.branch!.name!` and `j.branch!.id!` when building a card.
Null is valid in the backend's plan model but crashes that mobile screen.

The backend now returns a response-only display branch and nested city/region
for branchless rows on `GET /api/v1/journeys/mobile/today`:

- English: `Any project branch`.
- Arabic, including `ar-SA`: `أي فرع في المشروع`.
- `branch.isDisplayOnly` is true; `branch.id` is an empty string;
  `assignedBranchId` is null. No real branch ID is invented or assigned.
- Rows with an actual branch keep its ID and name. Missing geography gets a
  display fallback without modifying the database entity.

This is a compatibility mitigation for the current screen, not a new attendance
permission. The existing backend still resolves check-in to an eligible branch
in the same project and enforces its radius. It saves the actual check-in branch.
It does not allow attendance from arbitrary GPS coordinates.

### Important mobile follow-up

The display branch must never be treated as a real branch for stock or sales.
The existing app caches the branch ID before check-in and does not update that
cache from the branch resolved in the check-in response. The mobile developer
must refresh/persist the actual branch after check-in (or reload today's journeys)
before allowing branch-dependent operations. Filling a label alone cannot fix
that client-side cache. The empty display ID intentionally avoids silently
recording operations against an unrelated branch.

## Intermittent login and immediate logout

### Confirmed backend failure path and fix

`src/auth/auth.guard.ts` previously caught exceptions from both JWT verification
and the user/permissions database lookup, reporting all of them as HTTP 401
(`invalid_token`). A valid token followed by a database timeout therefore caused
the mobile client to erase the session. The regression test reproduced this
exact result before the fix: expected 503, received 401.

JWT failures still return 401. Inactive accounts and insufficient permissions
still return 403. User-lookup failures now return 503 with code
`AUTH_LOOKUP_UNAVAILABLE` and an Arabic/English message; the server logs
`auth.session.lookup_failed`. This fixes a proven false-logout path. Historical
database timeout/pool errors exist in production logs, but the old logs do not
prove that this caused a particular supplied recording.

### Login diagnostics added

Successful login responses and expected login rejections now include a
`requestId`. Rejections retain HTTP 403 and a string `message`, with stable codes:

| Code                  | Meaning                                                   |
| --------------------- | --------------------------------------------------------- |
| `INVALID_CREDENTIALS` | Username or password was rejected.                        |
| `ACCOUNT_INACTIVE`    | The account is inactive.                                  |
| `DEVICE_ID_REQUIRED`  | An already-bound account received no device identifier.   |
| `DEVICE_MISMATCH`     | The supplied identifier differs from the account binding. |

The `lang` header selects Arabic or English; default is English. Structured logs
use `auth.login.accepted`, `auth.login.rejected`, and `auth.login.failed` with
the request ID, username, and whether a device ID was provided. No password,
token, hash, or full device identifier is logged by these events. Login/refresh
request bodies are redacted in the HTTP logging interceptor, including trailing
slash URLs. Existing device-binding rules remain enforced.

### Mobile defects to report, without changing the app here

1. `custom_login_btn.dart` can submit while its asynchronous device-ID lookup is
   still pending, sending `mac_id: null`. The backend correctly rejects this for
   an already-bound account. Wait for the identifier, reject sentinel/error
   identifiers, and retry acquisition after platform errors.
2. `error_Interceptor.dart` clears the current session on any 401, even if the
   failed request belonged to a previous session. Associate requests with their
   session generation/token so a delayed old response cannot erase a new login.
3. `network_exceptions.dart` also clears storage and navigates when formatting
   a 401 message. Keep formatting free of side effects and centralize logout;
   otherwise the interceptor and UI can both redirect.
4. Login persistence is not awaited before navigation. Await session persistence
   and serialize it with logout cleanup to avoid races.
5. The error model assumes `message` is a string; handle validation arrays and
   retain Dio type/status plus `requestId` in safe diagnostics instead of only
   showing `Unexpected error occurred`.

Live tests before this patch accepted `inat#6579` through the public API with
HTTP 201, and loaded its journeys in Arabic and English with HTTP 200. Profile
and journey loading also succeeded for `inat#2345`; its null branch explains
the gray screen. `AEC-278` was active, but its recording's exact logout cause
was not established. These facts do not prove that every intermittent login
failure has the same cause.

## Delivery

Local verification: 81 focused tests passed across eight suites; TypeScript
(`tsc --noEmit --incremental false`), direct Nest compilation (`nest build`),
scoped ESLint, formatting, and diff checks passed. The full suite had 357 passing,
15 skipped, and 15 failing tests. All 15 failures in six suites were reproduced
on a separate scratch baseline with these changes removed. The repository's
`init` build wrapper and legacy ESLint configuration were not executed.

No database migration is required. Deploying the backend is required before
production clients receive these responses. A physical-device check and the
mobile cache/session follow-ups remain necessary for full client verification.
