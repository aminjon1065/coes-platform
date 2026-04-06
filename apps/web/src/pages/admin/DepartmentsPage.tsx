import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { orgApi, type Department } from '@/lib/api';
import { PageHeader } from '@/components/shared/PageHeader';
import { LoadingScreen } from '@/components/shared/Spinner';

function DeptNode({ dept, depth = 0 }: { dept: Department; depth?: number }) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = (dept.children?.length ?? 0) > 0;

  return (
    <div>
      <div
        className={`flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer`}
        style={{ paddingLeft: `${12 + depth * 20}px` }}
      >
        {hasChildren ? (
          <button onClick={() => setExpanded((e) => !e)} className="text-gray-400 hover:text-gray-600">
            <svg className={`h-3 w-3 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="currentColor" viewBox="0 0 20 20">
              <path d="M6 6l8 4-8 4V6z" />
            </svg>
          </button>
        ) : (
          <span className="h-3 w-3 block" />
        )}
        <svg className="h-4 w-4 text-brand-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
        </svg>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-gray-800">{dept.name}</span>
          <span className="ml-2 text-xs text-gray-400">{dept.code}</span>
        </div>
        <span className={`badge ${dept.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
          {dept.isActive ? 'Active' : 'Inactive'}
        </span>
      </div>
      {expanded && hasChildren && (
        <div>
          {dept.children!.map((child) => (
            <DeptNode key={child.id} dept={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function CreateDeptModal({ onClose, departments }: { onClose: () => void; departments: Department[] }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [parentId, setParentId] = useState('');

  const mutation = useMutation({
    mutationFn: () => orgApi.createDepartment({ name, code, parentId: parentId || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['departments'] }); onClose(); },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <h3 className="text-base font-semibold text-gray-900">Create Department</h3>
        <div>
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">Code</label>
          <input className="input" value={code} onChange={(e) => setCode(e.target.value)} />
        </div>
        <div>
          <label className="label">Parent Department (optional)</label>
          <select className="input" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">— Root —</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={() => mutation.mutate()} disabled={mutation.isPending || !name || !code}>
            {mutation.isPending ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DepartmentsPage() {
  const [showCreate, setShowCreate] = useState(false);

  const { data: tree, isLoading: tl } = useQuery({
    queryKey: ['departments', 'tree'],
    queryFn: () => orgApi.departmentTree().then((r) => r.data),
  });

  const { data: flat } = useQuery({
    queryKey: ['departments'],
    queryFn: () => orgApi.departments().then((r) => r.data),
  });

  if (tl) return <LoadingScreen />;

  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader
        title="Departments & Hierarchy"
        subtitle="Organizational structure tree"
        action={
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            + New Department
          </button>
        }
      />

      <div className="card p-3">
        {tree?.map((dept) => <DeptNode key={dept.id} dept={dept} />)}
        {tree?.length === 0 && (
          <p className="text-sm text-gray-400 px-3 py-4">No departments configured.</p>
        )}
      </div>

      {showCreate && (
        <CreateDeptModal onClose={() => setShowCreate(false)} departments={flat ?? []} />
      )}
    </div>
  );
}
