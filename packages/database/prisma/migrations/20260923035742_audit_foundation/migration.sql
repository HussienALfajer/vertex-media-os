-- MOD-AUDIT / IAM-MP-02. Atomic wrapper: Prisma 7.10 deploy does not wrap migrations.
-- Generated section below comes from prisma migrate diff --from-schema <copy of prisma/schema taken
--   before IAM-02> --to-schema prisma/schema --script (Prisma 7.10.0); not edited by hand.
-- The reviewed SQL section adds checks Prisma cannot model. There are deliberately no foreign keys,
-- no secondary indexes, no triggers and no functions (IAM-02 D-05, D-09).
-- Recovery after a failure: docs/plans/iam/IAM_01_PERSISTENCE_FOUNDATION_PLAN.md Section 16.5.
BEGIN;

-- CreateEnum
CREATE TYPE "audit_actor_type" AS ENUM ('USER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "audit_result" AS ENUM ('SUCCEEDED', 'REFUSED', 'FAILED');

-- CreateTable
CREATE TABLE "audit_record" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT transaction_timestamp(),
    "source_module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor_type" "audit_actor_type" NOT NULL,
    "actor_user_id" UUID,
    "actor_process" TEXT,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "result" "audit_result" NOT NULL,
    "trace_id" TEXT NOT NULL,
    "reason" TEXT,
    "change" JSONB,

    CONSTRAINT "audit_record_pkey" PRIMARY KEY ("id")
);

-- Hand-written, reviewed: checks Prisma cannot express (IAM-02 Section 16.1). They mirror the
-- MOD-AUDIT core rules (domains/audit) for codes, identifiers, trace ID and reason, and are a
-- structural backstop for change evidence.
ALTER TABLE "audit_record" ADD CONSTRAINT "audit_record_source_module_ck"
  CHECK (char_length(source_module) BETWEEN 2 AND 32
    AND octet_length(source_module) = char_length(source_module)
    AND source_module ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$');
ALTER TABLE "audit_record" ADD CONSTRAINT "audit_record_action_ck"
  CHECK (char_length(action) <= 128 AND octet_length(action) = char_length(action)
    AND action ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*[.][a-z][a-z0-9]*(-[a-z0-9]+)*[.][a-z][a-z0-9]*(-[a-z0-9]+)*$');
ALTER TABLE "audit_record" ADD CONSTRAINT "audit_record_action_module_ck"
  CHECK (split_part(action, '.', 1) = source_module);
ALTER TABLE "audit_record" ADD CONSTRAINT "audit_record_actor_ck"
  CHECK ((actor_type = 'USER' AND actor_user_id IS NOT NULL AND actor_process IS NULL)
    OR (actor_type = 'SYSTEM' AND actor_process IS NOT NULL AND actor_user_id IS NULL));
ALTER TABLE "audit_record" ADD CONSTRAINT "audit_record_actor_process_ck"
  CHECK (actor_process IS NULL OR (char_length(actor_process) <= 64
    AND octet_length(actor_process) = char_length(actor_process)
    AND actor_process ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*[.][a-z][a-z0-9]*(-[a-z0-9]+)*$'));
ALTER TABLE "audit_record" ADD CONSTRAINT "audit_record_target_type_ck"
  CHECK (char_length(target_type) <= 64 AND octet_length(target_type) = char_length(target_type)
    AND target_type ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*[.][a-z][a-z0-9]*(-[a-z0-9]+)*$');
ALTER TABLE "audit_record" ADD CONSTRAINT "audit_record_target_id_ck"
  CHECK (octet_length(target_id) = char_length(target_id)
    AND target_id ~ '^[a-z0-9]([a-z0-9._-]{0,126}[a-z0-9])?$');
ALTER TABLE "audit_record" ADD CONSTRAINT "audit_record_trace_id_ck"
  CHECK (octet_length(trace_id) = char_length(trace_id)
    AND trace_id ~ '^[A-Za-z0-9._:-]{1,128}$');
ALTER TABLE "audit_record" ADD CONSTRAINT "audit_record_reason_ck"
  CHECK (reason IS NULL OR (char_length(reason) BETWEEN 1 AND 500 AND reason = btrim(reason)
    AND reason !~ '[[:cntrl:]]'));
-- CASE fixes the evaluation order: the key-removal operator raises an error on JSON scalars, so
-- it only runs once the value is known to be an object. JSON null and every non-object are rejected.
ALTER TABLE "audit_record" ADD CONSTRAINT "audit_record_change_ck"
  CHECK (change IS NULL OR CASE WHEN jsonb_typeof(change) = 'object'
    THEN (change - 'before' - 'after') = '{}'::jsonb AND change <> '{}'::jsonb
      AND octet_length(change::text) <= 32768
    ELSE false END);

COMMIT;
