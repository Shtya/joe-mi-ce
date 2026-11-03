# Journey-plan attendance policy

`allowAttendanceFromAnyProjectLocation` belongs to the journey plan and is
copied to generated journeys. It is not a Shift setting.

Create a plan using `POST /api/v1/journeys/plans`:

```json
{
  "userId": "<employee UUID>",
  "shiftId": ["<shift UUID>"],
  "days": ["monday", "tuesday"],
  "allowAttendanceFromAnyProjectLocation": true
}
```

- `true`: branchId can be omitted or null; supplying a branch is also valid.
  User, any supplied branch and all selected shifts must belong to the same
  project. A missing branch never means unrestricted GPS attendance: only valid
  branches in the employee's project qualify, within their configured radius.
- `false` (default): branchId is required. Attendance uses the assigned branch, except for the roaming rule below.
- Update using `PATCH /api/v1/journeys/plans/<id>`. To disable a branchless plan,
  supply a valid branchId. With the setting enabled, branchId:null clears it.
- Today, tomorrow and recovery generation copy the plan flag into each Journey.
  A plan update transaction also updates its active current/future journeys with
  absent/vacation status, preserving started and completed attendance history.
- First check-in records the actual branch on the journey. The plan keeps its
  optional planning branch; checkout does not replace the recorded branch.
- Plan and journey detail/list GETs return the stored boolean. Mobile today's
  journeys and supervisor summary GETs also include it in their custom rows.
- Boolean strings, numbers and null are rejected for the flag. Send JSON true
  or false; omitting it on update preserves the existing choice.

Migration: `src/scripts/sql/2026-11-03-plan-attendance-location-policy.sql`.
It preserves Inatural's existing behavior on plans and journeys, and defaults
other records to false. Reruns preserve later choices. Roaming branch/chain names take precedence over either plan setting.
The discarded shift migration was never applied and is no longer required.

This backend checkout does not contain the separate frontend plan editor.
Its toggle should bind to the plan key, conditionally require branchId, and use
the GET response to initialize the form. No shift toggle is needed.

Deployed on Joemi on 2026-11-03 after a verified full database backup.
Enabled all 91 Inatural plans and 364 journeys. The supplied Taqnia plan GET
returns the field as false; an Inatural GET returns true. Other project flag
values were preserved. The live service test verified branchless creation,
policy inheritance, automatic pending-journey updates, actual check-in branch
recording and mobile GET output, then rolled back every test record.

94 focused tests and direct TypeScript production compilation pass. The broad
suite retains the previously identified 15 baseline failures. Backup:
/var/www/joe-mi-ce/backups/inatural-roster-2026-11-03T07-41-01-889Z/database.dump.

## Roaming exception — deployed 2026-11-03

A journey assigned to a roaming branch or chain can check in and out from
anywhere, regardless of the plan flag. Match either branch.name or
branch.chain.name, case-insensitively with surrounding spaces/punctuation.
Stored examples include ROAMING, Roaming Jeddah, JEDDAH - ROAMING,
Roaming  Al-Hassa, Roaming-Eastern and the typo Roming Riyadh.
The backend supports the whole-word spellings roaming and roming. A branch
without a roaming name can also qualify through its Roaming chain.
Ordinary branches continue to use the assigned/project location rule.
Authentication and project ownership checks still apply.

The live transaction test verified branch-only and chain-only roaming, both
plan modes, far-away check-in and checkout. All test records were rolled back.
No branch names or plan flags were changed by this correction. 110 focused
tests and direct production compilation passed. Full suite: 342 passed,
15 known baseline failures and 15 skipped. Backup/code rollback details are
in the deployment audit artifact.
