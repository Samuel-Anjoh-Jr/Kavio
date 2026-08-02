-- One team seat can hold several HR labels (BIZ-03), e.g. a person who is
-- both the office manager and the accountant. Mirrors how User/UserRole
-- already lets one identity hold several trading roles.

-- CreateTable
CREATE TABLE "BusinessTeamMemberRole" (
    "id" UUID NOT NULL,
    "teamMemberId" UUID NOT NULL,
    "role" "TeamMemberRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessTeamMemberRole_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BusinessTeamMemberRole_teamMemberId_role_key" ON "BusinessTeamMemberRole"("teamMemberId", "role");
CREATE INDEX "BusinessTeamMemberRole_teamMemberId_idx" ON "BusinessTeamMemberRole"("teamMemberId");

-- AddForeignKey
ALTER TABLE "BusinessTeamMemberRole"
    ADD CONSTRAINT "BusinessTeamMemberRole_teamMemberId_fkey"
    FOREIGN KEY ("teamMemberId") REFERENCES "BusinessTeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: one row per existing member, carrying their single old role forward.
INSERT INTO "BusinessTeamMemberRole" ("id", "teamMemberId", "role", "createdAt")
SELECT gen_random_uuid(), "id", "role", CURRENT_TIMESTAMP
FROM "BusinessTeamMember";

-- DropColumn
ALTER TABLE "BusinessTeamMember" DROP COLUMN "role";
