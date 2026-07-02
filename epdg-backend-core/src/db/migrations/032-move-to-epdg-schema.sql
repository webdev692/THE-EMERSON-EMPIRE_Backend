-- Step 1 of multi-tenant schema isolation (core / agency / epdg / audit,
-- all as separate namespaces in the same database): move every existing
-- EPDG application table and custom enum type out of `public` and into a
-- dedicated `epdg` schema.
--
-- Non-destructive: ALTER ... SET SCHEMA only changes an object's namespace.
-- No table, column, enum, index, constraint, or row is dropped/recreated.
-- Sequences owned by SERIAL columns move automatically with their table;
-- indexes always live in the same schema as their table and need no
-- separate statement.
--
-- `public.migrations` (the postgres-migrations tracking table created in
-- src/db/index.ts) is intentionally NOT moved — it is always created and
-- queried fully-qualified as `public.migrations` and must stay put.
--
-- Idempotent / replay-safe: each object is only moved if it is still
-- found in `public`. This matters because src/db/index.ts resets and
-- replays all migrations from scratch on a migration-hash mismatch — on
-- a database that has already run this migration once, that replay must
-- not fail trying to move objects that already live in `epdg`.

CREATE SCHEMA IF NOT EXISTS epdg;

-- Move custom enum types (created via CREATE TYPE in migrations 001-009)
DO $$
DECLARE
  type_name text;
BEGIN
  FOREACH type_name IN ARRAY ARRAY[
    'user_role',
    'school_type',
    'admin_role',
    'internship_slot_status',
    'application_status',
    'placement_status',
    'task_priority',
    'task_status',
    'submission_status'
  ]
  LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE t.typname = type_name
        AND n.nspname = 'public'
    ) THEN
      EXECUTE format('ALTER TYPE public.%I SET SCHEMA epdg', type_name);
    END IF;
  END LOOP;
END $$;

-- Move all application tables (created across migrations 001-031)
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'users',
    'companies',
    'schools',
    'intern_profiles',
    'internship_slots',
    'applications',
    'placements',
    'tasks',
    'submissions',
    'milestones',
    'admins',
    'announcements',
    'certificate_templates',
    'certificates',
    'audit_log',
    'roadmap_weeks',
    'intern_roadmap_progress',
    'mentor_sessions',
    'intern_skills',
    'point_events',
    'badges',
    'badge_awards',
    'resources',
    'feedback',
    'platform_settings',
    'opportunities',
    'opportunity_applications',
    'tracks',
    'roadmap_modules',
    'intern_level_progress',
    'module_completions',
    'onboarding_agreements',
    'career_files',
    'career_experiences',
    'career_projects',
    'career_skills',
    'readiness_score_history'
  ]
  LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = table_name
        AND n.nspname = 'public'
        AND c.relkind = 'r'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I SET SCHEMA epdg', table_name);
    END IF;
  END LOOP;
END $$;
