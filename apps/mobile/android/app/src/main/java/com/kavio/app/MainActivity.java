package com.kavio.app;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.kavio.app.alerts.AlertsPlugin;

public class MainActivity extends BridgeActivity {
	@Override
	public void onCreate(Bundle savedInstanceState) {
		// Native alerts bridge (looping ring, call-style banner, full-screen ring).
		// Must be registered before super.onCreate() builds the Capacitor bridge.
		registerPlugin(AlertsPlugin.class);

		super.onCreate(savedInstanceState);

		// Launched from an alert notification (tap, button, or full-screen ring).
		AlertsPlugin.handleAlertIntent(this, getIntent());
	}

	@Override
	protected void onNewIntent(Intent intent) {
		super.onNewIntent(intent);
		setIntent(intent);
		AlertsPlugin.handleAlertIntent(this, intent);
	}
}
