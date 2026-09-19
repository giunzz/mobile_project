import { useEffect, useState } from 'react';

// Re-evaluate stale heartbeats and cooldown even when RTDB sends no new data.
export function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
