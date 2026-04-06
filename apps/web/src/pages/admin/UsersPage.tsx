import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi, type UserSummary, type CreateUserDto } from '@/lib/api';
import { PageHeader } from '@/components/shared/PageHeader';
import { LoadingScreen } from '@/components/shared/Spinner';

const CLEARANCE_LABELS: Record<number, string> = {
  1: 'Unclassified',
  2: 'Restricted',
  3: 'Confidential',
  4: 'Secret',
  5: 'Top Secret',
};

function UserRow({ user, onDeactivate }: { user: UserSummary; onDeactivate: (id: string) => void }) {
  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3 text-sm font-medium text-gray-900">{user.displayName}</td>
      <td className="px-4 py-3 text-sm text-gray-500">{user.username}</td>
      <td className="px-4 py-3 text-sm text-gray-500">{user.email}</td>
      <td className="px-4 py-3 text-sm text-gray-500">
        {CLEARANCE_LABELS[user.clearanceLevel] ?? user.clearanceLevel}
      </td>
      <td className="px-4 py-3">
        <span className={`badge ${user.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
          {user.isActive ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        {user.isActive && (
          <button
            onClick={() => onDeactivate(user.id)}
            className="text-xs text-red-600 hover:underline"
          >
            Deactivate
          </button>
        )}
      </td>
    </tr>
  );
}

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState<CreateUserDto>({
    username: '', email: '', displayName: '', password: '', clearanceLevel: 1,
  });
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => usersApi.create(form),
    onSuccess: () => { onCreated(); onClose(); },
    onError: () => setError('Failed to create user. Check for duplicate username/email.'),
  });

  const set = (k: keyof CreateUserDto) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: k === 'clearanceLevel' ? Number(e.target.value) : e.target.value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h3 className="text-base font-semibold text-gray-900">Create User</h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Display Name</label>
            <input className="input" value={form.displayName} onChange={set('displayName')} required />
          </div>
          <div>
            <label className="label">Username</label>
            <input className="input" value={form.username} onChange={set('username')} required />
          </div>
          <div className="col-span-2">
            <label className="label">Email</label>
            <input className="input" type="email" value={form.email} onChange={set('email')} required />
          </div>
          <div>
            <label className="label">Password</label>
            <input className="input" type="password" value={form.password} onChange={set('password')} required />
          </div>
          <div>
            <label className="label">Clearance Level</label>
            <select className="input" value={form.clearanceLevel} onChange={set('clearanceLevel')}>
              {Object.entries(CLEARANCE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function UsersPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['users', search],
    queryFn: () => usersApi.list({ search, limit: 50 }).then((r) => r.data),
  });

  const deactivate = useMutation({
    mutationFn: usersApi.deactivate,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  if (isLoading) return <LoadingScreen />;

  return (
    <div className="max-w-5xl space-y-4">
      <PageHeader
        title="Users"
        subtitle={`${data?.total ?? 0} users`}
        action={
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            + New User
          </button>
        }
      />

      {/* Search */}
      <input
        className="input max-w-xs"
        placeholder="Search by name or username…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Name', 'Username', 'Email', 'Clearance', 'Status', ''].map((h) => (
                <th key={h} className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data?.data.map((u) => (
              <UserRow key={u.id} user={u} onDeactivate={(id) => deactivate.mutate(id)} />
            ))}
          </tbody>
        </table>
        {data?.data.length === 0 && (
          <p className="px-4 py-6 text-sm text-gray-400 text-center">No users found.</p>
        )}
      </div>

      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={() => qc.invalidateQueries({ queryKey: ['users'] })}
        />
      )}
    </div>
  );
}
