package com.kavio.app.alerts;

import androidx.annotation.NonNull;

import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;

/**
 * Replaces Capacitor's push MessagingService (removed in the manifest) so the
 * app can draw alerts itself: data-only alerts-v2 messages arrive here even
 * when the app is closed, which is what lets a funded booking ring like a call.
 * Everything still flows on to Capacitor (super) so the web app's push
 * listeners keep working, token refreshes included.
 */
public class AlertMessagingService extends MessagingService {
    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        if (AlertPayload.isAlert(remoteMessage.getData())) {
            try {
                AlertNotifier.handle(this, AlertPayload.from(remoteMessage.getData()));
            } catch (Exception e) {
                android.util.Log.e("KavioAlerts", "Alert handling failed", e);
            }
        }
        super.onMessageReceived(remoteMessage);
    }
}
