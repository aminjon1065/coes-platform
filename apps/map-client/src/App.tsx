import { Header } from '@/components/Layout/Header';
import { MapContainer } from '@/components/Map/MapContainer';
import { LayerPanel } from '@/components/Map/LayerPanel';
import { RealtimeBadge } from '@/components/Map/RealtimeBadge';
import { useIncidents } from '@/hooks/useIncidents';
import { useRealtimeUpdates } from '@/hooks/useRealtimeUpdates';

/**
 * Root app component.
 *
 * Layout:
 *   ┌─────────────────────────────────┐
 *   │  Header (h-12, brand-900)       │
 *   ├─────────────────────────────────┤
 *   │  Map (flex-1)                   │
 *   │  ├── LayerPanel (absolute left) │
 *   │  ├── RealtimeBadge (abs right)  │
 *   │  └── IncidentPopup (abs bottom) │
 *   └─────────────────────────────────┘
 *
 * useIncidents()        — initial HTTP fetch of active incidents
 * useRealtimeUpdates()  — WebSocket subscription for live updates
 */
function MapApp() {
  useIncidents();
  useRealtimeUpdates();

  return (
    <div className="relative w-full h-full">
      <MapContainer />
      <LayerPanel />
      <RealtimeBadge />
    </div>
  );
}

export default function App() {
  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white overflow-hidden">
      <Header />
      <main className="flex-1 relative overflow-hidden">
        <MapApp />
      </main>
    </div>
  );
}
