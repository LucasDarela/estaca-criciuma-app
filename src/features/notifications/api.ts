import { getSupabase } from '@/lib/supabase';
import { isUnitId, type UnitId } from '@/domain/units';

/** RF-17. The units this device is subscribed to, or null when the token is not registered. */
export async function fetchDeviceUnits(token: string): Promise<UnitId[] | null> {
  const { data, error } = await getSupabase().rpc('my_device_units', { p_device_token: token });
  if (error) throw error;
  return data ? data.filter(isUnitId) : null;
}

/** RF-17. Saves the subscribed units (the database orders and deduplicates them). */
export async function setDeviceUnits(token: string, units: readonly UnitId[]): Promise<void> {
  const { error } = await getSupabase().rpc('set_device_units', {
    p_device_token: token,
    p_units: [...units],
  });
  if (error) throw error;
}
