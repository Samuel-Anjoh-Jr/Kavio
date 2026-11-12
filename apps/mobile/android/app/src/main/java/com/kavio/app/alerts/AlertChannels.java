package com.kavio.app.alerts;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;

/**
 * Alerts v2 notification channels. Created at process start (from the
 * Application) so a push can never target a channel that does not exist yet.
 *
 * Channel sounds are frozen by Android once a channel exists, which is why
 * these ids carry a version suffix: changing a sound means a new id.
 *
 * Ring channels have NO sound: RingService loops the ringtone itself on the
 * ringtone stream (a channel sound plays once and stops). They are still
 * IMPORTANCE_HIGH so the call-style banner pops up over other apps.
 */
public final class AlertChannels {
    private AlertChannels() {}

    // id, name, description, importance, raw sound (null = silent), vibrate
    private static final Object[][] CHANNELS = {
        {"ring_orders_v2", "Funded bookings (ringing)", "Rings like a call when a client pays a booking into escrow", NotificationManager.IMPORTANCE_HIGH, null, false},
        {"ring_jobs_v2", "Job invitations (ringing)", "Rings like a call when a client invites you to a job", NotificationManager.IMPORTANCE_HIGH, null, false},
        // Used only if Android refuses the ring service: the channel sound repeats (FLAG_INSISTENT).
        {"ring_orders_fallback_v2", "Funded bookings (backup ring)", "Backup ring when the phone blocks the ringing service", NotificationManager.IMPORTANCE_HIGH, "ring_new_order", true},
        {"ring_jobs_fallback_v2", "Job invitations (backup ring)", "Backup ring when the phone blocks the ringing service", NotificationManager.IMPORTANCE_HIGH, "ring_new_job", true},
        {"payments_v2", "Payments", "Money received and escrow released", NotificationManager.IMPORTANCE_HIGH, "payment_success", true},
        {"wallet_v2", "Wallet", "Payouts and refunds", NotificationManager.IMPORTANCE_DEFAULT, "wallet_update", true},
        {"delivered_v2", "Work completed", "Work marked done or accepted", NotificationManager.IMPORTANCE_HIGH, "delivery_confirmation", true},
        {"order_updates_v2", "Bookings and quotes", "Quotes, applications and job status", NotificationManager.IMPORTANCE_DEFAULT, "order_update", true},
        {"general_v2", "General", "Messages, trust milestones and account notices", NotificationManager.IMPORTANCE_DEFAULT, "generic_notification", true},
        {"live_updates_v2", "Live job status", "One card per job that updates silently", NotificationManager.IMPORTANCE_LOW, null, false},
    };

    public static void ensure(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;

        AudioAttributes notificationAudio = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();

        for (Object[] c : CHANNELS) {
            NotificationChannel channel = new NotificationChannel((String) c[0], (String) c[1], (Integer) c[3]);
            channel.setDescription((String) c[2]);
            channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
            channel.setShowBadge(true);
            String sound = (String) c[4];
            if (sound != null) {
                int resId = context.getResources().getIdentifier(sound, "raw", context.getPackageName());
                if (resId != 0) {
                    channel.setSound(Uri.parse("android.resource://" + context.getPackageName() + "/" + resId), notificationAudio);
                }
            } else {
                channel.setSound(null, null);
            }
            channel.enableVibration((Boolean) c[5]);
            if ((Boolean) c[5]) channel.setVibrationPattern(new long[] {0, 250, 120, 250});
            if (((String) c[0]).startsWith("ring_")) {
                channel.setBypassDnd(false);
                channel.enableLights(true);
                channel.setLightColor(AlertConfig.BRAND_COLOR);
            }
            manager.createNotificationChannel(channel);
        }
    }
}
