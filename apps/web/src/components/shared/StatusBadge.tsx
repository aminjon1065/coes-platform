const COLORS: Record<string, string> = {
  // Document statuses
  draft: 'bg-gray-100 text-gray-700',
  registered: 'bg-blue-100 text-blue-700',
  workflow: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-green-100 text-green-700',
  archived: 'bg-gray-200 text-gray-500',
  // Task statuses
  pending: 'bg-gray-100 text-gray-600',
  assigned: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-yellow-100 text-yellow-700',
  blocked: 'bg-red-100 text-red-700',
  done: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-200 text-gray-500',
  // Priorities
  low: 'bg-gray-100 text-gray-600',
  normal: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};

export function StatusBadge({ value }: { value: string }) {
  const cls = COLORS[value.toLowerCase()] ?? 'bg-gray-100 text-gray-700';
  return (
    <span className={`badge ${cls}`}>{value.replace(/_/g, ' ')}</span>
  );
}
