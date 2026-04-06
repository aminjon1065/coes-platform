import { useEffect } from 'react';
import { fetchIncidents } from '@/api/incidents';
import { useMapStore } from '@/store/mapStore';

/**
 * Fetches the active incident list from the backend and populates the store.
 * Re-fetches whenever the status or severity filter changes.
 */
export function useIncidents() {
  const { setIncidents, statusFilter, severityFilter } = useMapStore();

  useEffect(() => {
    let cancelled = false;

    fetchIncidents({
      status: statusFilter === 'ALL' ? undefined : statusFilter,
      minSeverity: severityFilter > 1 ? severityFilter : undefined,
      limit: 500,
    })
      .then((fc) => {
        if (cancelled) return;
        const incidents = fc.features.map((f) => ({
          ...f.properties,
          coordinates: f.geometry.coordinates as [number, number],
        }));
        setIncidents(incidents);
      })
      .catch((err) => {
        if (!cancelled) console.error('Failed to fetch incidents:', err);
      });

    return () => { cancelled = true; };
  }, [statusFilter, severityFilter, setIncidents]);
}
