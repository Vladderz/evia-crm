-- Standalone audit query. Run this BEFORE migration 013.
--
-- Parses notice_id from each prospected_contracts.url and reports any
-- notice_id that appears on more than one row. For each duplicate group it
-- returns the notice_id, the row count, and a JSON array of the conflicting
-- rows (id, added_by_name, created_at, url) so you can decide which to keep.
--
-- Safe to run repeatedly. Read-only. Does not require the notice_id column
-- to exist yet.

WITH parsed AS (
  SELECT
    pc.id,
    pc.url,
    pc.created_at,
    u.name AS added_by_name,
    (regexp_match(pc.url, '/Notice/([^/?#]+)', 'i'))[1] AS notice_id
  FROM prospected_contracts pc
  LEFT JOIN users u ON u.id = pc.added_by
)
SELECT
  notice_id,
  COUNT(*) AS row_count,
  jsonb_agg(
    jsonb_build_object(
      'id',            id,
      'added_by_name', added_by_name,
      'created_at',    created_at,
      'url',           url
    )
    ORDER BY created_at
  ) AS rows
FROM parsed
WHERE notice_id IS NOT NULL
GROUP BY notice_id
HAVING COUNT(*) > 1
ORDER BY row_count DESC, notice_id;
