import { useEffect, useCallback, useRef } from 'react';
import { useMapStore } from '@/store/mapStore';
import { mlApi } from '@/api/ml';
import type { HazardType } from '@/types/ml';

const HAZARD_TYPES: HazardType[] = ['flood', 'landslide', 'seismic', 'wildfire'];
const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5-minute cadence matches inference DAG

/**
 * Polls the backend for published risk predictions and keeps the Zustand
 * store (and therefore the choropleth layers) up-to-date.
 *
 * Only fetches when a risk layer is actually visible — avoids unnecessary
 * API calls when the analyst has not enabled any risk overlay.
 */
export function useRiskPredictions() {
  const { layerVisibility, setRiskPredictions } = useMapStore();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAll = useCallback(async () => {
    for (const hazardType of HAZARD_TYPES) {
      const layerId = `risk-${hazardType}-fill`;
      if (!layerVisibility[layerId]) continue;

      try {
        const predictions = await mlApi.getPublishedPredictions(hazardType);
        setRiskPredictions(hazardType, predictions);
      } catch {
        // Non-fatal: risk layer simply shows stale data
      }
    }
  }, [layerVisibility, setRiskPredictions]);

  useEffect(() => {
    fetchAll();
    timerRef.current = setInterval(fetchAll, REFRESH_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchAll]);
}
