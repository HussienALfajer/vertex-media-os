-- MOD-IAM / IAM-MP-01. Atomic wrapper: Prisma 7.10 deploy does not wrap migrations.
-- Generated section below comes from prisma migrate diff --from-empty --to-schema prisma/schema --script.
-- Its leading CREATE SCHEMA statement is omitted because it needs database-level CREATE.
-- The reviewed SQL section adds checks and a partial index that Prisma cannot model.
-- Recovery after a failure: docs/plans/iam/IAM_01_PERSISTENCE_FOUNDATION_PLAN.md Section 16.5.
BEGIN;

-- CreateSchema

-- CreateEnum
CREATE TYPE "iam_user_access_state" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'DISABLED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "iam_identity_sync_state" AS ENUM ('PENDING', 'SYNCED', 'FAILED');

-- CreateEnum
CREATE TYPE "iam_invitation_delivery_state" AS ENUM ('NOT_SENT', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "iam_department_state" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "iam_role_state" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "iam_permission_state" AS ENUM ('ACTIVE', 'DEPRECATED', 'RETIRED');

-- CreateEnum
CREATE TYPE "iam_permission_sensitivity" AS ENUM ('STANDARD', 'SENSITIVE', 'PRIVILEGED');

-- CreateTable
CREATE TABLE "iam_application_user" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "access_state" "iam_user_access_state" NOT NULL,
    "identity_issuer" TEXT,
    "identity_subject" TEXT,
    "identity_sync_state" "iam_identity_sync_state" NOT NULL,
    "invitation_delivery_state" "iam_invitation_delivery_state" NOT NULL,
    "invitation_sent_at" TIMESTAMPTZ(3),
    "first_activated_at" TIMESTAMPTZ(3),
    "last_access_state_changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "iam_application_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam_department" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "state" "iam_department_state" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "iam_department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam_role" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "state" "iam_role_state" NOT NULL,
    "is_system" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "iam_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam_permission" (
    "code" TEXT NOT NULL,
    "owning_module" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "state" "iam_permission_state" NOT NULL,
    "sensitivity" "iam_permission_sensitivity" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "iam_permission_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "iam_department_membership" (
    "user_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "iam_department_membership_pkey" PRIMARY KEY ("user_id","department_id")
);

-- CreateTable
CREATE TABLE "iam_user_role_assignment" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "iam_user_role_assignment_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "iam_role_permission" (
    "role_id" UUID NOT NULL,
    "permission_code" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "iam_role_permission_pkey" PRIMARY KEY ("role_id","permission_code")
);

-- CreateIndex
CREATE UNIQUE INDEX "iam_application_user_email_key" ON "iam_application_user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "iam_application_user_identity_key" ON "iam_application_user"("identity_issuer", "identity_subject");

-- CreateIndex
CREATE UNIQUE INDEX "iam_department_code_key" ON "iam_department"("code");

-- CreateIndex
CREATE UNIQUE INDEX "iam_role_code_key" ON "iam_role"("code");

-- CreateIndex
CREATE INDEX "iam_department_membership_department_id_idx" ON "iam_department_membership"("department_id");

-- CreateIndex
CREATE INDEX "iam_user_role_assignment_role_id_idx" ON "iam_user_role_assignment"("role_id");

-- CreateIndex
CREATE INDEX "iam_role_permission_permission_code_idx" ON "iam_role_permission"("permission_code");

-- AddForeignKey
ALTER TABLE "iam_department_membership" ADD CONSTRAINT "iam_department_membership_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "iam_application_user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "iam_department_membership" ADD CONSTRAINT "iam_department_membership_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "iam_department"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "iam_user_role_assignment" ADD CONSTRAINT "iam_user_role_assignment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "iam_application_user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "iam_user_role_assignment" ADD CONSTRAINT "iam_user_role_assignment_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "iam_role"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "iam_role_permission" ADD CONSTRAINT "iam_role_permission_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "iam_role"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "iam_role_permission" ADD CONSTRAINT "iam_role_permission_permission_code_fkey" FOREIGN KEY ("permission_code") REFERENCES "iam_permission"("code") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Hand-written, reviewed: constraints Prisma cannot express (IAM-MP-01 D-08).
ALTER TABLE "iam_application_user" ADD CONSTRAINT "iam_application_user_email_normalized_ck"
  CHECK (char_length(email) BETWEEN 3 AND 254 AND octet_length(email) = char_length(email)
    AND email !~ '[[:space:][:cntrl:]]' AND email = lower(email)
    AND email ~ '^[^@]+@[^@]+$');
ALTER TABLE "iam_application_user" ADD CONSTRAINT "iam_application_user_display_name_ck"
  CHECK (char_length(display_name) BETWEEN 1 AND 200 AND display_name = btrim(display_name)
    AND display_name !~ '[[:cntrl:]]');
ALTER TABLE "iam_application_user" ADD CONSTRAINT "iam_application_user_identity_pair_ck"
  CHECK ((identity_issuer IS NULL) = (identity_subject IS NULL)
    AND (identity_issuer IS NULL OR (char_length(identity_issuer) > 0 AND char_length(identity_subject) > 0)));
ALTER TABLE "iam_application_user" ADD CONSTRAINT "iam_application_user_active_ck"
  CHECK (access_state <> 'ACTIVE' OR (identity_subject IS NOT NULL AND first_activated_at IS NOT NULL));
ALTER TABLE "iam_application_user" ADD CONSTRAINT "iam_application_user_invited_ck"
  CHECK (access_state <> 'INVITED' OR first_activated_at IS NULL);
ALTER TABLE "iam_application_user" ADD CONSTRAINT "iam_application_user_invitation_sent_ck"
  CHECK ((invitation_delivery_state <> 'SENT' OR invitation_sent_at IS NOT NULL)
    AND (invitation_delivery_state <> 'NOT_SENT' OR invitation_sent_at IS NULL));
ALTER TABLE "iam_application_user" ADD CONSTRAINT "iam_application_user_version_ck"
  CHECK (version >= 1);

ALTER TABLE "iam_department" ADD CONSTRAINT "iam_department_code_ck"
  CHECK (char_length(code) BETWEEN 2 AND 64 AND octet_length(code) = char_length(code)
    AND code ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE "iam_department" ADD CONSTRAINT "iam_department_name_ck"
  CHECK (char_length(name) BETWEEN 1 AND 200 AND name = btrim(name) AND name !~ '[[:cntrl:]]');
ALTER TABLE "iam_department" ADD CONSTRAINT "iam_department_description_ck"
  CHECK (description IS NULL OR (char_length(description) BETWEEN 1 AND 2000
    AND description = btrim(description) AND description !~ '[[:cntrl:]]'));
ALTER TABLE "iam_department" ADD CONSTRAINT "iam_department_version_ck"
  CHECK (version >= 1);

ALTER TABLE "iam_role" ADD CONSTRAINT "iam_role_code_ck"
  CHECK (char_length(code) BETWEEN 2 AND 64 AND octet_length(code) = char_length(code)
    AND code ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE "iam_role" ADD CONSTRAINT "iam_role_name_ck"
  CHECK (char_length(name) BETWEEN 1 AND 200 AND name = btrim(name) AND name !~ '[[:cntrl:]]');
ALTER TABLE "iam_role" ADD CONSTRAINT "iam_role_description_ck"
  CHECK (description IS NULL OR (char_length(description) BETWEEN 1 AND 2000
    AND description = btrim(description) AND description !~ '[[:cntrl:]]'));
ALTER TABLE "iam_role" ADD CONSTRAINT "iam_role_system_active_ck"
  CHECK (NOT is_system OR state = 'ACTIVE');
ALTER TABLE "iam_role" ADD CONSTRAINT "iam_role_version_ck"
  CHECK (version >= 1);

ALTER TABLE "iam_permission" ADD CONSTRAINT "iam_permission_code_ck"
  CHECK (char_length(code) <= 128 AND octet_length(code) = char_length(code)
    AND code ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*[.][a-z][a-z0-9]*(-[a-z0-9]+)*[.][a-z][a-z0-9]*(-[a-z0-9]+)*$');
ALTER TABLE "iam_permission" ADD CONSTRAINT "iam_permission_owning_module_ck"
  CHECK (char_length(owning_module) BETWEEN 2 AND 32
    AND octet_length(owning_module) = char_length(owning_module)
    AND owning_module ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$');
ALTER TABLE "iam_permission" ADD CONSTRAINT "iam_permission_code_module_ck"
  CHECK (split_part(code, '.', 1) = owning_module);
ALTER TABLE "iam_permission" ADD CONSTRAINT "iam_permission_name_ck"
  CHECK (char_length(name) BETWEEN 1 AND 200 AND name = btrim(name) AND name !~ '[[:cntrl:]]');
ALTER TABLE "iam_permission" ADD CONSTRAINT "iam_permission_description_ck"
  CHECK (char_length(description) BETWEEN 1 AND 2000 AND description = btrim(description)
    AND description !~ '[[:cntrl:]]');

CREATE UNIQUE INDEX "iam_department_membership_one_primary_key"
  ON "iam_department_membership"("user_id") WHERE is_primary;

COMMIT;
