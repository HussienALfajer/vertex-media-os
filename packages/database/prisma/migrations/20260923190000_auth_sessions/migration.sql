-- Platform authentication state / IAM-MP-05 (IAM-R03 D-01). Atomic wrapper: Prisma 7.10 deploy
-- does not wrap migrations.
-- Generated section below comes from prisma migrate diff --from-schema <copy of prisma/schema taken
--   before IAM-R03> --to-schema prisma/schema --script (Prisma 7.10.0); not edited by hand.
-- The reviewed SQL section adds checks Prisma cannot model. There are deliberately no foreign keys
-- to IAM tables (IAM-R03 D-02).
-- Recovery after a failure: docs/plans/iam/IAM_01_PERSISTENCE_FOUNDATION_PLAN.md Section 16.5.
BEGIN;

-- CreateEnum
CREATE TYPE "auth_session_revocation_reason" AS ENUM ('LOGOUT', 'BACKCHANNEL_LOGOUT', 'ACCESS_REVOKED', 'REPLACED');

-- CreateTable
CREATE TABLE "auth_session" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "token_hash" TEXT NOT NULL,
    "csrf_token_hash" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "idp_session_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL,
    "idle_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "absolute_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "revocation_reason" "auth_session_revocation_reason",
    "id_token_ciphertext" TEXT,
    "id_token_key_version" INTEGER,

    CONSTRAINT "auth_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_login_attempt" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "handle_hash" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "code_verifier" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "auth_login_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auth_session_token_hash_key" ON "auth_session"("token_hash");

-- CreateIndex
CREATE INDEX "auth_session_user_id_idx" ON "auth_session"("user_id");

-- CreateIndex
CREATE INDEX "auth_session_idp_session_id_idx" ON "auth_session"("idp_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_login_attempt_handle_hash_key" ON "auth_login_attempt"("handle_hash");

-- CreateIndex
CREATE INDEX "auth_login_attempt_expires_at_idx" ON "auth_login_attempt"("expires_at");

-- Hand-written, reviewed: checks Prisma cannot express (IAM-R03 Section 5). Hashes are unpadded
-- base64url SHA-256 digests (43 characters), so a raw secret can never be stored by mistake in
-- their place; revocation is all-or-nothing; the ID token is stored only with its key version.
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_token_hash_ck"
  CHECK (token_hash ~ '^[A-Za-z0-9_-]{43}$');
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_csrf_token_hash_ck"
  CHECK (csrf_token_hash ~ '^[A-Za-z0-9_-]{43}$');
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_expiry_ck"
  CHECK (created_at <= last_seen_at AND last_seen_at <= absolute_expires_at
    AND idle_expires_at <= absolute_expires_at);
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_revocation_ck"
  CHECK ((revoked_at IS NULL) = (revocation_reason IS NULL));
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_id_token_ck"
  CHECK ((id_token_ciphertext IS NULL) = (id_token_key_version IS NULL)
    AND (id_token_key_version IS NULL OR id_token_key_version >= 1)
    AND (id_token_ciphertext IS NULL OR revoked_at IS NULL));
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_idp_session_id_ck"
  CHECK (idp_session_id IS NULL OR char_length(idp_session_id) BETWEEN 1 AND 255);
ALTER TABLE "auth_login_attempt" ADD CONSTRAINT "auth_login_attempt_handle_hash_ck"
  CHECK (handle_hash ~ '^[A-Za-z0-9_-]{43}$');
ALTER TABLE "auth_login_attempt" ADD CONSTRAINT "auth_login_attempt_expiry_ck"
  CHECK (created_at < expires_at);

COMMIT;
