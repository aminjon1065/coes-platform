-- CoESCD PostgreSQL Schema Initialization
-- Creates all domain schemas with isolated ownership

-- ─────────────── Schemas ───────────────
CREATE SCHEMA IF NOT EXISTS iam;
CREATE SCHEMA IF NOT EXISTS org;
CREATE SCHEMA IF NOT EXISTS users;
CREATE SCHEMA IF NOT EXISTS authz;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS edms;
CREATE SCHEMA IF NOT EXISTS tasks;
CREATE SCHEMA IF NOT EXISTS notifications;
CREATE SCHEMA IF NOT EXISTS files;
CREATE SCHEMA IF NOT EXISTS calls;
CREATE SCHEMA IF NOT EXISTS chat;
CREATE SCHEMA IF NOT EXISTS search;
CREATE SCHEMA IF NOT EXISTS gis;
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS ml;
CREATE SCHEMA IF NOT EXISTS reporting;

-- ─────────────── Extensions ───────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gin";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "postgis_topology";

-- ─────────────── Audit schema: enforce append-only via RLS ───────────────
-- The application role must only INSERT on audit.audit_events.
-- No UPDATE or DELETE is permitted.
ALTER TABLE IF EXISTS audit.audit_events ENABLE ROW LEVEL SECURITY;

-- Application role with restricted privileges
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'coescd_app') THEN
    CREATE ROLE coescd_app LOGIN PASSWORD 'CHANGE_IN_PRODUCTION';
  END IF;
END
$$;

-- Grant schema-level access
GRANT USAGE ON SCHEMA iam, org, users, authz, audit, edms, tasks, notifications, files, calls, chat, search, gis, analytics, ml, reporting TO coescd_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA iam TO coescd_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA org TO coescd_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA users TO coescd_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA authz TO coescd_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA edms TO coescd_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA tasks TO coescd_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA notifications TO coescd_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA files TO coescd_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA calls TO coescd_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA chat TO coescd_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA search TO coescd_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA gis TO coescd_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA analytics TO coescd_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA ml TO coescd_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA reporting TO coescd_app;

-- Audit schema: INSERT-only for app role
GRANT USAGE ON SCHEMA audit TO coescd_app;
GRANT INSERT ON ALL TABLES IN SCHEMA audit TO coescd_app;
GRANT SELECT ON ALL TABLES IN SCHEMA audit TO coescd_app;
-- Explicitly NO UPDATE or DELETE grants on audit schema

-- Future tables in these schemas inherit the same grants
ALTER DEFAULT PRIVILEGES IN SCHEMA iam GRANT ALL ON TABLES TO coescd_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA org GRANT ALL ON TABLES TO coescd_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA users GRANT ALL ON TABLES TO coescd_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA authz GRANT ALL ON TABLES TO coescd_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA edms GRANT ALL ON TABLES TO coescd_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA tasks GRANT ALL ON TABLES TO coescd_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA notifications GRANT ALL ON TABLES TO coescd_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA files GRANT ALL ON TABLES TO coescd_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA calls GRANT ALL ON TABLES TO coescd_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA chat GRANT ALL ON TABLES TO coescd_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA gis GRANT ALL ON TABLES TO coescd_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA analytics GRANT ALL ON TABLES TO coescd_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA ml GRANT ALL ON TABLES TO coescd_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA reporting GRANT ALL ON TABLES TO coescd_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA audit GRANT INSERT, SELECT ON TABLES TO coescd_app;

COMMENT ON SCHEMA iam IS 'Identity and Access Management — credentials, sessions, tokens';
COMMENT ON SCHEMA org IS 'Organizational structure — departments, positions, hierarchy';
COMMENT ON SCHEMA users IS 'User profiles, position assignments, preferences';
COMMENT ON SCHEMA authz IS 'Authorization — roles, permissions, assignments, delegations';
COMMENT ON SCHEMA audit IS 'Append-only tamper-evident audit log';
COMMENT ON SCHEMA edms IS 'Electronic Document Management System';
COMMENT ON SCHEMA tasks IS 'Task and work order management';
COMMENT ON SCHEMA notifications IS 'Notification delivery and preferences';
COMMENT ON SCHEMA files IS 'File storage metadata and versioning';
COMMENT ON SCHEMA calls IS 'Calls, conferencing sessions, participants and recordings';
COMMENT ON SCHEMA chat IS 'Messaging channels and messages';
COMMENT ON SCHEMA gis IS 'Geospatial data layers and spatial features';
COMMENT ON SCHEMA analytics IS 'Analytics and time-series data';
COMMENT ON SCHEMA ml IS 'Machine learning models, features, predictions and monitoring';
COMMENT ON SCHEMA reporting IS 'Operational and analytical report definitions and executions';
