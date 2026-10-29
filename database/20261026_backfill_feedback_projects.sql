-- Repair only historical unassigned feedback from Bissell Saudi and taqnia.
-- Idempotent: existing project assignments and all other projects are untouched.
-- Run inside a transaction; preserve original submission/update timestamps.
WITH repaired AS (
  UPDATE feedback AS f
  SET "projectId" = p.id
  FROM users AS u
  JOIN project AS p ON p.id::text = u.project_id::text
  WHERE f."userId" = u.id
    AND f."projectId" IS NULL
    AND f.deleted_at IS NULL
    AND p.deleted_at IS NULL
    AND f.created_at < TIMESTAMPTZ '2026-10-26 00:00:00+00'
    AND (
      (p.id = '40d8aeb0-68a3-4d56-9594-9b72e8c2c858' AND p.name = 'Bissell Saudi')
      OR (p.id = 'c9f7df79-b342-4b8d-aa71-0de112f47254' AND p.name = 'taqnia')
    )
  RETURNING p.name AS project
)
SELECT project, COUNT(*)::int AS repaired_count
FROM repaired
GROUP BY project
ORDER BY project;
