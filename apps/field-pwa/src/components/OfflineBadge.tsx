import React, { useEffect, useState } from 'react';
import { getPendingOperations } from '../lib/offline-db';

export function OfflineBadge() {
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const setOn = () => { setOnline(true); refreshPending(); };
    const setOff = () => setOnline(false);
    window.addEventListener('online', setOn);
    window.addEventListener('offline', setOff);
    refreshPending();
    return () => {
      window.removeEventListener('online', setOn);
      window.removeEventListener('offline', setOff);
    };
  }, []);

  async function refreshPending() {
    const ops = await getPendingOperations();
    setPending(ops.length);
  }

  if (online && pending === 0) return null;

  return (
    <span
      className={`text-xs font-bold px-2 py-0.5 rounded-full ${
        online ? 'bg-amber-700 text-amber-100' : 'bg-red-700 text-red-100'
      }`}
    >
      {online ? `${pending} pending sync` : 'Offline'}
    </span>
  );
}
