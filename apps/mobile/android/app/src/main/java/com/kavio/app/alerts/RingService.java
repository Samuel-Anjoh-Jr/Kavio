package com.kavio.app.alerts;

import android.app.Notification;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationAttributes;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.util.Log;

import androidx.annotation.Nullable;

/**
 * Rings like an incoming phone call: loops the brand ringtone on the
 * RINGTONE stream and repeats the vibration for the admin-configured length,
 * while showing the colourised call-style notification as its foreground
 * notification (full-screen over the lock screen where allowed).
 *
 * A "shortService" foreground service (Android 14+): no special permission,
 * capped by the OS at ~3 minutes, far above the 120 s maximum ring.
 * Starting it from a high-priority FCM message is an allowed background start.
 */
public class RingService extends Service {
    private static final String TAG = "KavioAlerts";
    static final String ACTION_START = "com.kavio.app.alerts.RING_START";
    static final String ACTION_STOP = "com.kavio.app.alerts.RING_STOP";
    private static final String EXTRA_DATA = "data";

    /** Tag of the alert currently ringing (null when silent). */
    static volatile String currentTag;

    private MediaPlayer player;
    private Vibrator vibrator;
    private PowerManager.WakeLock wakeLock;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private AlertPayload payload;
    private final Runnable timeout = () -> finish(true);

    /** @return false when the OS refused to start the service. */
    static boolean start(Context context, AlertPayload p) {
        Intent intent = new Intent(context, RingService.class).setAction(ACTION_START).putExtra(EXTRA_DATA, p.raw);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent);
            else context.startService(intent);
            return true;
        } catch (Exception e) {
            Log.w(TAG, "Ring service start refused: " + e.getMessage());
            return false;
        }
    }

    static void stop(Context context) {
        if (currentTag == null) return;
        try {
            context.startService(new Intent(context, RingService.class).setAction(ACTION_STOP));
        } catch (Exception e) {
            Log.w(TAG, "Ring stop failed: " + e.getMessage());
        }
    }

    static void stopIfRinging(Context context, String tag) {
        if (tag != null && tag.equals(currentTag)) stop(context);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || ACTION_STOP.equals(intent.getAction())) {
            finish(false);
            return START_NOT_STICKY;
        }
        Bundle data = intent.getBundleExtra(EXTRA_DATA);
        AlertPayload next = AlertPayload.from(data);

        // A new ring replaces the current one (e.g. a second order).
        stopSoundAndVibration();
        handler.removeCallbacks(timeout);
        payload = next;
        currentTag = next.tag;

        Notification notification = AlertNotifier.buildRinging(this, next);
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(AlertConfig.RING_NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SHORT_SERVICE);
            } else {
                startForeground(AlertConfig.RING_NOTIFICATION_ID, notification);
            }
        } catch (Exception e) {
            Log.w(TAG, "startForeground failed: " + e.getMessage());
            currentTag = null;
            stopSelf();
            return START_NOT_STICKY;
        }

        acquireWakeLock(next.loopSeconds);
        startSound(next.sound);
        if (next.vibrate) startVibration(next.vibration);
        handler.postDelayed(timeout, next.loopSeconds * 1000L);
        return START_NOT_STICKY;
    }

    private void startSound(String sound) {
        int resId = getResources().getIdentifier(sound, "raw", getPackageName());
        if (resId == 0) resId = getResources().getIdentifier("ring_new_order", "raw", getPackageName());
        if (resId == 0) return;
        try {
            player = new MediaPlayer();
            player.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build());
            player.setDataSource(this, Uri.parse("android.resource://" + getPackageName() + "/" + resId));
            player.setLooping(true);
            player.prepare();
            player.start();
        } catch (Exception e) {
            Log.w(TAG, "Ring sound failed: " + e.getMessage());
            releasePlayer();
        }
    }

    private void startVibration(long[] pattern) {
        long[] p = pattern != null && pattern.length > 1 ? pattern : new long[] {0, 900, 400, 900, 400, 900, 1200};
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                VibratorManager vm = (VibratorManager) getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                vibrator = vm != null ? vm.getDefaultVibrator() : null;
            } else {
                vibrator = legacyVibrator();
            }
            if (vibrator == null || !vibrator.hasVibrator()) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                // Ringtone usage: vibrates in vibrate mode like an incoming call.
                vibrator.vibrate(
                    VibrationEffect.createWaveform(p, 0), // repeat from index 0
                    VibrationAttributes.createForUsage(VibrationAttributes.USAGE_RINGTONE)
                );
            } else {
                vibrateLegacy(p);
            }
        } catch (Exception e) {
            Log.w(TAG, "Ring vibration failed: " + e.getMessage());
        }
    }

    @SuppressWarnings("deprecation")
    private void vibrateLegacy(long[] p) {
        AudioAttributes attrs = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
            .build();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createWaveform(p, 0), attrs);
        } else {
            vibrator.vibrate(p, 0, attrs);
        }
    }

    @SuppressWarnings("deprecation")
    private Vibrator legacyVibrator() {
        return (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
    }

    private void acquireWakeLock(int seconds) {
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm == null) return;
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "kavioalerts:ring");
            wakeLock.acquire((seconds + 5) * 1000L);
        } catch (Exception e) {
            wakeLock = null;
        }
    }

    /** @param missed true when the ring timed out unanswered. */
    private void finish(boolean missed) {
        handler.removeCallbacks(timeout);
        stopSoundAndVibration();
        AlertPayload p = payload;
        payload = null;
        currentTag = null;
        removeForegroundNotification();
        if (missed && p != null) AlertNotifier.postMissed(this, p);
        stopSelf();
    }

    @SuppressWarnings("deprecation")
    private void removeForegroundNotification() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) stopForeground(STOP_FOREGROUND_REMOVE);
        else stopForeground(true);
    }

    private void stopSoundAndVibration() {
        releasePlayer();
        if (vibrator != null) {
            try {
                vibrator.cancel();
            } catch (Exception ignored) {
                // ignore
            }
            vibrator = null;
        }
        if (wakeLock != null && wakeLock.isHeld()) {
            try {
                wakeLock.release();
            } catch (Exception ignored) {
                // ignore
            }
        }
        wakeLock = null;
    }

    private void releasePlayer() {
        if (player == null) return;
        try {
            player.stop();
        } catch (Exception ignored) {
            // ignore
        }
        player.release();
        player = null;
    }

    /** Android 14+: the OS ends a shortService after its time budget. */
    @Override
    public void onTimeout(int startId) {
        finish(true);
    }

    /** Android 15+ variant of the same callback. */
    @Override
    public void onTimeout(int startId, int fgsType) {
        finish(true);
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(timeout);
        stopSoundAndVibration();
        currentTag = null;
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
