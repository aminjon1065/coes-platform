import { useMapStore, LAYER_IDS } from '@/store/mapStore';

interface LayerToggleProps {
  layerId: string;
  label: string;
  color: string;
  shape?: 'circle' | 'square' | 'line';
}

function LayerToggle({ layerId, label, color, shape = 'square' }: LayerToggleProps) {
  const { layerVisibility, toggleLayer } = useMapStore();
  const visible = layerVisibility[layerId] ?? false;

  return (
    <label className="flex items-center gap-2 cursor-pointer group py-1">
      <input
        type="checkbox"
        className="sr-only"
        checked={visible}
        onChange={() => toggleLayer(layerId)}
      />
      {/* Visual swatch */}
      <span
        className="flex-shrink-0 w-4 h-4 border-2 transition-opacity"
        style={{
          backgroundColor: shape !== 'line' ? color : 'transparent',
          borderColor: color,
          borderRadius: shape === 'circle' ? '50%' : shape === 'line' ? 0 : '2px',
          borderBottomWidth: shape === 'line' ? '3px' : undefined,
          height: shape === 'line' ? '0' : undefined,
          opacity: visible ? 1 : 0.35,
        }}
      />
      <span
        className={`text-sm transition-colors ${
          visible ? 'text-gray-200' : 'text-gray-500'
        } group-hover:text-gray-100`}
      >
        {label}
      </span>
      {/* Checkbox indicator */}
      <span
        className={`ml-auto w-4 h-4 border rounded flex items-center justify-center text-xs transition-colors ${
          visible
            ? 'bg-brand-500 border-brand-500 text-white'
            : 'border-gray-600 text-transparent'
        }`}
      >
        ✓
      </span>
    </label>
  );
}

function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="flex items-center gap-2 pt-3 pb-1 border-t border-gray-700 first:border-t-0 first:pt-0">
      <span className="text-base">{icon}</span>
      <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">{title}</span>
    </div>
  );
}

export function LayerPanel() {
  const { isLayerPanelOpen, toggleLayerPanel, severityFilter, setSeverityFilter, statusFilter, setStatusFilter } =
    useMapStore();

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={toggleLayerPanel}
        className="absolute top-20 left-3 z-10 bg-gray-900 text-white rounded-lg p-2 shadow-lg border border-gray-700 hover:bg-gray-800 transition-colors"
        title={isLayerPanelOpen ? 'Hide layer panel' : 'Show layer panel'}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
      </button>

      {/* Panel */}
      <div
        className={`absolute top-3 left-14 z-10 w-64 bg-gray-900 bg-opacity-95 backdrop-blur-sm
          rounded-xl shadow-2xl border border-gray-700 transition-all duration-200 overflow-hidden
          ${isLayerPanelOpen ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 pointer-events-none'}`}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-700">
          <h2 className="text-sm font-semibold text-white">Map Layers</h2>
          <p className="text-xs text-gray-400 mt-0.5">Toggle visibility</p>
        </div>

        <div className="px-4 py-2 max-h-[calc(100vh-12rem)] overflow-y-auto space-y-0.5">

          {/* Administrative boundaries */}
          <SectionHeader icon="🗺️" title="Administrative" />
          <LayerToggle layerId={LAYER_IDS.ADMIN_BOUNDARIES_FILL}  label="Oblast boundaries (fill)" color="#1d4ed8" shape="square" />
          <LayerToggle layerId={LAYER_IDS.ADMIN_BOUNDARIES_LINE}  label="Oblast boundaries (outline)" color="#1e40af" shape="line" />
          <LayerToggle layerId={LAYER_IDS.ADMIN_BOUNDARIES_LABEL} label="District labels" color="#1e3a8a" shape="square" />

          {/* Hazard zones */}
          <SectionHeader icon="⚠️" title="Hazard Zones" />
          <LayerToggle layerId={LAYER_IDS.HAZARD_FLOOD_FILL}     label="Flood susceptibility" color="#3b82f6" />
          <LayerToggle layerId={LAYER_IDS.HAZARD_LANDSLIDE_FILL} label="Landslide susceptibility" color="#a16207" />
          <LayerToggle layerId={LAYER_IDS.HAZARD_SEISMIC_FILL}   label="Seismic hazard zones" color="#dc2626" />
          <LayerToggle layerId={LAYER_IDS.HAZARD_WILDFIRE_FILL}  label="Wildfire risk zones" color="#f97316" />

          {/* Incidents */}
          <SectionHeader icon="🚨" title="Incidents" />
          <LayerToggle layerId={LAYER_IDS.INCIDENTS_CIRCLE}  label="Incident markers" color="#ef4444" shape="circle" />
          <LayerToggle layerId={LAYER_IDS.INCIDENTS_LABEL}   label="Incident labels" color="#1e293b" shape="square" />
          <LayerToggle layerId={LAYER_IDS.INCIDENTS_HEATMAP} label="Density heatmap" color="#b91c1c" shape="square" />

          {/* Filters */}
          <SectionHeader icon="🔍" title="Filters" />

          <div className="py-1">
            <label className="text-xs text-gray-400 block mb-1">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 text-gray-200 text-xs rounded px-2 py-1.5"
            >
              <option value="ALL">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="MONITORING">Monitoring</option>
              <option value="RESOLVED">Resolved</option>
            </select>
          </div>

          <div className="py-1 pb-3">
            <label className="text-xs text-gray-400 block mb-1">
              Min. severity: <span className="text-white font-medium">{severityFilter}</span>
              {' '}({['', 'Minor', 'Moderate', 'Significant', 'Severe', 'Catastrophic'][severityFilter]})
            </label>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={severityFilter}
              onChange={(e) => setSeverityFilter(Number(e.target.value))}
              className="w-full accent-brand-500"
            />
            <div className="flex justify-between text-xs text-gray-600 mt-0.5">
              <span>1</span><span>2</span><span>3</span><span>4</span><span>5</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
