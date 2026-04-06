import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { rolesApi, type Role } from '@/lib/api';
import { PageHeader } from '@/components/shared/PageHeader';
import { LoadingScreen } from '@/components/shared/Spinner';

function RoleCard({ role, onDelete }: { role: Role; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="card p-4 space-y-2">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-900">{role.name}</p>
          {role.description && <p className="text-xs text-gray-500 mt-0.5">{role.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button
            className="text-xs text-brand-600 hover:underline"
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded ? 'Hide' : `${role.permissions.length} permissions`}
          </button>
          <button className="text-xs text-red-500 hover:underline" onClick={() => onDelete(role.id)}>
            Delete
          </button>
        </div>
      </div>
      {expanded && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {role.permissions.map((p) => (
            <span key={p} className="badge bg-gray-100 text-gray-600 font-mono text-xs">{p}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateRoleModal({ onClose, capabilities }: { onClose: () => void; capabilities: string[] }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  const toggle = (cap: string) =>
    setSelected((s) => { const n = new Set(s); n.has(cap) ? n.delete(cap) : n.add(cap); return n; });

  const mutation = useMutation({
    mutationFn: () => rolesApi.create({ name, description, permissions: [...selected] }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['roles'] }); onClose(); },
  });

  const filtered = capabilities.filter((c) => c.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4">
        <h3 className="text-base font-semibold text-gray-900">Create Role</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Role Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label">Description</label>
            <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="label">Permissions ({selected.size} selected)</label>
          <input
            className="input mb-2 text-xs"
            placeholder="Filter permissions…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="h-48 overflow-y-auto border border-gray-200 rounded-md p-2 grid grid-cols-2 gap-1">
            {filtered.map((cap) => (
              <label key={cap} className="flex items-center gap-1.5 cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded text-xs">
                <input
                  type="checkbox"
                  checked={selected.has(cap)}
                  onChange={() => toggle(cap)}
                  className="rounded border-gray-300"
                />
                <span className="font-mono text-gray-700 truncate">{cap}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={() => mutation.mutate()} disabled={mutation.isPending || !name}>
            {mutation.isPending ? 'Creating…' : 'Create Role'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RolesPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data: roles, isLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: () => rolesApi.list().then((r) => r.data),
  });

  const { data: capabilities } = useQuery({
    queryKey: ['capabilities'],
    queryFn: () => rolesApi.capabilities().then((r) => r.data),
  });

  const deleteRole = useMutation({
    mutationFn: rolesApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roles'] }),
  });

  if (isLoading) return <LoadingScreen />;

  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader
        title="Roles & Permissions"
        subtitle={`${roles?.length ?? 0} roles defined`}
        action={
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            + New Role
          </button>
        }
      />

      <div className="space-y-3">
        {roles?.map((role) => (
          <RoleCard key={role.id} role={role} onDelete={(id) => deleteRole.mutate(id)} />
        ))}
        {roles?.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">No roles defined yet.</p>
        )}
      </div>

      {showCreate && (
        <CreateRoleModal onClose={() => setShowCreate(false)} capabilities={capabilities ?? []} />
      )}
    </div>
  );
}
