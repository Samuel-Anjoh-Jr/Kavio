-- AlterEnum
-- WhatsApp joins SMS as a registered-but-deferred phone channel: the provider,
-- config flag and template seams exist end to end and flip on with
-- NOTIFICATIONS_WHATSAPP_ENABLED once a Business API vendor is connected — no
-- schema change needed at that point.
ALTER TYPE "NotificationChannel" ADD VALUE 'WHATSAPP';
