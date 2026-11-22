-- Color Kitchen PostgreSQL inventory for authorized review (PostgreSQL 12+).
-- Use an existing read-only login in the intended database. No arguments or credentials here.
-- psql -X --set=ON_ERROR_STOP=1 --file=schema_inventory.sql > schema-inventory.private.txt
-- Supply the approved connection/service through your normal secure environment.
-- This script prints structural metadata only. It omits user rows, comments, default
-- expressions, index predicates, trigger/procedure bodies, connection options and secrets.
-- Restrict this report to the engineering team. A hidden object is not an absent object.

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL search_path = pg_catalog, pg_temp;
SET LOCAL statement_timeout = '15s';
SET LOCAL lock_timeout = '2s';

-- Environment and installed extensions. No database/cluster credential information.
SELECT current_setting('server_version_num') AS server_version_num,
       current_setting('server_encoding') AS server_encoding,
       current_setting('transaction_read_only') AS transaction_read_only;
SELECT e.extname AS extension_name, e.extversion AS extension_version,
       n.nspname AS extension_schema
FROM pg_extension AS e JOIN pg_namespace AS n ON n.oid = e.extnamespace
ORDER BY e.extname COLLATE "C";

-- Non-system schemas for which the executing user has usage, including empty schemas.
SELECT n.nspname AS schema_name
FROM pg_namespace AS n
WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
  AND has_schema_privilege(n.oid, 'USAGE')
ORDER BY n.nspname COLLATE "C";

-- Relation names, types and row-security flags. Report only ordinary locally visible
-- table/view metadata. The table privilege flags describe the inventory login only.
SELECT n.nspname AS schema_name, c.relname AS relation_name,
       CASE c.relkind WHEN 'r' THEN 'table' WHEN 'p' THEN 'partitioned table'
            WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized view'
            WHEN 'f' THEN 'foreign table' END AS relation_type,
       c.relispartition AS is_partition, c.relrowsecurity AS row_security,
       c.relforcerowsecurity AS force_row_security,
       has_table_privilege(c.oid, 'SELECT') AS can_select
FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
  AND has_schema_privilege(n.oid, 'USAGE') AND c.relkind IN ('r','p','v','m','f')
ORDER BY n.nspname COLLATE "C", c.relname COLLATE "C";

-- Types, typemods, domains, nullability and generated/identity presence. Do not emit
-- literal defaults or generated expressions. Confirm their business meaning separately.
SELECT n.nspname AS schema_name, c.relname AS relation_name, a.attnum AS position,
       a.attname AS column_name, format_type(a.atttypid, a.atttypmod) AS declared_type,
       a.attnotnull AS column_not_null, a.atthasdef AS has_default_or_generation,
       NULLIF(a.attidentity, '') AS identity_code, NULLIF(a.attgenerated, '') AS generated_code
FROM pg_attribute AS a JOIN pg_class AS c ON c.oid = a.attrelid
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
  AND has_schema_privilege(n.oid, 'USAGE') AND c.relkind IN ('r','p','v','m','f')
  AND a.attnum > 0 AND NOT a.attisdropped
ORDER BY n.nspname COLLATE "C", c.relname COLLATE "C", a.attnum;

-- Constraint/key columns and paired FK targets. Multi-column keys appear in ordinal
-- order. FK rules: a=no action, r=restrict, c=cascade, n=set null, d=set default.
-- Check and exclusion expressions are deliberately omitted. Unlike defaults, these
-- reviewed expressions can be retrieved from the approved migration repository later.
SELECT n.nspname AS schema_name, c.relname AS relation_name,
       con.conname AS constraint_name, con.contype AS constraint_type,
       col.ord AS key_position, a.attname AS column_name,
       rn.nspname AS target_schema, rc.relname AS target_relation, ra.attname AS target_column,
       CASE WHEN con.contype = 'f' THEN con.confupdtype END AS fk_update_rule,
       CASE WHEN con.contype = 'f' THEN con.confdeltype END AS fk_delete_rule,
       con.convalidated AS validated, con.condeferrable AS is_deferrable,
       con.condeferred AS initially_deferred
FROM pg_constraint AS con JOIN pg_class AS c ON c.oid = con.conrelid
JOIN pg_namespace AS n ON n.oid = c.relnamespace
LEFT JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS col(attnum, ord) ON true
LEFT JOIN pg_attribute AS a ON a.attrelid = c.oid AND a.attnum = col.attnum
LEFT JOIN pg_class AS rc ON rc.oid = con.confrelid
LEFT JOIN pg_namespace AS rn ON rn.oid = rc.relnamespace
LEFT JOIN pg_attribute AS ra ON ra.attrelid = rc.oid AND ra.attnum = con.confkey[col.ord::integer]
WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
  AND has_schema_privilege(n.oid, 'USAGE')
ORDER BY n.nspname COLLATE "C", c.relname COLLATE "C", con.conname COLLATE "C", col.ord;

-- Index method, key order, included columns, uniqueness/validity, existence of a
-- predicate or expression. No expression body or literal comparison values are emitted.
SELECT n.nspname AS schema_name, c.relname AS relation_name, ic.relname AS index_name,
       am.amname AS access_method, k.ord AS position,
       CASE WHEN k.attnum = 0 THEN '[expression omitted]' ELSE a.attname::text END AS indexed_item,
       k.ord > i.indnkeyatts AS included_column,
       i.indisunique AS unique_index, i.indisprimary AS primary_index,
       i.indisvalid AS valid, i.indisready AS ready, i.indpred IS NOT NULL AS partial_index
FROM pg_index AS i JOIN pg_class AS c ON c.oid = i.indrelid
JOIN pg_namespace AS n ON n.oid = c.relnamespace
JOIN pg_class AS ic ON ic.oid = i.indexrelid JOIN pg_am AS am ON am.oid = ic.relam
CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
LEFT JOIN pg_attribute AS a ON a.attrelid = c.oid AND a.attnum = k.attnum
WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
  AND has_schema_privilege(n.oid, 'USAGE')
ORDER BY n.nspname COLLATE "C", c.relname COLLATE "C", ic.relname COLLATE "C", k.ord;

-- Row policy and application trigger names indicate where an owner must verify
-- write/status semantics. Neither policy expressions nor trigger configuration values print.
SELECT n.nspname AS schema_name, c.relname AS relation_name, p.polname AS policy_name,
       p.polcmd AS policy_command, p.polpermissive AS permissive
FROM pg_policy AS p JOIN pg_class AS c ON c.oid = p.polrelid
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
  AND has_schema_privilege(n.oid, 'USAGE')
ORDER BY n.nspname COLLATE "C", c.relname COLLATE "C", p.polname COLLATE "C";
SELECT n.nspname AS schema_name, c.relname AS relation_name, t.tgname AS trigger_name,
       t.tgenabled AS enabled_mode, pn.nspname AS function_schema, f.proname AS function_name
FROM pg_trigger AS t JOIN pg_class AS c ON c.oid = t.tgrelid
JOIN pg_namespace AS n ON n.oid = c.relnamespace
JOIN pg_proc AS f ON f.oid = t.tgfoid JOIN pg_namespace AS pn ON pn.oid = f.pronamespace
WHERE NOT t.tgisinternal AND n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
  AND has_schema_privilege(n.oid, 'USAGE')
ORDER BY n.nspname COLLATE "C", c.relname COLLATE "C", t.tgname COLLATE "C";

-- Candidate reuse domains and migration ledger names. Names are hints only. No table
-- or view is queried for its contents. Unknown naming conventions require owner review.
SELECT n.nspname AS schema_name, c.relname AS candidate_name,
       CASE WHEN c.relname::text ~* '(migration|schema_version|databasechangelog|alembic)' THEN 'migration history'
            WHEN c.relname::text ~* '(leaderboard|puzzl|dictionary|lexic|word|game_session|game_result|score)' THEN 'game reference'
            WHEN c.relname::text ~* '(permission|scope|grant|role|privilege|membership)' THEN 'authorization'
            WHEN c.relname::text ~* '(user|account|principal|identity|subject|profile|oauth)' THEN 'identity/profile/auth'
            WHEN c.relname::text ~* '(localiz|i18n|translat|locale)' THEN 'localization'
            WHEN c.relname::text ~* '(audit|ledger)' THEN 'audit'
            ELSE 'catalog/project' END AS review_area
FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
  AND has_schema_privilege(n.oid, 'USAGE') AND c.relkind IN ('r','p','v','m','f')
  AND c.relname::text ~* '(migration|schema_version|databasechangelog|alembic|leaderboard|puzzl|dictionary|lexic|word|game_session|game_result|score|permission|scope|grant|role|privilege|membership|user|account|principal|identity|subject|profile|oauth|localiz|i18n|translat|locale|audit|ledger|catalog|palette|project|theme)'
ORDER BY n.nspname COLLATE "C", c.relname COLLATE "C";

ROLLBACK;
