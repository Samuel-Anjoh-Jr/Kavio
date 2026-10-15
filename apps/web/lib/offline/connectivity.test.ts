import { describe, expect, it } from 'vitest';
import {
  INITIAL_CONNECTIVITY,
  isNetworkFailure,
  reduceConnectivity,
  type ConnectivityState,
} from './connectivity';

const offline: ConnectivityState = { status: 'offline', reconnected: false };

describe('reduceConnectivity', () => {
  it('starts online, so a connected first paint never shows the offline bar', () => {
    expect(INITIAL_CONNECTIVITY).toEqual({ status: 'online', reconnected: false });
  });

  it('goes offline only on a failed probe', () => {
    expect(reduceConnectivity(INITIAL_CONNECTIVITY, { type: 'probe-failed' })).toEqual(offline);
  });

  it('confirms the return with a one-off "back online" flag', () => {
    expect(reduceConnectivity(offline, { type: 'probe-succeeded' })).toEqual({
      status: 'online',
      reconnected: true,
    });
  });

  it('does not announce a reconnection that never followed an outage', () => {
    const next = reduceConnectivity(INITIAL_CONNECTIVITY, { type: 'probe-succeeded' });
    expect(next).toBe(INITIAL_CONNECTIVITY);
  });

  it('keeps the same object when nothing changed, so subscribers do not re-render', () => {
    expect(reduceConnectivity(offline, { type: 'probe-failed' })).toBe(offline);
  });

  it('drops a pending "back online" message if the link fails again', () => {
    const flapping = reduceConnectivity(offline, { type: 'probe-succeeded' });
    expect(reduceConnectivity(flapping, { type: 'probe-failed' })).toEqual(offline);
  });

  it('dismisses the reconnection message without changing the status', () => {
    const back = reduceConnectivity(offline, { type: 'probe-succeeded' });
    expect(reduceConnectivity(back, { type: 'reconnected-dismissed' })).toEqual({
      status: 'online',
      reconnected: false,
    });
  });
});

describe('isNetworkFailure', () => {
  it('treats a rejected fetch as a transport failure', () => {
    expect(isNetworkFailure(new TypeError('Failed to fetch'))).toBe(true);
  });

  it('treats our own timeout abort as a transport failure', () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    expect(isNetworkFailure(abort)).toBe(true);
  });

  it('never treats an HTTP answer as offline, whatever the status', () => {
    const answered = Object.assign(new TypeError('x'), { status: 503 });
    expect(isNetworkFailure(answered)).toBe(false);
  });

  it('ignores ordinary errors and non-errors', () => {
    expect(isNetworkFailure(new Error('boom'))).toBe(false);
    expect(isNetworkFailure(null)).toBe(false);
    expect(isNetworkFailure('Failed to fetch')).toBe(false);
  });
});
