-- Session re-validation against the identity provider / IAM-CP1 fix run (IAM-R03F D-05, D-06).
-- Additive only: a revocation reason, two nullable columns and one check. Existing sessions keep
-- no refresh token, so they never slide again and end at their current idle deadline (D-02).
-- Atomic wrapper: Prisma 7.10 deploy does not wrap migrations. PostgreSQL accepts ADD VALUE inside
-- a transaction block; the new value is not used before the commit.
-- Generated section below comes from prisma migrate diff --from-schema <copy of prisma/schema taken
--   before IAM-R03F> --to-schema prisma/schema --script (Prisma 7.10.0); not edited by hand.
-- Recovery after a failure: docs/plans/iam/IAM_01_PERSISTENCE_FOUNDATION_PLAN.md Section 16.5.
BEGIN;

-- AlterEnum
ALTER TYPE "auth_session_revocation_reason" ADD VALUE 'PROVIDER_SESSION_ENDED';

-- AlterTable
ALTER TABLE "auth_session" ADD COLUMN     "refresh_token_ciphertext" TEXT,
ADD COLUMN     "refresh_token_key_version" INTEGER;

-- Hand-written, reviewed: the refresh token is stored only with its key version, like the ID
-- token, and never in a revoked row (SECURITY Section 11: discarded when the session ends).
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_refresh_token_ck"
  CHECK ((refresh_token_ciphertext IS NULL) = (refresh_token_key_version IS NULL)
    AND (refresh_token_key_version IS NULL OR refresh_token_key_version >= 1)
    AND (refresh_token_ciphertext IS NULL OR revoked_at IS NULL));

COMMIT;
