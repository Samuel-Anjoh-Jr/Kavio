package com.kavio.app.alerts;

import android.util.Log;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Tells the server the person acted on a ring, which stops the escalation
 * ladder (WhatsApp/SMS/voice). The URL is signed by the server and carried in
 * the push, so no session token is needed here.
 */
final class AlertAck {
    private AlertAck() {}

    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();

    static void send(String ackUrl, String action, Runnable done) {
        if (ackUrl == null || ackUrl.isEmpty() || !ackUrl.startsWith("http")) {
            if (done != null) done.run();
            return;
        }
        EXECUTOR.execute(() -> {
            HttpURLConnection conn = null;
            try {
                conn = (HttpURLConnection) URI.create(ackUrl).toURL().openConnection();
                conn.setRequestMethod("POST");
                conn.setConnectTimeout(8000);
                conn.setReadTimeout(8000);
                conn.setDoOutput(true);
                conn.setRequestProperty("Content-Type", "application/json");
                byte[] body = ("{\"action\":\"" + action.replaceAll("[^a-z]", "") + "\"}").getBytes(StandardCharsets.UTF_8);
                try (OutputStream out = conn.getOutputStream()) {
                    out.write(body);
                }
                conn.getResponseCode();
            } catch (Exception e) {
                Log.w("KavioAlerts", "Ack failed: " + e.getMessage());
            } finally {
                if (conn != null) conn.disconnect();
                if (done != null) done.run();
            }
        });
    }
}
