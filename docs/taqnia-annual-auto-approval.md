# Taqnia annual-leave automatic approval

For new requests with the explicit `annual_leave` reason in Taqnia:

| Requested days | Required available annual balance | Result |
| --- | --- | --- |
| 1 | Strictly greater than 0.5 | Approved immediately |
| 2 | Strictly greater than 1.6 | Approved immediately |
| 3 or more | Full requested balance | Existing approval process |

Exactly 0.5 and 1.6 do not qualify. The full requested days are recorded against annual leave; a qualifying shortfall remains visible as negative annual balance. Compensatory balances are never used to cover it. Employee locking prevents simultaneous requests from reusing the allowance.

Authorization, overlapping dates, employment joining date and contract-period restrictions still apply. Immediate approvals also update absent journeys to vacation, using the same transaction. No human approver is recorded for an automatic decision. Existing requests, other projects, compensatory leave, and legacy free-text reasons retain their approval process.

Excel imports round calculated numeric values to four decimal places. A zero annual balance with no joining date is a no-op for annual credit and does not create an annual account; positive annual balances still require a joining date. Permission and Taqnia membership checks remain mandatory. The supplied 347-row workbook was parsed locally with no missing or duplicate usernames; this is format validation, not a production import or a check of employee membership.

No schema migration or frontend change is required for this policy. Deploy the backend to activate it. Existing balance migrations remain prerequisites on environments that have not applied them.
