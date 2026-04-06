import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { edmsApi } from '@/lib/api';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { LoadingScreen } from '@/components/shared/Spinner';
import { formatDistanceToNow } from 'date-fns';

const STATUS_OPTIONS = ['', 'draft', 'registered', 'workflow', 'completed', 'archived'];
const TYPE_OPTIONS = ['', 'incoming', 'outgoing', 'internal', 'order', 'resolution'];
const CLEARANCE_LABELS = ['Any', 'Unclassified', 'Restricted', 'Confidential', 'Secret', 'Top Secret'];

export default function DocumentsPage() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState(searchParams.get('status') ?? '');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const LIMIT = 20;

  const { data, isLoading } = useQuery({
    queryKey: ['edms', 'documents', { status, type, page }],
    queryFn: () =>
      edmsApi
        .list({ status: status || undefined, documentType: type || undefined, page, limit: LIMIT })
        .then((r) => r.data),
  });

  if (isLoading) return <LoadingScreen />;

  const totalPages = Math.ceil((data?.total ?? 0) / LIMIT);

  return (
    <div className="max-w-5xl space-y-4">
      <PageHeader
        title="Documents"
        subtitle={`${data?.total ?? 0} total`}
        action={
          <Link to="/edms/new" className="btn-primary">+ New Document</Link>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select className="input w-auto text-sm" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s || 'All Statuses'}</option>
          ))}
        </select>
        <select className="input w-auto text-sm" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
          {TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>{t || 'All Types'}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Reg. No.', 'Title', 'Type', 'Clearance', 'Status', 'Updated'].map((h) => (
                <th key={h} className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data?.data.map((doc) => (
              <tr key={doc.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-xs font-mono text-gray-500">
                  {doc.registrationNumber ?? '—'}
                </td>
                <td className="px-4 py-3">
                  <Link to={`/edms/${doc.id}`} className="text-sm font-medium text-brand-700 hover:underline line-clamp-1">
                    {doc.title}
                  </Link>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500 capitalize">{doc.documentType}</td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {CLEARANCE_LABELS[doc.classification] ?? doc.classification}
                </td>
                <td className="px-4 py-3"><StatusBadge value={doc.status} /></td>
                <td className="px-4 py-3 text-xs text-gray-400">
                  {formatDistanceToNow(new Date(doc.updatedAt), { addSuffix: true })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data?.data.length === 0 && (
          <p className="px-4 py-6 text-sm text-gray-400 text-center">No documents found.</p>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button className="btn-secondary" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
            <button className="btn-secondary" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
