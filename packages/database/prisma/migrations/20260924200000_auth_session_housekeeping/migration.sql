-- Session housekeeping index / IAM-MP-15 (IAM-R09 D-06; IAM-CP1 CP1-08). Additive only.
-- `idle_expires_at <= absolute_expires_at` is a table check (auth_session_expiry_ck), so a session
-- has expired exactly when its idle deadline has passed: this one index serves the expired-token
-- sweep and the retention purge, which scanned the whole table before.
-- Atomic wrapper: Prisma 7.10 deploy does not wrap migrations.
-- Generated section below comes from prisma migrate diff --from-schema <copy of prisma/schema taken
--   before IAM-R09> --to-schema prisma/schema --script (Prisma 7.10.0); not edited by hand.
-- Recovery after a failure: docs/plans/iam/IAM_01_PERSISTENCE_FOUNDATION_PLAN.md Section 16.5.
BEGIN;

-- CreateIndex
CREATE INDEX "auth_session_idle_expires_at_idx" ON "auth_session"("idle_expires_at");

COMMIT;
