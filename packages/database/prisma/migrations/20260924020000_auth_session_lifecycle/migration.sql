-- Session revocation for the IAM user lifecycle and database-level session invariants / IAM-MP-10
-- (IAM-R06 D-09, D-19; IAM-CP1 CP1-06). Additive only: four revocation reasons, checks the
-- application already satisfies, and a trigger that keeps a revocation final.
-- Atomic wrapper: Prisma 7.10 deploy does not wrap migrations. PostgreSQL accepts ADD VALUE inside
-- a transaction block; the new values are not used before the commit.
-- Generated section below comes from prisma migrate diff --from-schema <copy of prisma/schema taken
--   before IAM-R06> --to-schema prisma/schema --script (Prisma 7.10.0); not edited by hand.
-- Recovery after a failure: docs/plans/iam/IAM_01_PERSISTENCE_FOUNDATION_PLAN.md Section 16.5.
BEGIN;

-- AlterEnum
ALTER TYPE "auth_session_revocation_reason" ADD VALUE 'USER_SUSPENDED';
ALTER TYPE "auth_session_revocation_reason" ADD VALUE 'USER_DISABLED';
ALTER TYPE "auth_session_revocation_reason" ADD VALUE 'USER_TERMINATED';
ALTER TYPE "auth_session_revocation_reason" ADD VALUE 'ADMINISTRATOR_REVOKED';

-- Hand-written, reviewed (CP1-06): structural checks every application path already keeps. A
-- session lives for a positive time and stores no empty token ciphertext; a login attempt stores
-- no empty state, nonce or PKCE verifier. `revoked_at >= created_at` is deliberately not checked:
-- both come from the application clock, and a check would make a revocation fail after a clock
-- step, leaving the sessions live (IAM-R06 review DC-2).
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_lifetime_ck"
  CHECK (idle_expires_at > created_at AND absolute_expires_at > created_at);
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_token_ciphertext_ck"
  CHECK ((id_token_ciphertext IS NULL OR char_length(id_token_ciphertext) > 0)
    AND (refresh_token_ciphertext IS NULL OR char_length(refresh_token_ciphertext) > 0));
ALTER TABLE "auth_login_attempt" ADD CONSTRAINT "auth_login_attempt_secrets_ck"
  CHECK (char_length(state) > 0 AND char_length(nonce) > 0 AND char_length(code_verifier) > 0);

-- Hand-written, reviewed (CP1-06; spec Section 32): a revoked session never becomes valid again.
-- A CHECK cannot compare a row with its previous version, so a trigger refuses any update that
-- clears or rewrites `revoked_at` or `revocation_reason` once `revoked_at` is set. It reports the
-- violation as a check violation under its own name.
CREATE FUNCTION "auth_session_revocation_is_final"() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.revoked_at IS NOT NULL AND (NEW.revoked_at IS DISTINCT FROM OLD.revoked_at
      OR NEW.revocation_reason IS DISTINCT FROM OLD.revocation_reason) THEN
    RAISE EXCEPTION 'auth_session_revocation_final: a revoked session stays revoked'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'auth_session_revocation_final';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "auth_session_revocation_final"
  BEFORE UPDATE ON "auth_session"
  FOR EACH ROW EXECUTE FUNCTION "auth_session_revocation_is_final"();

COMMIT;
