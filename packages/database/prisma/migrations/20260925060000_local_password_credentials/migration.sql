-- Existing accounts keep their identity and authorization history. They cannot use
-- password sign-in until an administrator sets a password through the new workflow.
BEGIN;

ALTER TABLE "iam_application_user" ADD COLUMN "password_hash" TEXT;

ALTER TABLE "iam_application_user" ADD CONSTRAINT "iam_application_user_password_hash_ck"
  CHECK (password_hash IS NULL OR
    (char_length(password_hash) BETWEEN 80 AND 255 AND password_hash LIKE 'scrypt$%'));

-- Preserve the previous external identifiers for migration review and rollback.
CREATE TABLE "iam_legacy_identity_mapping" (
  "user_id" UUID PRIMARY KEY,
  "identity_issuer" TEXT NOT NULL,
  "identity_subject" TEXT NOT NULL,
  CONSTRAINT "iam_legacy_identity_mapping_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "iam_application_user"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT
);
INSERT INTO "iam_legacy_identity_mapping" ("user_id", "identity_issuer", "identity_subject")
  SELECT "id", "identity_issuer", "identity_subject"
  FROM "iam_application_user"
  WHERE "identity_issuer" IS NOT NULL;

UPDATE "iam_application_user"
  SET "identity_issuer" = 'vertex-local', "identity_subject" = "id"::TEXT,
      "updated_at" = now(), "version" = "version" + 1;

COMMIT;
