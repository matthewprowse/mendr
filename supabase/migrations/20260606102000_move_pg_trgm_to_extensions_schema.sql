-- Backend Security & Launch Readiness: L1 — move pg_trgm out of the public
-- schema. pg_trgm is used only via GIN-index ILIKE (its operator class moves
-- with the extension and existing indexes keep working by oid); no application
-- function or policy calls its functions/operators directly, so this is safe.
-- The `extensions` schema already exists and is on the postgres role's path.
ALTER EXTENSION pg_trgm SET SCHEMA extensions;
