package com.kavio.app.alerts;

import android.os.Bundle;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * The FCM data map of an alerts-v2 push (backend: notifications/alerts/alert-fcm.ts),
 * parsed once. All FCM data values arrive as strings.
 */
final class AlertPayload {
    final Bundle raw;
    final String tier;
    final String event;
    final String title;
    final String body;
    final String subtitle;
    final String sound;
    final int loopSeconds;
    final boolean vibrate;
    final long[] vibration;
    final String channelId;
    final String path;
    final String tag;
    final String alertId;
    final String ackUrl;
    final long expiresAt;
    final int progress;
    final String stage;
    final boolean repeat;
    final List<String[]> actions;

    private AlertPayload(Bundle b) {
        raw = b;
        tier = str(b, "tier", "once");
        event = str(b, "event", "GENERIC");
        title = str(b, "title", AlertConfig.APP_NAME);
        body = str(b, "body", "");
        subtitle = str(b, "subtitle", null);
        sound = str(b, "sound", "generic_notification");
        loopSeconds = clamp(parseInt(str(b, "loopSeconds", "30"), 30), 5, 120);
        vibrate = !"0".equals(str(b, "vibrate", "1"));
        vibration = parseLongs(str(b, "vibration", ""));
        channelId = str(b, "channelId", "general_v2");
        path = str(b, "path", "/");
        tag = str(b, "tag", "alert-" + System.currentTimeMillis());
        alertId = str(b, "alertId", null);
        ackUrl = str(b, "ackUrl", null);
        expiresAt = parseLong(str(b, "expiresAt", "0"), 0L);
        progress = b.containsKey("progress") ? clamp(parseInt(str(b, "progress", "-1"), -1), -1, 100) : -1;
        stage = str(b, "stage", null);
        repeat = "1".equals(str(b, "repeat", "0"));
        actions = parseActions(str(b, "actions", "[]"));
    }

    static boolean isAlert(Map<String, String> data) {
        return data != null && "2".equals(data.get("kv"));
    }

    static AlertPayload from(Map<String, String> data) {
        Bundle b = new Bundle();
        for (Map.Entry<String, String> e : data.entrySet()) b.putString(e.getKey(), e.getValue());
        return new AlertPayload(b);
    }

    static AlertPayload from(Bundle bundle) {
        return new AlertPayload(bundle == null ? new Bundle() : bundle);
    }

    /** Stable notification id per order/delivery, so updates replace in place. */
    int notificationId() {
        return (tag.hashCode() & 0x7fffffff) % 1_000_000_000;
    }

    boolean isDelivery() {
        return "DELIVERY_AVAILABLE".equals(event);
    }

    String toJson() {
        JSONObject o = new JSONObject();
        try {
            for (String key : raw.keySet()) o.put(key, raw.getString(key));
        } catch (Exception ignored) {
            // Best effort: the web side tolerates missing fields.
        }
        return o.toString();
    }

    private static String str(Bundle b, String key, String fallback) {
        String v = b.getString(key);
        return v == null || v.isEmpty() ? fallback : v;
    }

    private static int parseInt(String s, int fallback) {
        try {
            return Integer.parseInt(s.trim());
        } catch (Exception e) {
            return fallback;
        }
    }

    private static long parseLong(String s, long fallback) {
        try {
            return Long.parseLong(s.trim());
        } catch (Exception e) {
            return fallback;
        }
    }

    private static int clamp(int v, int lo, int hi) {
        return Math.max(lo, Math.min(hi, v));
    }

    private static long[] parseLongs(String csv) {
        if (csv == null || csv.isEmpty()) return new long[0];
        String[] parts = csv.split(",");
        long[] out = new long[parts.length];
        int n = 0;
        for (String p : parts) {
            try {
                out[n++] = Math.max(0, Long.parseLong(p.trim()));
            } catch (Exception ignored) {
                // skip junk
            }
        }
        long[] trimmed = new long[n];
        System.arraycopy(out, 0, trimmed, 0, n);
        return trimmed;
    }

    private static List<String[]> parseActions(String json) {
        List<String[]> list = new ArrayList<>();
        try {
            JSONArray arr = new JSONArray(json);
            for (int i = 0; i < arr.length() && i < 3; i++) {
                JSONObject a = arr.getJSONObject(i);
                list.add(new String[] {a.optString("id", "open"), a.optString("title", "Open")});
            }
        } catch (Exception ignored) {
            // No actions is fine.
        }
        return list;
    }
}
