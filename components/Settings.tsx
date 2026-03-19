
import React, { useState } from 'react';
import { User } from '../types';
import * as api from '../services/apiService';

interface SettingsProps {
  user: User;
  onLogout: () => void;
  appVersion: string;
}

const Settings: React.FC<SettingsProps> = ({ user, onLogout, appVersion }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const showStatus = (type: 'success' | 'error', msg: string) => {
    setStatus({ type, msg });
    setTimeout(() => setStatus(null), 4000);
  };

  const handleChangePassword = async () => {
    if (!currentPassword) { showStatus('error', 'Password lama wajib diisi'); return; }
    if (newPassword.length < 6) { showStatus('error', 'Password baru minimal 6 karakter'); return; }
    if (newPassword !== confirmPassword) { showStatus('error', 'Konfirmasi password tidak cocok'); return; }

    setSaving(true);
    try {
      // Verify current password by trying to login
      await api.login(user.username || '', currentPassword);
      // If login succeeds, update password
      await api.updateUser({ id: user.id, password: newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showStatus('success', 'Password berhasil diubah!');
    } catch {
      showStatus('error', 'Password lama salah atau gagal mengubah password');
    } finally { setSaving(false); }
  };

  const roleLabel: Record<string, { text: string; color: string }> = {
    MARKETING: { text: 'Marketing', color: 'bg-purple-100 text-purple-700 border-purple-200' },
    MANAGER: { text: 'Manager', color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
    SUPERVISOR: { text: 'Supervisor', color: 'bg-blue-100 text-blue-700 border-blue-200' },
    AUDITOR: { text: 'Auditor', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  };

  const rl = roleLabel[user.role] || roleLabel.MARKETING;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Pengaturan</h1>
        <p className="text-slate-500 text-sm mt-0.5">Kelola akun dan preferensi Anda</p>
      </div>

      {/* Status toast */}
      {status && (
        <div className={`px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2 animate-fade-in ${
          status.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          <i className={`fa-solid ${status.type === 'success' ? 'fa-circle-check' : 'fa-circle-xmark'}`}></i>
          {status.msg}
        </div>
      )}

      {/* Profile Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2"></div>
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2"></div>
          <div className="flex items-center gap-4 relative">
            <div className="relative">
              <img src={user.avatar} className="w-16 h-16 rounded-2xl border-3 border-white/30 object-cover shadow-lg" alt="Avatar" />
              <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-2 border-white"></div>
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">{user.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${rl.color}`}>{rl.text}</span>
                {user.username && <span className="text-xs text-indigo-200 font-mono">@{user.username}</span>}
              </div>
            </div>
          </div>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">User ID</p>
              <p className="text-sm font-semibold text-slate-700 mt-0.5 font-mono">{user.id}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <p className="text-sm font-semibold text-green-600">Aktif</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Change Password */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-5 border-b border-slate-100">
          <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
            <i className="fa-solid fa-lock text-indigo-500"></i>
            Ubah Password
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">Pastikan password baru mudah diingat tapi sulit ditebak</p>
        </div>
        <div className="p-5 space-y-4">
          {/* Current password */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Password Lama</label>
            <div className="relative">
              <input type={showCurrentPw ? 'text' : 'password'} value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
                placeholder="Masukkan password lama"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 pr-10" />
              <button type="button" onClick={() => setShowCurrentPw(!showCurrentPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <i className={`fa-solid ${showCurrentPw ? 'fa-eye-slash' : 'fa-eye'} text-xs`}></i>
              </button>
            </div>
          </div>

          {/* New password */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Password Baru</label>
            <div className="relative">
              <input type={showNewPw ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)}
                placeholder="Minimal 6 karakter"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 pr-10" />
              <button type="button" onClick={() => setShowNewPw(!showNewPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <i className={`fa-solid ${showNewPw ? 'fa-eye-slash' : 'fa-eye'} text-xs`}></i>
              </button>
            </div>
            {newPassword && (
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${
                    newPassword.length < 6 ? 'w-1/4 bg-red-400' :
                    newPassword.length < 8 ? 'w-2/4 bg-amber-400' :
                    newPassword.length < 12 ? 'w-3/4 bg-blue-400' : 'w-full bg-green-400'
                  }`}></div>
                </div>
                <span className={`text-[10px] font-bold ${
                  newPassword.length < 6 ? 'text-red-500' :
                  newPassword.length < 8 ? 'text-amber-500' :
                  newPassword.length < 12 ? 'text-blue-500' : 'text-green-500'
                }`}>
                  {newPassword.length < 6 ? 'Terlalu pendek' : newPassword.length < 8 ? 'Cukup' : newPassword.length < 12 ? 'Bagus' : 'Kuat'}
                </span>
              </div>
            )}
          </div>

          {/* Confirm password */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Konfirmasi Password Baru</label>
            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Ulangi password baru"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300" />
            {confirmPassword && newPassword !== confirmPassword && (
              <p className="text-[10px] text-red-500 font-medium mt-1 flex items-center gap-1">
                <i className="fa-solid fa-circle-xmark text-[8px]"></i>Password tidak cocok
              </p>
            )}
            {confirmPassword && newPassword === confirmPassword && confirmPassword.length >= 6 && (
              <p className="text-[10px] text-green-500 font-medium mt-1 flex items-center gap-1">
                <i className="fa-solid fa-circle-check text-[8px]"></i>Password cocok
              </p>
            )}
          </div>

          <button onClick={handleChangePassword} disabled={saving || !currentPassword || newPassword.length < 6 || newPassword !== confirmPassword}
            className="w-full px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20 text-sm flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed">
            <i className={`fa-solid ${saving ? 'fa-spinner fa-spin' : 'fa-key'}`}></i>
            {saving ? 'Menyimpan...' : 'Ubah Password'}
          </button>
        </div>
      </div>

      {/* App Info */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-5 border-b border-slate-100">
          <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
            <i className="fa-solid fa-circle-info text-indigo-500"></i>
            Tentang Aplikasi
          </h3>
        </div>
        <div className="p-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-slate-500">Aplikasi</span>
              <span className="text-sm font-bold text-slate-800">IMDACS</span>
            </div>
            <div className="border-t border-slate-50"></div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-slate-500">Versi</span>
              <span className="text-sm font-mono font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg">v{appVersion}</span>
            </div>
            <div className="border-t border-slate-50"></div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-slate-500">Deskripsi</span>
              <span className="text-xs text-slate-600 text-right max-w-[200px]">Internal Marketing Daily Activity & Client System</span>
            </div>
            <div className="border-t border-slate-50"></div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-slate-500">Organisasi</span>
              <span className="text-xs text-slate-600 text-right">KAP Budiandru & Rekan</span>
            </div>
          </div>
        </div>
      </div>

      {/* Logout */}
      <div className="bg-white rounded-2xl shadow-sm border border-red-100 overflow-hidden">
        <div className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-red-600 flex items-center gap-2">
                <i className="fa-solid fa-arrow-right-from-bracket"></i>
                Keluar dari Akun
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Anda akan diarahkan ke halaman login</p>
            </div>
            <button onClick={() => setShowLogoutConfirm(true)}
              className="px-5 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded-xl text-sm transition-all border border-red-200 flex items-center gap-2 active:scale-[0.98]">
              <i className="fa-solid fa-arrow-right-from-bracket text-xs"></i>
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* Logout confirmation modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-black/40 glass z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden animate-slide-up">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <i className="fa-solid fa-arrow-right-from-bracket text-red-500 text-2xl"></i>
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-1">Logout?</h3>
              <p className="text-sm text-slate-500">Yakin ingin keluar dari akun <span className="font-semibold text-slate-700">{user.name}</span>?</p>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl text-sm transition-all">
                Batal
              </button>
              <button onClick={onLogout}
                className="flex-1 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl text-sm transition-all shadow-lg shadow-red-500/20 flex items-center justify-center gap-2">
                <i className="fa-solid fa-arrow-right-from-bracket text-xs"></i>
                Ya, Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
