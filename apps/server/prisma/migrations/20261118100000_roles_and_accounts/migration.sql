-- AlterTable
ALTER TABLE "roles" ADD COLUMN     "rank" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "disabled_at" TIMESTAMP(3),
ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sessions_revoked_before" TIMESTAMP(3);

-- Ranks of the roles that already exist. The server copies ranks and permissions from the code at
-- each startup anyway (and creates the new "moderator" role then); this only keeps the table right
-- between the migration and that first startup.
UPDATE "roles"
SET "rank" = CASE "name"
  WHEN 'admin' THEN 40
  WHEN 'member' THEN 20
  WHEN 'guest' THEN 10
  ELSE 0
END;
