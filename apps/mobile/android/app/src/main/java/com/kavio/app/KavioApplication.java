package com.kavio.app;

import android.app.Application;

import com.kavio.app.alerts.AlertChannels;

public class KavioApplication extends Application {
	@Override
	public void onCreate() {
		super.onCreate();
		// Channels must exist before the first push can arrive (right after
		// install, before the WebView has loaded), so create them at process
		// start: ringing bookings/jobs, payments, wallet, updates, general.
		AlertChannels.ensure(this);
	}
}
