import { useEffect, useState } from 'react';

const MINUTE_MS = 60_000;

/** The current instant, refreshed every minute (today highlight, "now" line). Tests control it with fake timers. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), MINUTE_MS);
    return () => clearInterval(timer);
  }, []);
  return now;
}
