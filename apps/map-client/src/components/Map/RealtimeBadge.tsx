import { useMapStore } from '@/store/mapStore';

/**
 * Shows the count of active incidents and a live pulse indicator
 * that animates when a new incident is received via WebSocket.
 */
export function RealtimeBadge() {
  const incidents = useMapStore((s) => s.incidents);
  const active = incidents.filter((i) => i.status === 'ACTIVE').length;

  return (
    <div className="absolute top-3 right-14 z-10 flex items-center gap-2
      bg-gray-900 bg-opacity-95 rounded-lg px-3 py-1.5 border border-gray-700 shadow-lg">
      {/* Animated pulse dot */}
      <span className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-600" />
      </span>
      <span className="text-xs text-gray-300">
        <span className="text-white font-semibold">{active}</span> active incident{active !== 1 ? 's' : ''}
      </span>
    </div>
  );
}
