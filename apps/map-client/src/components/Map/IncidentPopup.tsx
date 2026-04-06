import { useMapStore } from '@/store/mapStore';
import {
  INCIDENT_TYPE_LABELS,
  INCIDENT_STATUS_LABELS,
  SEVERITY_LABELS,
} from '@/types/incidents';

const SEVERITY_COLORS: Record<number, string> = {
  1: 'bg-green-600',
  2: 'bg-lime-600',
  3: 'bg-amber-500',
  4: 'bg-red-600',
  5: 'bg-red-900',
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE:     'bg-red-600 text-white',
  MONITORING: 'bg-amber-500 text-white',
  RESOLVED:   'bg-green-700 text-white',
  ARCHIVED:   'bg-gray-600 text-white',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function IncidentPopup() {
  const { selectedIncident, selectIncident } = useMapStore();
  if (!selectedIncident) return null;

  const inc = selectedIncident;
  const severityColor = SEVERITY_COLORS[inc.severity] ?? 'bg-gray-600';
  const statusClass = STATUS_COLORS[inc.status] ?? 'bg-gray-600 text-white';

  return (
    <div
      className="absolute bottom-10 left-1/2 -translate-x-1/2 z-20 w-80
        bg-gray-900 bg-opacity-97 backdrop-blur-sm rounded-xl shadow-2xl
        border border-gray-700 overflow-hidden"
    >
      {/* Severity stripe */}
      <div className={`h-1.5 ${severityColor}`} />

      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-400 mb-0.5">
              {INCIDENT_TYPE_LABELS[inc.incidentType] ?? inc.incidentType}
            </p>
            <h3 className="text-sm font-semibold text-white leading-snug truncate">
              {inc.title}
            </h3>
          </div>
          <button
            onClick={() => selectIncident(null)}
            className="text-gray-500 hover:text-gray-300 flex-shrink-0 p-0.5"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusClass}`}>
            {INCIDENT_STATUS_LABELS[inc.status] ?? inc.status}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${severityColor} text-white`}>
            Severity {inc.severity} — {SEVERITY_LABELS[inc.severity]}
          </span>
        </div>

        {/* Description */}
        {inc.description && (
          <p className="text-xs text-gray-300 leading-relaxed mb-3 line-clamp-3">
            {inc.description}
          </p>
        )}

        {/* Meta grid */}
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
          <div>
            <dt className="text-gray-500">Reported</dt>
            <dd className="text-gray-200">{formatDate(inc.reportedAt)}</dd>
          </div>
          {inc.resolvedAt && (
            <div>
              <dt className="text-gray-500">Resolved</dt>
              <dd className="text-gray-200">{formatDate(inc.resolvedAt)}</dd>
            </div>
          )}
          {inc.adminCode && (
            <div>
              <dt className="text-gray-500">Admin code</dt>
              <dd className="text-gray-200 font-mono">{inc.adminCode}</dd>
            </div>
          )}
          {inc.affectedAreaKm2 != null && (
            <div>
              <dt className="text-gray-500">Affected area</dt>
              <dd className="text-gray-200">{inc.affectedAreaKm2.toLocaleString()} km²</dd>
            </div>
          )}
          {inc.affectedPopulation != null && (
            <div>
              <dt className="text-gray-500">Affected population</dt>
              <dd className="text-gray-200">{inc.affectedPopulation.toLocaleString()}</dd>
            </div>
          )}
          <div>
            <dt className="text-gray-500">Coordinates</dt>
            <dd className="text-gray-200 font-mono text-xs">
              {inc.coordinates[1].toFixed(4)}°N, {inc.coordinates[0].toFixed(4)}°E
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
