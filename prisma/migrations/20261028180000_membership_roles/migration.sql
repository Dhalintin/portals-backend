ALTER TABLE "Membership" ADD COLUMN "roles" "OrgRole"[] NOT NULL DEFAULT ARRAY[]::"OrgRole"[];
UPDATE "Membership" SET "roles" = ARRAY["role"];
