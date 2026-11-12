package com.kavio.app.alerts;

import android.app.Activity;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * JS bridge "KavioAlerts" (apps/web/lib/alerts/native-alerts.ts in the Kavio web app).
 *
 * Its presence is how the web code — shipped over the air — knows this
 * native build rings natively, so it registers the device as alertsVersion 2.
 */
@CapacitorPlugin(name = "KavioAlerts")
public class AlertsPlugin extends Plugin {

    private static AlertsPlugin instance;

    @Override
    public void load() {
        instance = this;
        AlertChannels.ensure(getContext());
    }

    @PluginMethod
    public void getInfo(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("alertsVersion", AlertConfig.ALERTS_VERSION);
        ret.put("canUseFullScreenIntent", canUseFullScreenIntent(getContext()));
        ret.put("ringing", RingService.currentTag != null);
        call.resolve(ret);
    }

    @PluginMethod
    public void stopRing(PluginCall call) {
        RingService.stop(getContext());
        call.resolve();
    }

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
            .putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName())
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    /** Android 14+ asks users to allow full-screen alerts per app. */
    @PluginMethod
    public void openFullScreenIntentSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 34) {
            Intent intent = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT)
                .setData(Uri.parse("package:" + getContext().getPackageName()))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        }
        call.resolve();
    }

    static boolean canUseFullScreenIntent(Context context) {
        if (Build.VERSION.SDK_INT < 34) return true;
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        return nm != null && nm.canUseFullScreenIntent();
    }

    /**
     * Called by MainActivity for every launch/new intent. When the intent comes
     * from an alert, stop the ring, acknowledge, and tell the web app which
     * screen to open (retained until a JS listener consumes it, so a cold
     * start still lands on the right page).
     */
    public static void handleAlertIntent(Activity activity, Intent intent) {
        if (intent == null || !intent.hasExtra(AlertNotifier.EXTRA_PATH)) return;
        String path = intent.getStringExtra(AlertNotifier.EXTRA_PATH);
        String action = intent.getStringExtra(AlertNotifier.EXTRA_ACTION);
        String tag = intent.getStringExtra(AlertNotifier.EXTRA_TAG);
        String data = intent.getStringExtra(AlertNotifier.EXTRA_DATA);
        String ackUrl = intent.getStringExtra(AlertNotifier.EXTRA_ACK_URL);

        boolean fullScreen = "fullscreen".equals(action);
        if (fullScreen && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            // Show the ring sheet over the lock screen and wake the display.
            activity.setShowWhenLocked(true);
            activity.setTurnScreenOn(true);
        }
        if (!fullScreen) {
            // Opening or accepting answers the ring; a full-screen launch is
            // the ring itself, so it keeps sounding until the person acts.
            RingService.stopIfRinging(activity, tag);
            AlertAck.send(ackUrl, "accept".equals(action) ? "accept" : "open", null);
        }

        JSObject event = new JSObject();
        event.put("path", path);
        event.put("action", action);
        event.put("tag", tag);
        event.put("data", data);
        if (instance != null) {
            instance.notifyListeners("alertOpened", event, true);
        } else {
            pendingEvent = event;
        }
        // Consume the extras so a configuration change does not replay it.
        intent.removeExtra(AlertNotifier.EXTRA_PATH);
    }

    private static JSObject pendingEvent;

    @Override
    protected void handleOnStart() {
        super.handleOnStart();
        if (pendingEvent != null) {
            notifyListeners("alertOpened", pendingEvent, true);
            pendingEvent = null;
        }
    }
}
