
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { User, Client, Activity, EODReport, UserRole, ReportStatus, ClientStatus } from '../types';
import { REPORT_STATUS_BADGE } from '../constants';
import * as api from '../services/apiService';

const ACTIVITY_COLORS: Record<string, { bg: string; icon: string; text: string; border: string }> = {
  CHAT_DM: { bg: 'bg-green-50', icon: 'fa-brands fa-whatsapp text-green-500', text: 'text-green-700', border: 'border-green-200' },
  CALL: { bg: 'bg-blue-50', icon: 'fa-solid fa-phone text-blue-500', text: 'text-blue-700', border: 'border-blue-200' },
  VISIT: { bg: 'bg-purple-50', icon: 'fa-solid fa-location-dot text-purple-500', text: 'text-purple-700', border: 'border-purple-200' },
  MEETING: { bg: 'bg-indigo-50', icon: 'fa-solid fa-users text-indigo-500', text: 'text-indigo-700', border: 'border-indigo-200' },
  POSTING: { bg: 'bg-orange-50', icon: 'fa-solid fa-share-nodes text-orange-500', text: 'text-orange-700', border: 'border-orange-200' },
};

interface ManagerViewProps {
  user: User;
  users: User[];
  clients: Client[];
  activities: Activity[];
}

const ManagerView: React.FC<ManagerViewProps> = ({ user, users, clients, activities }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'users'>('overview');
  const [selectedMarketing, setSelectedMarketing] = useState<string>('all');
  const [reports, setReports] = useState<EODReport[]>([]);
  const [reviewingReport, setReviewingReport] = useState<EODReport | null>(null);

  // User management states
  const [managedUsers, setManagedUsers] = useState<User[]>([]);
  const [showAddUser, setShowAddUser] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null);
  const [userFormData, setUserFormData] = useState({ name: '', username: '', password: '', role: 'MARKETING' as string, supervisorId: '' });
  const [resetPassword, setResetPassword] = useState('');
  const [userSaving, setUserSaving] = useState(false);
  const [userError, setUserError] = useState('');
  const [userSuccess, setUserSuccess] = useState('');

  const loadUsers = useCallback(() => {
    api.getUsers().then(setManagedUsers).catch(console.error);
  }, []);

  useEffect(() => {
    if (activeTab === 'users') loadUsers();
  }, [activeTab, loadUsers]);

  const supervisors = useMemo(() => managedUsers.filter(u => u.role === UserRole.SUPERVISOR), [managedUsers]);

  const handleCreateUser = async () => {
    if (!userFormData.name.trim() || !userFormData.username.trim() || !userFormData.password) {
      setUserError('Nama, username, dan password wajib diisi'); return;
    }
    if (userFormData.password.length < 6) {
      setUserError('Password minimal 6 karakter'); return;
    }
    setUserSaving(true); setUserError('');
    try {
      await api.createUser({
        name: userFormData.name,
        username: userFormData.username.toLowerCase(),
        password: userFormData.password,
        role: userFormData.role,
        supervisorId: userFormData.supervisorId || null,
      });
      setShowAddUser(false);
      setUserFormData({ name: '', username: '', password: '', role: 'MARKETING', supervisorId: '' });
      setUserSuccess('User berhasil ditambahkan!');
      loadUsers();
      setTimeout(() => setUserSuccess(''), 3000);
    } catch (err: unknown) {
      setUserError(err instanceof Error ? err.message : 'Gagal membuat user');
    } finally { setUserSaving(false); }
  };

  const handleEditUser = async () => {
    if (!editingUser) return;
    if (!userFormData.name.trim()) { setUserError('Nama wajib diisi'); return; }
    setUserSaving(true); setUserError('');
    try {
      await api.updateUser({
        id: editingUser.id,
        name: userFormData.name,
        role: userFormData.role,
        supervisorId: userFormData.supervisorId || null,
      });
      setEditingUser(null);
      setUserSuccess('User berhasil diupdate!');
      loadUsers();
      setTimeout(() => setUserSuccess(''), 3000);
    } catch (err: unknown) {
      setUserError(err instanceof Error ? err.message : 'Gagal update user');
    } finally { setUserSaving(false); }
  };

  const handleResetPassword = async () => {
    if (!resetPasswordUser) return;
    if (resetPassword.length < 6) { setUserError('Password minimal 6 karakter'); return; }
    setUserSaving(true); setUserError('');
    try {
      await api.updateUser({ id: resetPasswordUser.id, password: resetPassword });
      setResetPasswordUser(null);
      setResetPassword('');
      setUserSuccess('Password berhasil direset!');
      setTimeout(() => setUserSuccess(''), 3000);
    } catch (err: unknown) {
      setUserError(err instanceof Error ? err.message : 'Gagal reset password');
    } finally { setUserSaving(false); }
  };

  const handleToggleActive = async (u: User) => {
    try {
      await api.updateUser({ id: u.id, isActive: !u.isActive });
      setUserSuccess(`User ${u.name} ${u.isActive ? 'dinonaktifkan' : 'diaktifkan'}!`);
      loadUsers();
      setTimeout(() => setUserSuccess(''), 3000);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal update status');
    }
  };

  const marketingUsers = users.filter(u => u.role === UserRole.MARKETING || u.role === UserRole.SUPERVISOR);
  const marketingIds = new Set(marketingUsers.map(m => m.id));

  useEffect(() => {
    api.getReports().then(setReports).catch(console.error);
  }, []);

  // === CORE FIX: Filter all data by selected marketing ===
  const marketingReports = reports.filter(r => marketingIds.has(r.marketingId));

  const filteredReports = selectedMarketing === 'all'
    ? marketingReports
    : marketingReports.filter(r => r.marketingId === selectedMarketing);

  const filteredClients = selectedMarketing === 'all'
    ? clients
    : clients.filter(c => c.marketingId === selectedMarketing);

  const filteredActivities = selectedMarketing === 'all'
    ? activities
    : activities.filter(a => a.marketingId === selectedMarketing);

  const filteredMarketingUsers = selectedMarketing === 'all'
    ? marketingUsers
    : marketingUsers.filter(m => m.id === selectedMarketing);

  const handleApprove = async (reportId: string) => {
    try {
      const updated = await api.updateReportStatus(reportId, ReportStatus.APPROVED);
      setReports(prev => prev.map(r => r.id === reportId ? updated : r));
      setReviewingReport(null);
    } catch (err: unknown) { alert('Error: ' + (err instanceof Error ? err.message : 'Unknown error')); }
  };

  const handleRevision = async (reportId: string) => {
    try {
      const updated = await api.updateReportStatus(reportId, ReportStatus.REVISION);
      setReports(prev => prev.map(r => r.id === reportId ? updated : r));
      setReviewingReport(null);
    } catch (err: unknown) { alert('Error: ' + (err instanceof Error ? err.message : 'Unknown error')); }
  };

  const getStagnantDays = (lastUpdate: string) => {
    if (!lastUpdate) return 999;
    return Math.floor((new Date().getTime() - new Date(lastUpdate).getTime()) / (1000 * 60 * 60 * 24));
  };

  const stagnantClients = filteredClients
    .filter(c => c.status !== ClientStatus.DEAL && c.status !== ClientStatus.LOST)
    .map(c => ({ ...c, daysStagnant: getStagnantDays(c.lastUpdate) }))
    .filter(c => c.daysStagnant > 7)
    .sort((a, b) => b.daysStagnant - a.daysStagnant)
    .slice(0, 5);

  const today = new Date().toISOString().split('T')[0];

  // KPI: compliance based on the filtered marketing scope
  const todayMarketingReports = marketingReports.filter(r => r.date === today);
  const todayFilteredReports = filteredReports.filter(r => r.date === today);

  const submissionRate = selectedMarketing === 'all'
    ? (marketingUsers.length > 0 ? Math.round((todayMarketingReports.length / marketingUsers.length) * 100) : 0)
    : (todayFilteredReports.length > 0 ? 100 : 0);

  const complianceLabel = selectedMarketing === 'all'
    ? `${todayMarketingReports.length}/${marketingUsers.length}`
    : (todayFilteredReports.length > 0 ? '1/1' : '0/1');

  const totalDeals = filteredClients.filter(c => c.status === ClientStatus.DEAL).length;
  const todayActivitiesCount = filteredActivities.filter(a => a.date === today).length;
  const filteredPipelineValue = filteredClients
    .filter(c => c.status !== ClientStatus.DEAL && c.status !== ClientStatus.LOST)
    .reduce((sum, c) => sum + (c.estimatedValue || 0), 0);
  const filteredDealValue = filteredClients
    .filter(c => c.status === ClientStatus.DEAL)
    .reduce((sum, c) => sum + (c.estimatedValue || 0), 0);
  const formatRupiah = (value: number) => {
    return value.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const selectedName = selectedMarketing === 'all'
    ? null
    : marketingUsers.find(m => m.id === selectedMarketing)?.name || '';

  // Timeline activities for the report being reviewed
  const reviewActivities = useMemo(() => {
    if (!reviewingReport) return [];
    return activities
      .filter(a => a.marketingId === reviewingReport.marketingId && a.date === reviewingReport.date)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [reviewingReport, activities]);

  const getClientName = (clientId?: string) => {
    if (!clientId) return null;
    return clients.find(c => c.id === clientId)?.name || null;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Manager Oversight</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {activeTab === 'users'
              ? 'Kelola akun tim marketing'
              : selectedName
                ? <>Monitoring performa <span className="font-semibold text-indigo-600">{selectedName}</span></>
                : 'Monitoring & Performance Evaluation Dashboard'
            }
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-white border border-slate-200 rounded-xl p-1 flex shadow-sm">
            <button onClick={() => setActiveTab('overview')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'overview' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-700'}`}>
              <i className="fa-solid fa-chart-line mr-1.5"></i>Overview
            </button>
            <button onClick={() => setActiveTab('users')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'users' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-700'}`}>
              <i className="fa-solid fa-users-gear mr-1.5"></i>Users
            </button>
          </div>
          {activeTab === 'overview' && (
            <select
              className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium shadow-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 min-w-[200px]"
              value={selectedMarketing} onChange={(e) => setSelectedMarketing(e.target.value)}>
              <option value="all">All Marketing Team</option>
              {marketingUsers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Success toast */}
      {userSuccess && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2 animate-fade-in">
          <i className="fa-solid fa-circle-check"></i>{userSuccess}
        </div>
      )}

      {/* ═══ USER MANAGEMENT TAB ═══ */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          {/* Add User Button */}
          <div className="flex justify-end">
            <button onClick={() => { setShowAddUser(true); setUserFormData({ name: '', username: '', password: '', role: 'MARKETING', supervisorId: '' }); setUserError(''); }}
              className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20 text-sm flex items-center gap-2 active:scale-[0.98]">
              <i className="fa-solid fa-user-plus"></i>Tambah User
            </button>
          </div>

          {/* Users Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-100">
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">User</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Username</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Role</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Supervisor</th>
                    <th className="px-4 py-3 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">Client</th>
                    <th className="px-4 py-3 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {managedUsers.filter(u => u.role !== UserRole.MANAGER).map(u => (
                    <tr key={u.id} className={`hover:bg-slate-50/50 transition-colors ${u.isActive === false ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <img src={u.avatar} className="w-9 h-9 rounded-full object-cover border border-slate-100" alt={u.name} />
                          <span className="font-semibold text-sm text-slate-800">{u.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-500 font-mono">{u.username || '-'}</td>
                      <td className="px-4 py-3.5">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                          u.role === UserRole.SUPERVISOR ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' : 'bg-purple-100 text-purple-700 border border-purple-200'
                        }`}>{u.role}</span>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-500">
                        {u.supervisorId ? managedUsers.find(s => s.id === u.supervisorId)?.name || '-' : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-lg text-xs font-bold">{u.clientCount || 0}</span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${u.isActive !== false ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                          {u.isActive !== false ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => {
                            setEditingUser(u);
                            setUserFormData({ name: u.name, username: u.username || '', password: '', role: u.role, supervisorId: u.supervisorId || '' });
                            setUserError('');
                          }} className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 hover:bg-indigo-100 hover:text-indigo-600 flex items-center justify-center transition-colors" title="Edit">
                            <i className="fa-solid fa-pen text-[10px]"></i>
                          </button>
                          <button onClick={() => { setResetPasswordUser(u); setResetPassword(''); setUserError(''); }}
                            className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 hover:bg-amber-100 hover:text-amber-600 flex items-center justify-center transition-colors" title="Reset Password">
                            <i className="fa-solid fa-key text-[10px]"></i>
                          </button>
                          <button onClick={() => handleToggleActive(u)}
                            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${u.isActive !== false ? 'bg-slate-100 text-slate-500 hover:bg-red-100 hover:text-red-600' : 'bg-green-100 text-green-600 hover:bg-green-200'}`}
                            title={u.isActive !== false ? 'Nonaktifkan' : 'Aktifkan'}>
                            <i className={`fa-solid ${u.isActive !== false ? 'fa-user-slash' : 'fa-user-check'} text-[10px]`}></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Manager Info */}
          <div className="bg-gradient-to-b from-slate-800 to-slate-900 rounded-2xl shadow-xl p-5 text-white">
            <h3 className="font-bold text-sm mb-3 flex items-center gap-2 text-indigo-400">
              <i className="fa-solid fa-shield-halved"></i>Manager Account
            </h3>
            {managedUsers.filter(u => u.role === UserRole.MANAGER).map(m => (
              <div key={m.id} className="flex items-center gap-3 bg-white/5 p-3 rounded-xl border border-white/5">
                <img src={m.avatar} className="w-10 h-10 rounded-full object-cover border-2 border-indigo-400" alt={m.name} />
                <div>
                  <p className="font-bold text-sm">{m.name}</p>
                  <p className="text-[10px] text-slate-400 font-mono">{m.username || m.id}</p>
                </div>
                <span className="ml-auto px-2 py-0.5 rounded-full text-[9px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">MANAGER</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ ADD USER MODAL ═══ */}
      {showAddUser && (
        <div className="fixed inset-0 bg-black/40 glass z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md overflow-hidden animate-slide-up">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Tambah User Baru</h2>
                <p className="text-xs text-slate-400">Buat akun marketing baru</p>
              </div>
              <button onClick={() => setShowAddUser(false)} className="w-8 h-8 rounded-lg bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center">
                <i className="fa-solid fa-xmark text-sm"></i>
              </button>
            </div>
            <div className="p-5 space-y-4">
              {userError && <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded-xl text-xs font-medium">{userError}</div>}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Nama Lengkap *</label>
                <input type="text" className="w-full border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 outline-none text-sm"
                  placeholder="Nama lengkap" value={userFormData.name} onChange={(e) => setUserFormData({...userFormData, name: e.target.value})} />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Username *</label>
                <input type="text" className="w-full border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 outline-none text-sm font-mono"
                  placeholder="username" value={userFormData.username} onChange={(e) => setUserFormData({...userFormData, username: e.target.value.toLowerCase().replace(/\s/g, '')})} />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Password *</label>
                <input type="text" className="w-full border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 outline-none text-sm font-mono"
                  placeholder="Min. 6 karakter" value={userFormData.password} onChange={(e) => setUserFormData({...userFormData, password: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Role *</label>
                  <select className="w-full border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 outline-none text-sm"
                    value={userFormData.role} onChange={(e) => setUserFormData({...userFormData, role: e.target.value})}>
                    <option value="MARKETING">Marketing</option>
                    <option value="SUPERVISOR">Supervisor</option>
                    <option value="AUDITOR">Auditor</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Supervisor</label>
                  <select className="w-full border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 outline-none text-sm"
                    value={userFormData.supervisorId} onChange={(e) => setUserFormData({...userFormData, supervisorId: e.target.value})}>
                    <option value="">— Tidak ada —</option>
                    {supervisors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="p-5 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setShowAddUser(false)} className="px-5 py-2.5 text-slate-600 font-medium rounded-xl hover:bg-slate-100 text-sm">Batal</button>
              <button onClick={handleCreateUser} disabled={userSaving}
                className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-500 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20 flex items-center gap-2 text-sm active:scale-[0.98]">
                {userSaving ? <><i className="fa-solid fa-spinner fa-spin"></i>Saving...</> : <><i className="fa-solid fa-user-plus"></i>Tambah User</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ EDIT USER MODAL ═══ */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/40 glass z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md overflow-hidden animate-slide-up">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Edit User</h2>
                <p className="text-xs text-slate-400">Update data {editingUser.name}</p>
              </div>
              <button onClick={() => setEditingUser(null)} className="w-8 h-8 rounded-lg bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center">
                <i className="fa-solid fa-xmark text-sm"></i>
              </button>
            </div>
            <div className="p-5 space-y-4">
              {userError && <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded-xl text-xs font-medium">{userError}</div>}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Nama Lengkap *</label>
                <input type="text" className="w-full border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 outline-none text-sm"
                  value={userFormData.name} onChange={(e) => setUserFormData({...userFormData, name: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Role</label>
                  <select className="w-full border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 outline-none text-sm"
                    value={userFormData.role} onChange={(e) => setUserFormData({...userFormData, role: e.target.value})}>
                    <option value="MARKETING">Marketing</option>
                    <option value="SUPERVISOR">Supervisor</option>
                    <option value="AUDITOR">Auditor</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Supervisor</label>
                  <select className="w-full border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 outline-none text-sm"
                    value={userFormData.supervisorId} onChange={(e) => setUserFormData({...userFormData, supervisorId: e.target.value})}>
                    <option value="">— Tidak ada —</option>
                    {supervisors.filter(s => s.id !== editingUser.id).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="p-5 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setEditingUser(null)} className="px-5 py-2.5 text-slate-600 font-medium rounded-xl hover:bg-slate-100 text-sm">Batal</button>
              <button onClick={handleEditUser} disabled={userSaving}
                className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-500 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20 flex items-center gap-2 text-sm active:scale-[0.98]">
                {userSaving ? <><i className="fa-solid fa-spinner fa-spin"></i>Saving...</> : <><i className="fa-solid fa-check"></i>Update</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ RESET PASSWORD MODAL ═══ */}
      {resetPasswordUser && (
        <div className="fixed inset-0 bg-black/40 glass z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm overflow-hidden animate-slide-up">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Reset Password</h2>
                <p className="text-xs text-slate-400">{resetPasswordUser.name}</p>
              </div>
              <button onClick={() => setResetPasswordUser(null)} className="w-8 h-8 rounded-lg bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center">
                <i className="fa-solid fa-xmark text-sm"></i>
              </button>
            </div>
            <div className="p-5 space-y-4">
              {userError && <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded-xl text-xs font-medium">{userError}</div>}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Password Baru *</label>
                <input type="text" className="w-full border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 outline-none text-sm font-mono"
                  placeholder="Min. 6 karakter" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} />
              </div>
            </div>
            <div className="p-5 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setResetPasswordUser(null)} className="px-5 py-2.5 text-slate-600 font-medium rounded-xl hover:bg-slate-100 text-sm">Batal</button>
              <button onClick={handleResetPassword} disabled={userSaving}
                className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg shadow-amber-500/20 flex items-center gap-2 text-sm active:scale-[0.98]">
                {userSaving ? <><i className="fa-solid fa-spinner fa-spin"></i>Saving...</> : <><i className="fa-solid fa-key"></i>Reset Password</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ OVERVIEW TAB ═══ */}
      {activeTab === 'overview' && (<>
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 card-hover">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Report Compliance</p>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${submissionRate >= 80 ? 'bg-green-100 text-green-700' : submissionRate >= 50 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
              {submissionRate >= 80 ? 'Excellent' : submissionRate >= 50 ? 'Good' : 'Low'}
            </span>
          </div>
          <div className="flex items-end justify-between mb-3">
            <span className="text-3xl font-bold text-slate-800">{submissionRate}%</span>
            <span className="text-xs text-slate-400">{complianceLabel}</span>
          </div>
          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${submissionRate >= 80 ? 'bg-green-500' : submissionRate >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${submissionRate}%` }}></div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 card-hover">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Today Activities</p>
          </div>
          <div className="flex items-end justify-between mb-3">
            <span className="text-3xl font-bold text-slate-800">{todayActivitiesCount}</span>
            <span className="text-xs text-slate-400">{selectedMarketing === 'all' ? 'across team' : 'personal'}</span>
          </div>
          <div className="flex -space-x-2">
            {filteredMarketingUsers.slice(0, 5).map(m => (
              <img key={m.id} src={m.avatar} className="w-7 h-7 rounded-full border-2 border-white object-cover" alt={m.name} />
            ))}
          </div>
        </div>

        <div className="bg-gradient-to-br from-indigo-600 to-purple-600 p-5 rounded-2xl shadow-lg shadow-indigo-500/20 text-white card-hover">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest">Total Deals</p>
          </div>
          <div className="flex items-end justify-between mb-3">
            <span className="text-3xl font-bold">{totalDeals}</span>
            <span className="text-xs text-indigo-200">of {filteredClients.length} clients</span>
          </div>
          <div className="h-2 w-full bg-white/20 rounded-full overflow-hidden">
            <div className="h-full bg-white/60 rounded-full" style={{ width: `${filteredClients.length > 0 ? (totalDeals / filteredClients.length) * 100 : 0}%` }}></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Reports list */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                <i className="fa-solid fa-file-lines text-indigo-500"></i>
                Recent EOD Reports
              </h3>
              <span className="text-[10px] text-slate-400 font-medium bg-slate-50 px-2 py-1 rounded-lg">{filteredReports.length} total</span>
            </div>
            <div className="divide-y divide-slate-50">
              {filteredReports.length > 0 ? filteredReports.slice(0, 10).map(report => {
                const reportUser = users.find(u => u.id === report.marketingId);
                return (
                  <div key={report.id} className="p-4 hover:bg-slate-50/50 transition-colors">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <img src={reportUser?.avatar} className="w-10 h-10 rounded-full object-cover border border-slate-100 flex-shrink-0" alt={reportUser?.name} />
                        <div className="min-w-0">
                          <p className="font-bold text-sm text-slate-800 truncate">{reportUser?.name}</p>
                          <p className="text-[10px] text-slate-400">
                            {report.date} {report.submittedAt ? `at ${new Date(report.submittedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${REPORT_STATUS_BADGE[report.status as ReportStatus] || 'bg-slate-100 text-slate-600'}`}>
                          {report.status}
                        </span>
                        <button onClick={() => setReviewingReport(report)}
                          className="bg-slate-50 text-slate-500 px-3 py-1.5 rounded-lg text-[11px] font-bold hover:bg-indigo-600 hover:text-white transition-all">
                          Review
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }) : (
                <div className="p-12 text-center">
                  <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <i className="fa-solid fa-file-lines text-slate-300 text-2xl"></i>
                  </div>
                  <p className="text-slate-400 font-medium text-sm">
                    {selectedMarketing === 'all' ? 'Belum ada laporan yang masuk' : `Belum ada laporan dari ${selectedName}`}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Stagnant Clients */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
            <h3 className="font-bold text-sm text-slate-800 mb-4 flex items-center gap-2">
              <i className="fa-solid fa-triangle-exclamation text-amber-500"></i>
              Stagnant Clients ({'>'}7 days)
            </h3>
            <div className="space-y-2.5">
              {stagnantClients.length > 0 ? stagnantClients.map(c => (
                <div key={c.id} className="p-3 bg-red-50/50 rounded-xl border border-red-100">
                  <div className="flex items-start justify-between mb-1">
                    <p className="font-bold text-xs text-red-900 truncate flex-1">{c.name}</p>
                    <span className="text-[9px] font-bold text-red-500 bg-red-100 px-1.5 py-0.5 rounded flex-shrink-0 ml-2">{c.daysStagnant}d</span>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    PIC: {marketingUsers.find(m => m.id === c.marketingId)?.name || 'N/A'}
                  </p>
                </div>
              )) : (
                <div className="p-4 text-center">
                  <i className="fa-solid fa-circle-check text-green-400 text-xl mb-2"></i>
                  <p className="text-xs text-slate-400 font-medium">Semua client aktif!</p>
                </div>
              )}
            </div>
          </div>

          {/* Performance Summary */}
          <div className="bg-gradient-to-b from-slate-800 to-slate-900 rounded-2xl shadow-xl p-5 text-white">
            <h3 className="font-bold text-sm mb-4 flex items-center gap-2 text-indigo-400">
              <i className="fa-solid fa-chart-bar"></i>
              Performance Summary
            </h3>
            <div className="space-y-3">
              <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                <p className="font-bold text-indigo-300 text-[10px] uppercase tracking-wider mb-1">Activity</p>
                <p className="text-xs text-slate-300">
                  {todayActivitiesCount} aktivitas hari ini
                  {selectedMarketing === 'all' ? ` dari ${marketingUsers.length} anggota tim` : ` oleh ${selectedName}`}.
                </p>
              </div>
              <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                <p className="font-bold text-indigo-300 text-[10px] uppercase tracking-wider mb-1">Compliance</p>
                <p className="text-xs text-slate-300">
                  {selectedMarketing === 'all'
                    ? `${todayMarketingReports.length}/${marketingUsers.length} marketing sudah submit EOD (${submissionRate}%).`
                    : (todayFilteredReports.length > 0 ? `${selectedName} sudah submit EOD hari ini.` : `${selectedName} belum submit EOD hari ini.`)
                  }
                </p>
              </div>
              <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                <p className="font-bold text-indigo-300 text-[10px] uppercase tracking-wider mb-1">Pipeline</p>
                <p className="text-xs text-slate-300">{filteredClients.length} client aktif. {stagnantClients.length} stagnant perlu perhatian.</p>
              </div>
              <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                <p className="font-bold text-emerald-300 text-[10px] uppercase tracking-wider mb-1">Revenue</p>
                <p className="text-xs text-slate-300">
                  Pipeline: Rp {formatRupiah(filteredPipelineValue)} | Deal: Rp {formatRupiah(filteredDealValue)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      </>)}

      {/* Review Modal */}
      {reviewingReport && (
        <div className="fixed inset-0 bg-black/40 glass z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl overflow-hidden animate-slide-up max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Review Report</h2>
                <p className="text-xs text-slate-400">{users.find(u => u.id === reviewingReport.marketingId)?.name} - {reviewingReport.date}</p>
              </div>
              <button onClick={() => setReviewingReport(null)} className="w-8 h-8 rounded-lg bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center">
                <i className="fa-solid fa-xmark text-sm"></i>
              </button>
            </div>
            <div className="p-5 space-y-5 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 140px)' }}>
              {/* Meta info */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 p-3 rounded-xl">
                  <p className="text-[9px] font-bold text-slate-400 uppercase">Marketing</p>
                  <p className="font-semibold text-xs mt-0.5">{users.find(u => u.id === reviewingReport.marketingId)?.name}</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl">
                  <p className="text-[9px] font-bold text-slate-400 uppercase">Tanggal</p>
                  <p className="font-semibold text-xs mt-0.5">{reviewingReport.date}</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl">
                  <p className="text-[9px] font-bold text-slate-400 uppercase">Status</p>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${REPORT_STATUS_BADGE[reviewingReport.status as ReportStatus] || 'bg-slate-100 text-slate-600'}`}>
                    {reviewingReport.status}
                  </span>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl">
                  <p className="text-[9px] font-bold text-slate-400 uppercase">Submitted</p>
                  <p className="font-semibold text-xs mt-0.5">{reviewingReport.submittedAt ? new Date(reviewingReport.submittedAt).toLocaleString('id-ID') : '-'}</p>
                </div>
              </div>

              {/* Timeline Activities */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-2 flex items-center gap-1.5">
                  <i className="fa-solid fa-timeline text-indigo-500"></i>
                  Timeline Aktivitas
                  <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded text-[9px] font-medium ml-1">{reviewActivities.length}</span>
                </p>
                {reviewActivities.length > 0 ? (
                  <div className="relative">
                    <div className="absolute left-[15px] top-3 bottom-3 w-0.5 bg-slate-100"></div>
                    <div className="space-y-2.5 max-h-60 overflow-y-auto">
                      {reviewActivities.map(activity => {
                        const colors = ACTIVITY_COLORS[activity.type] || ACTIVITY_COLORS.CHAT_DM;
                        const clientName = getClientName(activity.clientId);
                        return (
                          <div key={activity.id} className="relative flex gap-3">
                            <div className={`w-8 h-8 rounded-lg ${colors.bg} border ${colors.border} flex items-center justify-center flex-shrink-0 z-10`}>
                              <i className={`${colors.icon} text-xs`}></i>
                            </div>
                            <div className={`flex-1 ${colors.bg} border ${colors.border} rounded-lg p-3`}>
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className={`text-[9px] font-bold uppercase ${colors.text}`}>{activity.type.replace('_', '/')}</span>
                                  {clientName && (
                                    <span className="text-[9px] bg-white/80 text-slate-600 px-1.5 py-0.5 rounded font-medium border border-slate-100">
                                      {clientName}
                                    </span>
                                  )}
                                </div>
                                <span className="text-[9px] text-slate-400 font-mono flex-shrink-0">
                                  {activity.startTime?.slice(0, 5)} - {activity.endTime?.slice(0, 5)}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-700 leading-relaxed">{activity.description}</p>
                              {activity.location && activity.location !== '-' && (
                                <p className="text-[9px] text-slate-400 mt-1 flex items-center gap-1">
                                  <i className="fa-solid fa-map-pin text-[7px]"></i>{activity.location}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-50 p-6 rounded-xl text-center border border-slate-100">
                    <i className="fa-solid fa-timeline text-slate-300 text-lg mb-2"></i>
                    <p className="text-xs text-slate-400">Tidak ada aktivitas tercatat untuk tanggal ini</p>
                  </div>
                )}
              </div>

              {/* Summary */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">Ringkasan</p>
                <div className="bg-slate-50 p-4 rounded-xl text-sm text-slate-700 leading-relaxed whitespace-pre-line">{reviewingReport.summary || '-'}</div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">Kendala</p>
                  <div className="bg-slate-50 p-3 rounded-xl text-sm text-slate-700">{reviewingReport.constraints || '-'}</div>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">Rencana Besok</p>
                  <div className="bg-slate-50 p-3 rounded-xl text-sm text-slate-700">{reviewingReport.planTomorrow || '-'}</div>
                </div>
              </div>
            </div>

            <div className="p-5 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row justify-end gap-2 sticky bottom-0">
              <button onClick={() => setReviewingReport(null)} className="px-5 py-2.5 text-slate-600 font-medium rounded-xl hover:bg-slate-100 text-sm order-3 sm:order-1">Close</button>
              {reviewingReport.status !== 'APPROVED' && (
                <>
                  <button onClick={() => handleRevision(reviewingReport.id)}
                    className="px-5 py-2.5 bg-red-50 text-red-600 rounded-xl font-bold hover:bg-red-100 transition-colors text-sm flex items-center justify-center gap-1.5 order-2">
                    <i className="fa-solid fa-rotate-left text-xs"></i> Revision
                  </button>
                  <button onClick={() => handleApprove(reviewingReport.id)}
                    className="px-5 py-2.5 bg-gradient-to-r from-green-600 to-emerald-500 text-white rounded-xl font-bold hover:from-green-500 hover:to-emerald-400 transition-all text-sm flex items-center justify-center gap-1.5 shadow-lg shadow-green-500/20 order-1 sm:order-3 active:scale-[0.98]">
                    <i className="fa-solid fa-check text-xs"></i> Approve
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManagerView;
