package com.kavio.app.alerts;

import android.graphics.Color;

import com.kavio.app.MainActivity;
import com.kavio.app.R;

/**
 * The only app-specific values in the alerts package (brand, icon, activity),
 * so the same package drops into the other apps by changing this file.
 */
final class AlertConfig {
    private AlertConfig() {}

    /** Bump when the native alert behaviour changes in a way the server must know. */
    static final int ALERTS_VERSION = 2;

    static final int BRAND_COLOR = Color.parseColor("#3D5AFE");
    static final int SMALL_ICON = R.drawable.ic_stat_alert;
    static final Class<?> LAUNCH_ACTIVITY = MainActivity.class;
    static final String APP_NAME = "Kavio";

    /** Notification id for the ringing foreground service (one ring at a time). */
    static final int RING_NOTIFICATION_ID = 7_400_001;
}
