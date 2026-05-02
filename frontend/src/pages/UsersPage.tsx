import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users, Plus, Trash2, AlertCircle, X, Copy, CheckCircle, LogIn, Clock, ShieldCheck, UserX,
} from 'lucide-react';
import { getAllUsers, createUser, deleteUser, getInactiveUsers } from '../api/userApi';
import type { User, UserRole } from '../api/userApi';
import { getPendingUsers, approveUser } from '../api/authApi';
import { useCurrentUser } from '../context/UserContext';

const ROLE_COLORS: Record<UserRole, string> = {
  ADMIN: 'bg-red-100 text-red-700',
  TESTER: 'bg-green-100 text-green-700',
  VIEWER: 'bg-gray-100 text-gray-600',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function CopyId({ id }: { id: number }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(String(id));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={copy} className="inline-flex items-center gap-1 text-xs font-mono bg-gray-100 hover:bg-blue-100 text-gray-600 hover:text-blue-700 px-2 py-0.5 rounded transition-colors" title="Copy ID">
      #{id} {copied ? <CheckCircle className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

export default function UsersPage() {
  const queryClient = useQueryClient();
  const { currentUser, setCurrentUser } = useCurrentUser();
  const isAdmin = currentUser?.role === 'ADMIN';

  // Create user modal
  const [showModal, setShowModal] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('TESTER');
  const [formError, setFormError] = useState<string | null>(null);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  // Approve modal
  const [approveTarget, setApproveTarget] = useState<User | null>(null);
  const [approveRole, setApproveRole] = useState<UserRole>('TESTER');
  const [approveError, setApproveError] = useState<string | null>(null);

  const { data: users = [], isLoading, isError } = useQuery({
    queryKey: ['users'],
    queryFn: () => getAllUsers(),
  });

  const { data: pendingUsers = [] } = useQuery({
    queryKey: ['pendingUsers'],
    queryFn: () => getPendingUsers(),
    enabled: isAdmin,
  });

  const { data: inactiveUsers = [] } = useQuery({
    queryKey: ['inactiveUsers'],
    queryFn: getInactiveUsers,
    enabled: isAdmin,
  });

  const createMutation = useMutation({
    mutationFn: () => createUser({ username, email, password, role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setShowModal(false);
      setUsername(''); setEmail(''); setPassword(''); setRole('TESTER');
      setFormError(null);
    },
    onError: (err: Error) => setFormError(err.message || 'Failed to create user'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['inactiveUsers'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['projectMembers'] });
      queryClient.invalidateQueries({ queryKey: ['projectSheet'] });
      setDeleteTarget(null);
    },
    onError: (err: Error) => alert(err.message || 'Failed to deactivate user'),
  });

  const approveMutation = useMutation({
    mutationFn: () => {
      if (!approveTarget || !currentUser) throw new Error('Missing data');
      return approveUser(approveTarget.id, approveRole, currentUser.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['pendingUsers'] });
      setApproveTarget(null);
      setApproveError(null);
    },
    onError: (err: Error) => setApproveError(err.message || 'Failed to approve user'),
  });

  const handleCreate = () => {
    if (!username.trim()) { setFormError('Username is required'); return; }
    if (!email.trim()) { setFormError('Email is required'); return; }
    if (!password || password.length < 8) { setFormError('Password must be at least 8 characters'); return; }
    setFormError(null);
    createMutation.mutate();
  };

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Users className="w-7 h-7 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Users</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Click "Log in as" to set your active session.
              {isAdmin && pendingUsers.length > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 text-amber-600 font-medium">
                  <Clock className="w-3.5 h-3.5" /> {pendingUsers.length} pending approval
                </span>
              )}
            </p>
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={() => { setShowModal(true); setFormError(null); }}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" /> New User
          </button>
        )}
      </div>

      {/* Pending approvals (ADMIN only) */}
      {isAdmin && pendingUsers.length > 0 && (
        <div className="mb-8">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-700 mb-3">
            <Clock className="w-4 h-4" /> Pending Approvals ({pendingUsers.length})
          </h2>
          <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-amber-200">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-amber-700 uppercase tracking-wide">Username</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-amber-700 uppercase tracking-wide">Email</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-amber-700 uppercase tracking-wide">Requested</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-amber-700 uppercase tracking-wide w-28">Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingUsers.map((u: User, i: number) => (
                  <tr key={u.id} className={`border-b border-amber-100 last:border-0 ${i % 2 === 0 ? 'bg-amber-50' : 'bg-amber-50/60'}`}>
                    <td className="px-5 py-3 font-medium text-gray-800">{u.username}</td>
                    <td className="px-5 py-3 text-gray-600">{u.email}</td>
                    <td className="px-5 py-3 text-gray-500 text-xs">{formatDate(u.createdAt)}</td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => { setApproveTarget(u); setApproveRole('TESTER'); setApproveError(null); }}
                        className="flex items-center gap-1.5 text-xs font-medium bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg transition-colors"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" /> Approve
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Active users table */}
      <h2 className="text-sm font-semibold text-gray-600 mb-3">Active Users</h2>
      {isLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 animate-pulse space-y-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded" />)}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-20 text-red-500 gap-3">
          <AlertCircle className="w-10 h-10" />
          <p className="font-medium">Failed to load users</p>
        </div>
      ) : users.length === 0 ? (
        <div className="flex flex-col items-center justify-center bg-white rounded-xl border border-dashed border-gray-300 py-20 text-gray-400">
          <Users className="w-12 h-12 mb-3 opacity-50" />
          <p className="font-medium">No active users</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">ID</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Username</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Created</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-36">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user: User, i: number) => (
                <tr key={user.id} className={`border-b border-gray-100 hover:bg-blue-50/40 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}>
                  <td className="px-5 py-3"><CopyId id={user.id} /></td>
                  <td className="px-5 py-3 font-medium text-gray-800">{user.username}</td>
                  <td className="px-5 py-3 text-gray-500">{user.email}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ROLE_COLORS[user.role]}`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-400 text-xs">{formatDate(user.createdAt)}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setCurrentUser(user)}
                        title="Log in as this user"
                        className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded transition-colors ${
                          currentUser?.id === user.id
                            ? 'bg-green-100 text-green-700 border border-green-200'
                            : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200'
                        }`}
                      >
                        {currentUser?.id === user.id ? <CheckCircle className="w-3 h-3" /> : <LogIn className="w-3 h-3" />}
                        {currentUser?.id === user.id ? 'Active' : 'Log in'}
                      </button>
                      {isAdmin && (
                        <button
                          onClick={() => setDeleteTarget(user.id)}
                          className="text-gray-300 hover:text-red-500 transition-colors"
                          title="Delete user"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Inactive users (ADMIN only) */}
      {isAdmin && inactiveUsers.length > 0 && (
        <div className="mt-8">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-500 mb-3">
            <UserX className="w-4 h-4" /> Inactive Users ({inactiveUsers.length})
          </h2>
          <div className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">ID</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Username</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Email</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Role</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Deactivated</th>
                </tr>
              </thead>
              <tbody>
                {inactiveUsers.map((user: User, i: number) => (
                  <tr key={user.id} className={`border-b border-gray-100 last:border-0 ${i % 2 === 0 ? 'bg-gray-50' : 'bg-gray-100/40'}`}>
                    <td className="px-5 py-3"><CopyId id={user.id} /></td>
                    <td className="px-5 py-3 font-medium text-gray-400 flex items-center gap-2">
                      {user.username}
                      <span className="text-xs font-medium bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded">INACTIVE</span>
                    </td>
                    <td className="px-5 py-3 text-gray-400">{user.email}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full opacity-50 ${ROLE_COLORS[user.role]}`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-400 text-xs">{formatDate(user.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Modal (ADMIN only) */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl p-6 shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-gray-800">New User</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Username *</label>
                <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="e.g. john_doe"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="john@example.com"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 8 characters"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
                <select value={role} onChange={e => setRole(e.target.value as UserRole)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="TESTER">Tester</option>
                  <option value="ADMIN">Admin</option>
                  <option value="VIEWER">Viewer</option>
                </select>
              </div>
              {formError && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{formError}
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleCreate} disabled={createMutation.isPending}
                className="flex-1 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50">
                {createMutation.isPending ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approve Modal */}
      {approveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl p-6 shadow-xl w-full max-w-sm mx-4">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-gray-800">Approve Account</h3>
              <button onClick={() => { setApproveTarget(null); setApproveError(null); }} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Approving <strong>{approveTarget.username}</strong>. Select the role to grant:
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
              <select value={approveRole} onChange={e => setApproveRole(e.target.value as UserRole)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                <option value="TESTER">Tester</option>
                <option value="VIEWER">Viewer</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
            {approveError && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{approveError}
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => { setApproveTarget(null); setApproveError(null); }}
                className="flex-1 py-2 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending}
                className="flex-1 py-2 text-sm font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50">
                {approveMutation.isPending ? 'Approving...' : 'Approve'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteTarget !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl p-6 shadow-xl w-full max-w-sm mx-4">
            <div className="flex items-start gap-3 mb-4">
              <div className="bg-amber-100 rounded-full p-2 shrink-0">
                <UserX className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-800">Deactivate User?</h3>
                <p className="text-sm text-gray-600 mt-1">
                  This user will be marked as <strong>INACTIVE</strong> and can no longer log in.
                  All their test cases and assignments will be preserved and labelled <strong>(INACTIVE)</strong>.
                  This action cannot be undone from the UI.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={() => deleteMutation.mutate(deleteTarget)} disabled={deleteMutation.isPending}
                className="flex-1 py-2 text-sm font-medium bg-amber-600 hover:bg-amber-700 text-white rounded-lg disabled:opacity-50">
                {deleteMutation.isPending ? 'Deactivating...' : 'Deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
