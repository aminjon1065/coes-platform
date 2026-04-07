import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { reportIncident } from '../lib/api';

const INCIDENT_TYPES = [
  'earthquake',
  'flood',
  'landslide',
  'wildfire',
  'hazmat',
  'building_collapse',
  'road_accident',
  'other',
];

const SEVERITIES = ['low', 'medium', 'high', 'critical'];

export default function ReportIncidentPage() {
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [incidentType, setIncidentType] = useState('other');
  const [severity, setSeverity] = useState('medium');
  const [coords, setCoords] = useState<[number, number] | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [queued, setQueued] = useState(false);

  // Auto-capture GPS on mount
  useEffect(() => {
    captureLocation();
  }, []);

  function captureLocation() {
    if (!navigator.geolocation) {
      setLocError('Geolocation not supported');
      return;
    }
    setLocating(true);
    setLocError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords([pos.coords.longitude, pos.coords.latitude]);
        setLocating(false);
      },
      (err) => {
        setLocError(`Location error: ${err.message}`);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!coords) return;

    setSubmitting(true);
    setSubmitError(null);
    setQueued(false);

    try {
      await reportIncident({ title, description, incidentType, severity, coordinates: coords });
      setSubmitted(true);
    } catch (err: any) {
      if (err.message === 'OFFLINE_QUEUED') {
        setQueued(true);
        setSubmitted(true);
      } else {
        setSubmitError(err.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 gap-4">
        <div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center text-3xl">
          ✓
        </div>
        <h2 className="text-xl font-bold">
          {queued ? 'Saved Offline' : 'Incident Reported'}
        </h2>
        <p className="text-slate-400 text-sm text-center">
          {queued
            ? 'Your report has been saved and will be submitted when connectivity is restored.'
            : 'The incident has been reported and dispatchers have been notified.'}
        </p>
        <button
          onClick={() => navigate('/tasks')}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm"
        >
          Back to Tasks
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <header className="bg-slate-800 px-4 py-3 flex items-center gap-3 shadow-lg">
        <button onClick={() => navigate(-1)} className="text-slate-400 text-xl">←</button>
        <h1 className="font-bold">Report Incident</h1>
      </header>

      <form onSubmit={handleSubmit} className="p-4 space-y-4 pb-10">
        {/* Location capture */}
        <div className="bg-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">GPS Location</span>
            <button
              type="button"
              onClick={captureLocation}
              disabled={locating}
              className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50"
            >
              {locating ? 'Locating…' : 'Refresh'}
            </button>
          </div>
          {coords ? (
            <p className="text-xs text-green-400 mt-1">
              {coords[1].toFixed(5)}°N, {coords[0].toFixed(5)}°E
            </p>
          ) : locError ? (
            <p className="text-xs text-red-400 mt-1">{locError}</p>
          ) : (
            <p className="text-xs text-slate-400 mt-1">Acquiring GPS…</p>
          )}
        </div>

        <div>
          <label className="block text-sm text-slate-300 mb-1">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm text-slate-300 mb-1">Type</label>
          <select
            value={incidentType}
            onChange={(e) => setIncidentType(e.target.value)}
            className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none"
          >
            {INCIDENT_TYPES.map((t) => (
              <option key={t} value={t}>{t.replace('_', ' ')}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm text-slate-300 mb-1">Severity</label>
          <div className="flex gap-2">
            {SEVERITIES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSeverity(s)}
                className={`flex-1 py-2 text-xs rounded-lg capitalize font-medium transition-colors ${
                  severity === s ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm text-slate-300 mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            required
            className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {submitError && (
          <div className="bg-red-900/40 text-red-300 text-sm rounded-lg px-3 py-2">
            {submitError}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !coords}
          className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold rounded-xl py-3 transition-colors"
        >
          {submitting ? 'Submitting…' : 'Submit Incident Report'}
        </button>
      </form>
    </div>
  );
}
