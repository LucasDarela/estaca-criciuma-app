import { getSupabase } from '@/lib/supabase';

import { fetchDeviceUnits, setDeviceUnits } from './api';

jest.mock('@/lib/supabase');

const rpc = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  (getSupabase as jest.Mock).mockReturnValue({ rpc });
});

describe('notifications api', () => {
  it('fetchDeviceUnits returns the known units of the token', async () => {
    rpc.mockResolvedValue({ data: ['estaca', 'icara', 'bogus'], error: null });
    expect(await fetchDeviceUnits('t')).toEqual(['estaca', 'icara']);
    expect(rpc).toHaveBeenCalledWith('my_device_units', { p_device_token: 't' });
  });

  it('fetchDeviceUnits is null for an unregistered token and throws on error', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await fetchDeviceUnits('t')).toBeNull();
    rpc.mockResolvedValue({ data: null, error: new Error('down') });
    await expect(fetchDeviceUnits('t')).rejects.toThrow('down');
  });

  it('CA-18: setDeviceUnits sends the token and the units', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await setDeviceUnits('t', ['estaca', 'icara']);
    expect(rpc).toHaveBeenCalledWith('set_device_units', {
      p_device_token: 't',
      p_units: ['estaca', 'icara'],
    });
  });

  it('setDeviceUnits throws on error', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('invalid_units') });
    await expect(setDeviceUnits('t', ['estaca'])).rejects.toThrow('invalid_units');
  });
});
