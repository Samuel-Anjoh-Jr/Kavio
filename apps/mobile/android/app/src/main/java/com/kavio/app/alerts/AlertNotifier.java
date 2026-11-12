package com.kavio.app.alerts;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.drawable.Icon;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import java.util.ArrayList;
import java.util.List;

/**
 * Draws every alerts-v2 notification. The service that rings (RingService)
 * asks this class for its call-style notification; everything else is posted
 * from here directly.
 */
public final class AlertNotifier {
    private AlertNotifier() {}

    static final String EXTRA_PATH = "kavio_alert_path";
    static final String EXTRA_ACTION = "kavio_alert_action";
    static final String EXTRA_DATA = "kavio_alert_data";
    static final String EXTRA_ACK_URL = "kavio_alert_ack_url";
    static final String EXTRA_TAG = "kavio_alert_tag";

    /** Entry point from the messaging service for every alerts-v2 push. */
    static void handle(Context context, AlertPayload p) {
        switch (p.tier) {
            case "cancel":
                RingService.stopIfRinging(context, p.tag);
                NotificationManagerCompat.from(context).cancel(p.notificationId());
                return;
            case "ring":
                if (!RingService.start(context, p)) {
                    // Android refused the foreground service (rare: battery
                    // restrictions). Fall back to an insistent notification,
                    // which repeats its sound until opened or timed out.
                    post(context, p.notificationId(), buildInsistentFallback(context, p));
                }
                return;
            default:
                post(context, p.notificationId(), p.progress >= 0 ? buildLiveCard(context, p) : buildOnce(context, p));
        }
    }

    // ── Ring (call-style, owned by RingService) ─────────────────────────────

    static Notification buildRinging(Context context, AlertPayload p) {
        long endsAt = p.expiresAt > System.currentTimeMillis()
            ? p.expiresAt
            : System.currentTimeMillis() + p.loopSeconds * 1000L;

        NotificationCompat.Builder b = new NotificationCompat.Builder(context, p.channelId)
            .setSmallIcon(AlertConfig.SMALL_ICON)
            .setColor(AlertConfig.BRAND_COLOR)
            .setColorized(true)
            .setContentTitle(p.title)
            .setContentText(p.body)
            .setSubText(p.subtitle)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(joinLines(p.body, p.subtitle)))
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .setOnlyAlertOnce(true)
            .setSilent(true) // RingService owns sound and vibration
            .setShowWhen(true)
            .setWhen(endsAt)
            .setUsesChronometer(true)
            .setChronometerCountDown(true)
            .setContentIntent(openIntent(context, p, "open"))
            .setDeleteIntent(actionBroadcast(context, p, "decline"))
            .setFullScreenIntent(openIntent(context, p, "fullscreen"), true);

        for (String[] action : p.actions) {
            String id = action[0];
            PendingIntent pi = "decline".equals(id) ? actionBroadcast(context, p, "decline") : openIntent(context, p, id);
            b.addAction(new NotificationCompat.Action.Builder(0, action[1], pi).build());
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            b.setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE);
        }
        return b.build();
    }

    /** After the ring ends unanswered: stays in the shade until acted on. */
    static void postMissed(Context context, AlertPayload p) {
        NotificationCompat.Builder b = new NotificationCompat.Builder(context, "general_v2")
            .setSmallIcon(AlertConfig.SMALL_ICON)
            .setColor(AlertConfig.BRAND_COLOR)
            .setContentTitle(p.title)
            .setContentText(p.body)
            .setSubText(p.subtitle)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(joinLines(p.body, p.subtitle)))
            .setCategory(NotificationCompat.CATEGORY_MISSED_CALL)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setAutoCancel(true)
            .setContentIntent(openIntent(context, p, "open"))
            .setDeleteIntent(actionBroadcast(context, p, "decline"));
        for (String[] action : p.actions) {
            if ("decline".equals(action[0])) continue;
            b.addAction(new NotificationCompat.Action.Builder(0, action[1], openIntent(context, p, action[0])).build());
        }
        post(context, p.notificationId(), b.build());
    }

    private static Notification buildInsistentFallback(Context context, AlertPayload p) {
        String channel = p.isDelivery() ? "ring_jobs_fallback_v2" : "ring_orders_fallback_v2";
        Notification n = new NotificationCompat.Builder(context, channel)
            .setSmallIcon(AlertConfig.SMALL_ICON)
            .setColor(AlertConfig.BRAND_COLOR)
            .setContentTitle(p.title)
            .setContentText(p.body)
            .setSubText(p.subtitle)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setAutoCancel(true)
            .setTimeoutAfter(p.loopSeconds * 1000L)
            .setContentIntent(openIntent(context, p, "open"))
            .setFullScreenIntent(openIntent(context, p, "fullscreen"), true)
            .build();
        n.flags |= Notification.FLAG_INSISTENT; // repeat the channel sound until handled
        return n;
    }

    // ── Once ────────────────────────────────────────────────────────────────

    private static Notification buildOnce(Context context, AlertPayload p) {
        NotificationCompat.Builder b = new NotificationCompat.Builder(context, p.channelId)
            .setSmallIcon(AlertConfig.SMALL_ICON)
            .setColor(AlertConfig.BRAND_COLOR)
            .setContentTitle(p.title)
            .setContentText(p.body)
            .setSubText(p.subtitle)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(joinLines(p.body, p.subtitle)))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setOnlyAlertOnce(p.repeat)
            .setContentIntent(openIntent(context, p, "open"));
        if (!p.vibrate) b.setVibrate(new long[] {0});
        for (String[] action : p.actions) {
            b.addAction(new NotificationCompat.Action.Builder(0, action[1], openIntent(context, p, action[0])).build());
        }
        return b.build();
    }

    // ── Live order card (progress) ──────────────────────────────────────────

    /**
     * One card per order, replaced at each stage. On Android 16+ it is a
     * ProgressStyle notification: a segmented track (one segment per stage)
     * with the vehicle icon riding along it, promoted as a Live Update. Older
     * versions get a classic progress bar.
     */
    private static Notification buildLiveCard(Context context, AlertPayload p) {
        boolean done = p.progress >= 100;
        String text = p.stage != null ? p.stage + (p.body.isEmpty() ? "" : " · " + p.body) : p.body;

        if (Build.VERSION.SDK_INT >= 36) {
            Notification.ProgressStyle style = new Notification.ProgressStyle()
                .setStyledByProgress(true)
                .setProgress(p.progress)
                .setProgressTrackerIcon(Icon.createWithResource(context, AlertConfig.SMALL_ICON));
            List<Notification.ProgressStyle.Segment> segments = new ArrayList<>();
            for (int i = 0; i < 4; i++) {
                segments.add(new Notification.ProgressStyle.Segment(25).setColor(AlertConfig.BRAND_COLOR));
            }
            style.setProgressSegments(segments);
            List<Notification.ProgressStyle.Point> points = new ArrayList<>();
            for (int at : new int[] {25, 50, 75}) {
                points.add(new Notification.ProgressStyle.Point(at).setColor(AlertConfig.BRAND_COLOR));
            }
            style.setProgressPoints(points);

            Notification.Builder b = new Notification.Builder(context, p.channelId)
                .setSmallIcon(AlertConfig.SMALL_ICON)
                .setColor(AlertConfig.BRAND_COLOR)
                .setContentTitle(p.title)
                .setContentText(text)
                .setSubText(p.subtitle)
                .setStyle(style)
                .setOngoing(!done)
                .setOnlyAlertOnce(true)
                .setAutoCancel(done)
                .setContentIntent(openIntent(context, p, "open"))
                .setCategory(Notification.CATEGORY_STATUS);
            for (String[] action : p.actions) {
                b.addAction(new Notification.Action.Builder(null, action[1], openIntent(context, p, action[0])).build());
            }
            requestPromotion(b);
            return b.build();
        }

        NotificationCompat.Builder b = new NotificationCompat.Builder(context, p.channelId)
            .setSmallIcon(AlertConfig.SMALL_ICON)
            .setColor(AlertConfig.BRAND_COLOR)
            .setContentTitle(p.title)
            .setContentText(text)
            .setSubText(p.subtitle)
            .setProgress(100, Math.max(0, p.progress), false)
            .setOngoing(!done)
            .setOnlyAlertOnce(true)
            .setAutoCancel(done)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setContentIntent(openIntent(context, p, "open"));
        for (String[] action : p.actions) {
            b.addAction(new NotificationCompat.Action.Builder(0, action[1], openIntent(context, p, action[0])).build());
        }
        return b.build();
    }

    /** Android 16 Live Update promotion; ignored where unsupported. */
    private static void requestPromotion(Notification.Builder b) {
        try {
            b.getClass().getMethod("setRequestPromotedOngoing", boolean.class).invoke(b, true);
        } catch (Exception ignored) {
            // Platform without Live Updates: shows as a normal ongoing card.
        }
    }

    // ── Intents ─────────────────────────────────────────────────────────────

    /** Opens the app at the alert's screen (activity, so no trampoline). */
    static PendingIntent openIntent(Context context, AlertPayload p, String action) {
        Intent intent = new Intent(context, AlertConfig.LAUNCH_ACTIVITY)
            .setAction("com.kavio.app.alerts.OPEN." + action + "." + p.tag)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra(EXTRA_PATH, p.path)
            .putExtra(EXTRA_ACTION, action)
            .putExtra(EXTRA_TAG, p.tag)
            .putExtra(EXTRA_ACK_URL, p.ackUrl)
            .putExtra(EXTRA_DATA, p.toJson());
        return PendingIntent.getActivity(
            context,
            requestCode(p, action),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    /** Background action (Later / swipe away): stop ring + ack, no screen. */
    static PendingIntent actionBroadcast(Context context, AlertPayload p, String action) {
        Intent intent = new Intent(context, AlertActionReceiver.class)
            .setAction("com.kavio.app.alerts.ACTION." + action + "." + p.tag)
            .putExtra(EXTRA_ACTION, action)
            .putExtra(EXTRA_TAG, p.tag)
            .putExtra(EXTRA_ACK_URL, p.ackUrl)
            .putExtra("notification_id", p.notificationId());
        return PendingIntent.getBroadcast(
            context,
            requestCode(p, action),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private static int requestCode(AlertPayload p, String action) {
        return (p.tag + ":" + action).hashCode();
    }

    static void post(Context context, int id, Notification n) {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        try {
            manager.notify(id, n);
        } catch (SecurityException e) {
            // POST_NOTIFICATIONS not granted (Android 13+): nothing we can show.
        }
    }

    private static String joinLines(String a, String b) {
        if (b == null || b.isEmpty()) return a;
        if (a == null || a.isEmpty()) return b;
        return a + "\n" + b;
    }
}
