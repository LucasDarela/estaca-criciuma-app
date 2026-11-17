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

  it('[leadership] logs the link and phone events without numbers or names', () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => {});
    track('org_chart_link_saved', { kind: 'unit_org', unit_id: 'criciuma1' });
    track('profile_phone_saved', { shown: true });
    expect(info).toHaveBeenNthCalledWith(
      1,
      '{"event":"org_chart_link_saved","kind":"unit_org","unit_id":"criciuma1"}',
    );
    expect(info).toHaveBeenNthCalledWith(2, '{"event":"profile_phone_saved","shown":true}');
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

  it('[event-form] RNF-04: logs the event events with only ids', () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => {});
    track('event_created', { event_id: 'e1', unit_id: 'icara' });
    track('event_deleted', { event_id: 'e1' });
    expect(info).toHaveBeenNthCalledWith(
      1,
      '{"event":"event_created","event_id":"e1","unit_id":"icara"}',
    );
    expect(info).toHaveBeenNthCalledWith(2, '{"event":"event_deleted","event_id":"e1"}');
  });
});
