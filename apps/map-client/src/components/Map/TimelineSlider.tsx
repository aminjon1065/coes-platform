/**
 * TimelineSlider — an animated incident timeline control.
 * Shows a bar chart of incident counts by time bucket (day/week/month)
 * and lets the user scrub through time or play an animation.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchTimeline, type TimelineBucket, type TimelineGranularity } from '@/api/gis';

interface TimelineSliderProps {
  from?: string;
  to?: string;
  granularity?: TimelineGranularity;
  incidentType?: string;
  /** Called when selected bucket changes — can be used to filter the map */
  onBucketChange?: (bucket: TimelineBucket | null) => void;
}

const GRANULARITY_OPTIONS: { label: string; value: TimelineGranularity }[] = [
  { label: 'Day', value: 'day' },
  { label: 'Week', value: 'week' },
  { label: 'Month', value: 'month' },
];

const PLAY_INTERVAL_MS = 600;

function formatBucketLabel(iso: string, granularity: TimelineGranularity): string {
  const d = new Date(iso);
  if (granularity === 'month') {
    return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
  }
  if (granularity === 'week') {
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  }
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

export function TimelineSlider({
  from,
  to,
  granularity: initialGranularity = 'day',
  incidentType,
  onBucketChange,
}: TimelineSliderProps) {
  const [granularity, setGranularity] = useState<TimelineGranularity>(initialGranularity);
  const [buckets, setBuckets] = useState<TimelineBucket[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const playRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load timeline data
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchTimeline({ granularity, from, to, incidentType })
      .then(({ buckets: b }) => {
        if (!cancelled) {
          setBuckets(b);
          setSelectedIdx(b.length > 0 ? b.length - 1 : null);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [granularity, from, to, incidentType]);

  // Notify parent when selection changes
  useEffect(() => {
    onBucketChange?.(selectedIdx !== null ? (buckets[selectedIdx] ?? null) : null);
  }, [selectedIdx, buckets, onBucketChange]);

  // Play animation
  const startPlay = useCallback(() => {
    if (buckets.length === 0) return;
    setPlaying(true);
    let idx = selectedIdx ?? 0;
    playRef.current = setInterval(() => {
      idx = (idx + 1) % buckets.length;
      setSelectedIdx(idx);
      if (idx === buckets.length - 1) {
        clearInterval(playRef.current!);
        setPlaying(false);
      }
    }, PLAY_INTERVAL_MS);
  }, [buckets, selectedIdx]);

  const stopPlay = useCallback(() => {
    clearInterval(playRef.current!);
    setPlaying(false);
  }, []);

  useEffect(() => () => clearInterval(playRef.current!), []);

  const maxCount = buckets.length > 0 ? Math.max(...buckets.map((b) => b.count), 1) : 1;

  if (!loading && buckets.length === 0) {
    return (
      <div className="bg-slate-900/90 border border-slate-700 rounded-xl p-3 text-slate-400 text-xs text-center">
        No incident data for selected period
      </div>
    );
  }

  return (
    <div className="bg-slate-900/90 border border-slate-700 rounded-xl p-3 select-none w-full">
      {/* Header row */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-white text-xs font-semibold">Incident Timeline</span>
        <div className="flex items-center gap-1">
          {GRANULARITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setGranularity(opt.value)}
              className={`text-xs px-2 py-0.5 rounded transition-colors ${
                granularity === opt.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="h-16 flex items-center justify-center text-slate-500 text-xs">
          Loading…
        </div>
      ) : (
        <>
          {/* Bar chart */}
          <div className="flex items-end gap-0.5 h-16 overflow-x-auto pb-1">
            {buckets.map((b, i) => {
              const height = Math.max(4, Math.round((b.count / maxCount) * 56));
              const isSelected = i === selectedIdx;
              return (
                <button
                  key={b.bucket}
                  title={`${formatBucketLabel(b.bucket, granularity)}: ${b.count}`}
                  onClick={() => setSelectedIdx(i)}
                  className={`flex-shrink-0 rounded-t transition-colors ${
                    isSelected ? 'bg-blue-400' : 'bg-slate-500 hover:bg-slate-400'
                  }`}
                  style={{ width: Math.max(4, Math.floor(360 / buckets.length) - 1), height }}
                />
              );
            })}
          </div>

          {/* Slider */}
          <input
            type="range"
            min={0}
            max={buckets.length - 1}
            value={selectedIdx ?? 0}
            onChange={(e) => setSelectedIdx(Number(e.target.value))}
            className="w-full accent-blue-500 mt-1"
          />

          {/* Footer: selected label + play control */}
          <div className="flex items-center justify-between mt-1">
            <span className="text-slate-300 text-xs">
              {selectedIdx !== null && buckets[selectedIdx]
                ? `${formatBucketLabel(buckets[selectedIdx].bucket, granularity)} — ${buckets[selectedIdx].count} incidents`
                : ''}
            </span>
            <button
              onClick={playing ? stopPlay : startPlay}
              className="text-xs px-2 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
            >
              {playing ? '⏹ Stop' : '▶ Play'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
