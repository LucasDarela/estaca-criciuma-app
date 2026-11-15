import { track } from './telemetry';

afterEach(() => jest.restoreAllMocks());

describe('track', () => {
  it('logs the event and its ids as JSON in development', () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => {});
    track('role_granted', { membership_id: 'm1' });
    expect(info).toHaveBeenCalledWith('{"event":"role_granted","membership_id":"m1"}');
  });

  it('[roles] logs the calling events with only ids', () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => {});
    track('calling_granted', { membership_id: 'mc1', calling_id: 'bishop' });
    expect(info).toHaveBeenCalledWith(
      '{"event":"calling_granted","membership_id":"mc1","calling_id":"bishop"}',
    );
  });

  it('logs only the event name without props', () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => {});
    track('data_exported');
    expect(info).toHaveBeenCalledWith('{"event":"data_exported"}');
  });

  it('logs nothing outside development', () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => {});
    const g = globalThis as unknown as { __DEV__: boolean };
    const dev = g.__DEV__;
    g.__DEV__ = false;
    try {
      track('account_deleted');
    } finally {
      g.__DEV__ = dev;
    }
    expect(info).not.toHaveBeenCalled();
  });
});
