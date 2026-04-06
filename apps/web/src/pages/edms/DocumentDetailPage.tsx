import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { edmsApi } from '@/lib/api';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { LoadingScreen } from '@/components/shared/Spinner';
import { formatDistanceToNow, format } from 'date-fns';

const TRANSITIONS: Record<string, string[]> = {
  draft: ['registered'],
  registered: ['workflow', 'archived'],
  workflow: ['completed', 'registered'],
  completed: ['archived'],
  archived: [],
};

const CLEARANCE_LABELS: Record<number, string> = {
  1: 'Unclassified', 2: 'Restricted', 3: 'Confidential', 4: 'Secret', 5: 'Top Secret',
};

export default function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [confirmTransition, setConfirmTransition] = useState<string | null>(null);

  const { data: doc, isLoading } = useQuery({
    queryKey: ['edms', 'document', id],
    queryFn: () => edmsApi.get(id!).then((r) => r.data),
    enabled: !!id,
  });

  const { data: versions } = useQuery({
    queryKey: ['edms', 'versions', id],
    queryFn: () => edmsApi.versions(id!).then((r) => r.data),
    enabled: !!id,
  });

  const transition = useMutation({
    mutationFn: (status: string) => edmsApi.transition(id!, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['edms', 'document', id] });
      setConfirmTransition(null);
    },
  });

  if (isLoading) return <LoadingScreen />;
  if (!doc) return <div className="text-sm text-gray-500">Document not found.</div>;

  const nextStatuses = TRANSITIONS[doc.status] ?? [];

  return (
    <div className="max-w-4xl space-y-6">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 flex items-center gap-1">
        <Link to="/edms" className="hover:text-brand-600">Documents</Link>
        <span>/</span>
        <span className="text-gray-800 truncate max-w-xs">{doc.title}</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            {doc.registrationNumber && (
              <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                {doc.registrationNumber}
              </span>
            )}
            <StatusBadge value={doc.status} />
            <span className="badge bg-gray-100 text-gray-600">
              {CLEARANCE_LABELS[doc.classification] ?? `Level ${doc.classification}`}
            </span>
          </div>
          <h2 className="text-xl font-semibold text-gray-900">{doc.title}</h2>
          <p className="text-sm text-gray-500 mt-1 capitalize">{doc.documentType}</p>
        </div>

        {/* Workflow actions */}
        {nextStatuses.length > 0 && (
          <div className="flex gap-2 shrink-0">
            {nextStatuses.map((s) => (
              <button
                key={s}
                className={s === 'archived' ? 'btn-secondary' : 'btn-primary'}
                onClick={() => setConfirmTransition(s)}
              >
                → {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Body */}
      {doc.body && (
        <div className="card p-5">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Content</h3>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{doc.body}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Attachments */}
        <div className="card p-5">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Attachments ({doc.attachments.length})
          </h3>
          {doc.attachments.length === 0 ? (
            <p className="text-sm text-gray-400">No attachments.</p>
          ) : (
            <ul className="space-y-2">
              {doc.attachments.map((a) => (
                <li key={a.id} className="flex items-center gap-2 text-sm">
                  <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                  </svg>
                  <span className="text-gray-700 truncate">{a.filename}</span>
                  <span className="text-gray-400 text-xs shrink-0">
                    {(a.sizeBytes / 1024).toFixed(1)} KB
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Versions */}
        <div className="card p-5">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Version History</h3>
          {!versions || (versions as unknown[]).length === 0 ? (
            <p className="text-sm text-gray-400">No versions yet.</p>
          ) : (
            <ul className="space-y-2">
              {(versions as Array<{ id: string; versionNumber: number; createdAt: string; authorName?: string }>).map((v) => (
                <li key={v.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">v{v.versionNumber}</span>
                  <span className="text-gray-400 text-xs">
                    {v.authorName} · {format(new Date(v.createdAt), 'dd MMM yyyy')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Metadata */}
      <div className="card p-5">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Metadata</h3>
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <dt className="text-gray-500">Created</dt>
            <dd className="text-gray-800">{formatDistanceToNow(new Date(doc.createdAt), { addSuffix: true })}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Updated</dt>
            <dd className="text-gray-800">{formatDistanceToNow(new Date(doc.updatedAt), { addSuffix: true })}</dd>
          </div>
          {doc.workflowInstanceId && (
            <div>
              <dt className="text-gray-500">Workflow</dt>
              <dd className="text-gray-800 font-mono text-xs">{doc.workflowInstanceId.slice(0, 8)}…</dd>
            </div>
          )}
        </dl>
      </div>

      {/* Transition confirm modal */}
      {confirmTransition && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full space-y-4">
            <h3 className="text-base font-semibold text-gray-900">Confirm Transition</h3>
            <p className="text-sm text-gray-600">
              Move document to <strong className="capitalize">{confirmTransition}</strong>?
            </p>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setConfirmTransition(null)}>Cancel</button>
              <button
                className="btn-primary"
                onClick={() => transition.mutate(confirmTransition)}
                disabled={transition.isPending}
              >
                {transition.isPending ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
