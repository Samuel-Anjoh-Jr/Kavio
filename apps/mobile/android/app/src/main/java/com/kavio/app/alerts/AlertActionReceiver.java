package com.kavio.app.alerts;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import androidx.core.app.NotificationManagerCompat;

/**
 * "Later" on the ring banner, or swiping it away: stop ringing, remove the
 * notification and acknowledge so the escalation ladder stops for this person.
 * Opening the app is handled by an activity PendingIntent instead (Android
 * blocks activity starts from receivers, the "trampoline" rule).
 */
public class AlertActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String tag = intent.getStringExtra(AlertNotifier.EXTRA_TAG);
        String action = intent.getStringExtra(AlertNotifier.EXTRA_ACTION);
        String ackUrl = intent.getStringExtra(AlertNotifier.EXTRA_ACK_URL);
        int notificationId = intent.getIntExtra("notification_id", 0);

        RingService.stopIfRinging(context, tag);
        if (notificationId != 0) NotificationManagerCompat.from(context).cancel(notificationId);

        PendingResult pending = goAsync();
        AlertAck.send(ackUrl, action == null ? "decline" : action, pending::finish);
    }
}
