import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LayoutDashboard, User, ChevronDown, LogOut, X, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useCurrentUser } from '../context/UserContext';
import { getAllUsers } from '../api/userApi';
import { verifyPassword } from '../api/authApi';
import type { User as UserType } from '../api/userApi';
import axios from 'axios';

export default function Navbar() {
  const { currentUser, setCurrentUser } = useCurrentUser();
  const navigate = useNavigate();

  const [showModal, setShowModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserType | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: getAllUsers,
    enabled: showModal,
  });

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `px-4 py-1.5 rounded text-sm font-medium transition-colors ${
      isActive ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-white/10'
    }`;

  const openModal = () => {
    setSelectedUser(null);
    setPassword('');
    setVerifyError(null);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedUser(null);
    setPassword('');
    setVerifyError(null);
  };

  const handleSignOut = () => {
    setCurrentUser(null);
    navigate('/login', { replace: true });
  };

  const handleSelectUser = (u: UserType) => {
    if (u.id === currentUser?.id) return; // already this user, no switch needed
    setSelectedUser(u);
    setPassword('');
    setVerifyError(null);
  };

  const handleConfirmSwitch = async () => {
    if (!selectedUser || !password) return;
    setVerifying(true);
    setVerifyError(null);
    try {
      const valid = await verifyPassword(selectedUser.id, password);
      if (valid) {
        setCurrentUser(selectedUser);
        closeModal();
      } else {
        setVerifyError('Incorrect password. Please try again.');
      }
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setVerifyError(err.response?.data?.detail ?? err.message ?? 'Verification failed');
      } else {
        setVerifyError('Verification failed');
      }
    } finally {
      setVerifying(false);
    }
  };

  return (
    <>
      <nav className="bg-[#0f1c3f] text-white shadow-lg">
        <div className="max-w-screen-2xl mx-auto px-6 flex items-center h-14 gap-8">
          <div className="flex items-center gap-2 font-bold text-lg tracking-wide select-none">
            <LayoutDashboard className="w-5 h-5 text-blue-400" />
            <span>OnePortal</span>
          </div>
          <div className="flex gap-1">
            <NavLink to="/users" className={linkClass}>Users</NavLink>
            <NavLink to="/projects" className={linkClass}>Projects</NavLink>
            <NavLink to="/test-designs" className={linkClass}>Test Designs</NavLink>
          </div>

          <div className="ml-auto flex items-center gap-3">
            {currentUser && (
              <>
                <button
                  onClick={openModal}
                  className="flex items-center gap-2 bg-white/10 hover:bg-white/20 rounded-lg px-3 py-1.5 transition-colors"
                >
                  <User className="w-4 h-4 text-blue-300 shrink-0" />
                  <span className="text-sm font-medium text-white">{currentUser.username}</span>
                  <span className="text-xs text-blue-300 bg-blue-900/50 px-1.5 py-0.5 rounded">{currentUser.role}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                </button>
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-1.5 text-gray-400 hover:text-red-400 transition-colors text-sm"
                  title="Sign out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </nav>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl p-6 shadow-xl w-full max-w-sm mx-4">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-gray-800">
                {selectedUser ? 'Confirm switch' : 'Switch user'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {!selectedUser ? (
              /* Step 1: pick a user */
              users.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">No active users found.</p>
              ) : (
                <ul className="space-y-2 max-h-72 overflow-y-auto">
                  {users.map((u: UserType) => (
                    <li key={u.id}>
                      <button
                        onClick={() => handleSelectUser(u)}
                        className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left ${
                          currentUser?.id === u.id
                            ? 'border-indigo-500 bg-indigo-50 cursor-default'
                            : 'border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <div className="bg-indigo-100 rounded-full w-8 h-8 flex items-center justify-center shrink-0">
                          <User className="w-4 h-4 text-indigo-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800">{u.username}</p>
                          <p className="text-xs text-gray-500 truncate">{u.email}</p>
                        </div>
                        <span className="text-xs font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full shrink-0">
                          {u.role}
                        </span>
                        {currentUser?.id === u.id && (
                          <span className="text-xs text-green-600 font-medium shrink-0">Active</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )
            ) : (
              /* Step 2: verify password */
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                  <div className="bg-indigo-100 rounded-full w-8 h-8 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{selectedUser.username}</p>
                    <p className="text-xs text-indigo-600">{selectedUser.role}</p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Enter <strong>{selectedUser.username}</strong>'s password to confirm
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleConfirmSwitch()}
                      placeholder="Password"
                      autoFocus
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {verifyError && (
                  <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    {verifyError}
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => { setSelectedUser(null); setPassword(''); setVerifyError(null); }}
                    className="flex-1 py-2 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleConfirmSwitch}
                    disabled={!password || verifying}
                    className="flex-1 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50"
                  >
                    {verifying ? 'Verifying...' : 'Switch'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
