-- MOD-IAM / IAM-MP-02. Atomic wrapper: Prisma 7.10 deploy does not wrap migrations.
-- Hand-written only: Prisma cannot model CHECK constraints, so prisma migrate diff generates
-- nothing for this change (IAM-02 D-06).
-- Makes the protected system role unforgeable (IAM-02 D-10): only a role holding the reserved code
-- may be a system role, and no custom role may hold the reserved code.
-- It tightens a constraint over an existing table. If existing rows violate it, the migration fails
-- as a whole and changes nothing; resolve the data deliberately (never by tooling), then follow
-- docs/plans/iam/IAM_01_PERSISTENCE_FOUNDATION_PLAN.md Section 16.5.
BEGIN;

-- Hand-written, reviewed: a constraint Prisma cannot express (IAM-02 Section 16.2).
ALTER TABLE "iam_role" ADD CONSTRAINT "iam_role_system_code_ck"
  CHECK (is_system = (code = 'system-administrator'));

COMMIT;
