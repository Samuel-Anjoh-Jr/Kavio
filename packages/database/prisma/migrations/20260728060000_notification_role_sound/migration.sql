-- AlterTable
ALTER TABLE "Notification" ADD COLUMN "relevantRole" "Role",
ADD COLUMN "soundKey" TEXT;

-- CreateTable
CREATE TABLE "NotificationSoundPreference" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "soundKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationSoundPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotificationSoundPreference_userId_idx" ON "NotificationSoundPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationSoundPreference_userId_category_key" ON "NotificationSoundPreference"("userId", "category");

-- AddForeignKey
ALTER TABLE "NotificationSoundPreference" ADD CONSTRAINT "NotificationSoundPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
