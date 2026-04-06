import { useEffect, useRef } from 'react';
import { useMapStore } from '@/store/mapStore';
import type { IncidentReportedEvent } from '@/types/incidents';

const WS_URL = import.meta.env.VITE_WS_URL ?? '/ws';
const RECONNECT_DELAY_MS = 3_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

/**
 * Maintains a WebSocket connection to the CoESCD real-time gateway.
 *
 * Subscribes to:
 *   - gis.incident.reported  → adds/updates incident in the store
 *
 * Implements exponential backoff reconnection. Connection is authenticated
 * via ?token= query param (the same JWT used for API calls).
 */
export function useRealtimeUpdates() {
  const { addOrUpdateIncident } = useMapStore();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectDelay = useRef(RECONNECT_DELAY_MS);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmounted = useRef(false);

  useEffect(() => {
    unmounted.current = false;

    function connect() {
      if (unmounted.current) return;

      const token = sessionStorage.getItem('coescd_token');
      const url = token ? `${WS_URL}?token=${encodeURIComponent(token)}` : WS_URL;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectDelay.current = RECONNECT_DELAY_MS;
        // Subscribe to the GIS incident channel
        ws.send(JSON.stringify({ type: 'subscribe', channel: 'gis.incidents' }));
      };

      ws.onmessage = (evt) => {
        let msg: unknown;
        try {
          msg = JSON.parse(evt.data as string);
        } catch {
          return;
        }

        const { event, data } = msg as IncidentReportedEvent;
        if (event === 'gis.incident.reported' && data) {
          addOrUpdateIncident(data);
        }
      };

      ws.onerror = () => {
        // onerror is always followed by onclose — handle reconnect there
      };

      ws.onclose = () => {
        if (unmounted.current) return;
        reconnectTimer.current = setTimeout(() => {
          reconnectDelay.current = Math.min(
            reconnectDelay.current * 2,
            MAX_RECONNECT_DELAY_MS,
          );
          connect();
        }, reconnectDelay.current);
      };
    }

    connect();

    return () => {
      unmounted.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [addOrUpdateIncident]);
}
