import { useEffect, useState, useCallback } from 'react';
import { useMapStore } from '@/store/mapStore';
import { mlApi } from '@/api/ml';
import type { RiskPrediction, HazardType } from '@/types/ml';
import { HAZARD_LABELS, RISK_TIER_LABELS, RISK_TIER_COLORS } from '@/types/ml';

const HAZARD_TYPES: HazardType[] = ['flood', 'landslide', 'seismic', 'wildfire'];

function RiskBadge({ tier }: { tier: number }) {
  const color = RISK_TIER_COLORS[tier] ?? '#aaaaaa';
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold"
      style={{ backgroundColor: `${color}22`, color, border: `1px solid ${color}66` }}
    >
      {RISK_TIER_LABELS[tier] ?? '?'}
    </span>
  );
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color =
    score >= 0.75 ? RISK_TIER_COLORS[4]
    : score >= 0.5 ? RISK_TIER_COLORS[3]
    : score >= 0.3 ? RISK_TIER_COLORS[2]
    : RISK_TIER_COLORS[1];

  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="flex-1 bg-gray-700 rounded-full h-1.5">
        <div
          className="h-1.5 rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-gray-300 w-8 text-right">{pct}%</span>
    </div>
  );
}

interface PredictionCardProps {
  prediction: RiskPrediction;
  onApprove: (id: string, notes?: string) => void;
  onReject:  (id: string, notes?: string) => void;
}

function PredictionCard({ prediction: p, onApprove, onReject }: PredictionCardProps) {
  const [notes, setNotes]       = useState('');
  const [expanded, setExpanded] = useState(false);

  const topShap = Object.entries(p.shapValues)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 5);

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-3 space-y-2">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5">
            <RiskBadge tier={p.riskTier} />
            <span className="text-xs text-gray-400">{HAZARD_LABELS[p.hazardType]}</span>
          </div>
          <p className="text-sm font-medium text-white mt-0.5">
            {p.administrativeName ?? p.administrativeCode}
          </p>
          <p className="text-xs text-gray-500">{p.administrativeCode}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <ScoreBar score={p.riskScore} />
          <p className="text-xs text-gray-500 mt-1">
            Valid until {new Date(p.validUntil).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })}
          </p>
        </div>
      </div>

      {/* SHAP values — expandable */}
      {topShap.length > 0 && (
        <div>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-gray-400 hover:text-gray-200 transition-colors flex items-center gap-1"
          >
            <span>{expanded ? '▼' : '▶'}</span>
            Top contributing factors
          </button>
          {expanded && (
            <div className="mt-1.5 space-y-1">
              {topShap.map(([feature, value]) => (
                <div key={feature} className="flex justify-between text-xs">
                  <span className="text-gray-400 truncate mr-2">{feature.replace(/_/g, ' ')}</span>
                  <span
                    className={`font-mono flex-shrink-0 ${value > 0 ? 'text-red-400' : 'text-green-400'}`}
                  >
                    {value > 0 ? '+' : ''}{value.toFixed(3)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Analyst notes */}
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Review notes (optional)…"
        rows={2}
        className="w-full bg-gray-900 border border-gray-600 text-gray-200 text-xs rounded px-2 py-1 resize-none placeholder-gray-600 focus:outline-none focus:border-gray-400"
      />

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => onApprove(p.id, notes || undefined)}
          className="flex-1 py-1.5 text-xs font-semibold rounded bg-green-700 hover:bg-green-600 text-white transition-colors"
        >
          Approve & Publish
        </button>
        <button
          onClick={() => onReject(p.id, notes || undefined)}
          className="flex-1 py-1.5 text-xs font-semibold rounded bg-red-900 hover:bg-red-800 text-white transition-colors"
        >
          Reject
        </button>
      </div>
    </div>
  );
}

export function ReviewPanel() {
  const { isReviewPanelOpen, toggleReviewPanel } = useMapStore();

  const [predictions, setPredictions] = useState<RiskPrediction[]>([]);
  const [hazardFilter, setHazardFilter] = useState<HazardType | 'all'>('all');
  const [loading, setLoading]          = useState(false);
  const [toast, setToast]              = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await mlApi.getPendingPredictions(
        hazardFilter === 'all' ? undefined : hazardFilter,
      );
      setPredictions(resp.items);
    } catch {
      showToast('Failed to load pending predictions');
    } finally {
      setLoading(false);
    }
  }, [hazardFilter]);

  useEffect(() => {
    if (isReviewPanelOpen) load();
  }, [isReviewPanelOpen, load]);

  const handleApprove = async (id: string, notes?: string) => {
    try {
      await mlApi.approvePrediction(id, notes);
      setPredictions((prev) => prev.filter((p) => p.id !== id));
      showToast('Prediction approved');
    } catch {
      showToast('Approval failed');
    }
  };

  const handleReject = async (id: string, notes?: string) => {
    try {
      await mlApi.rejectPrediction(id, notes);
      setPredictions((prev) => prev.filter((p) => p.id !== id));
      showToast('Prediction rejected');
    } catch {
      showToast('Rejection failed');
    }
  };

  const handlePublishAll = async () => {
    try {
      const count = await mlApi.publishApproved();
      showToast(`${count} approved predictions published to GIS layers`);
      load();
    } catch {
      showToast('Publish failed');
    }
  };

  if (!isReviewPanelOpen) return null;

  return (
    <div className="absolute top-0 right-0 bottom-0 z-20 w-80 bg-gray-900 bg-opacity-97 backdrop-blur-sm border-l border-gray-700 flex flex-col shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 flex-shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-white">AI Forecast Review</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {loading ? 'Loading…' : `${predictions.length} pending`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePublishAll}
            className="text-xs px-2 py-1 bg-blue-700 hover:bg-blue-600 text-white rounded transition-colors"
          >
            Publish all approved
          </button>
          <button
            onClick={toggleReviewPanel}
            className="text-gray-400 hover:text-white text-lg leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>
      </div>

      {/* Hazard type filter */}
      <div className="flex gap-1 px-3 py-2 border-b border-gray-700 flex-shrink-0">
        {(['all', ...HAZARD_TYPES] as const).map((ht) => (
          <button
            key={ht}
            onClick={() => setHazardFilter(ht)}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              hazardFilter === ht
                ? 'bg-gray-600 text-white'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {ht === 'all' ? 'All' : HAZARD_LABELS[ht]}
          </button>
        ))}
        <button
          onClick={load}
          className="ml-auto text-gray-500 hover:text-gray-200 text-xs transition-colors"
          title="Refresh"
        >
          ↻
        </button>
      </div>

      {/* Predictions list */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {loading && (
          <div className="flex items-center justify-center py-10 text-gray-500 text-sm">
            Loading…
          </div>
        )}
        {!loading && predictions.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-gray-500 text-sm gap-2">
            <span className="text-2xl">✓</span>
            <span>No pending predictions</span>
          </div>
        )}
        {!loading && predictions.map((p) => (
          <PredictionCard
            key={p.id}
            prediction={p}
            onApprove={handleApprove}
            onReject={handleReject}
          />
        ))}
      </div>

      {/* Toast notification */}
      {toast && (
        <div className="absolute bottom-4 left-3 right-3 bg-gray-700 text-white text-xs rounded-lg px-3 py-2 shadow-lg border border-gray-600 text-center">
          {toast}
        </div>
      )}
    </div>
  );
}
