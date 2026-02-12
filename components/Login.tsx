
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

const Login: React.FC = () => {
  const { login, isLoading, error } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSplashDone(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');

    if (!username.trim() || !password.trim()) {
      setLocalError('Username dan password harus diisi');
      return;
    }

    try {
      await login(username, password);
    } catch (err: any) {
      setLocalError(err.message || 'Login gagal');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-500/5 rounded-full blur-3xl"></div>
      </div>

      {/* Splash Logo */}
      {!splashDone && (
        <div className="fixed inset-0 z-50 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 flex items-center justify-center animate-[logoZoom_2s_cubic-bezier(0.4,0,0.2,1)_forwards]">
          <img
            src="/logo.jpeg"
            alt="IMDACS Logo"
            className="w-52 h-52 sm:w-64 sm:h-64 object-contain rounded-3xl shadow-2xl shadow-indigo-500/20"
          />
        </div>
      )}

      {/* Login Content */}
      <div className={`w-full max-w-sm relative z-10 ${splashDone ? 'animate-[loginReveal_0.6s_cubic-bezier(0.4,0,0.2,1)_forwards]' : 'opacity-0'}`}>
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="relative inline-block mb-4">
            <img
              src="/logo.jpeg"
              alt="IMDACS Logo"
              className="w-20 h-20 rounded-2xl mx-auto shadow-2xl shadow-indigo-500/30 object-contain rotate-3 hover:rotate-0 transition-transform"
            />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">IMDACS</h1>
          <p className="text-indigo-300/80 text-xs font-semibold uppercase tracking-[0.2em] mt-1">
            Marketing Activity System
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white/[0.07] glass rounded-3xl p-8 border border-white/10 shadow-2xl">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-white mb-1">Selamat Datang</h2>
            <p className="text-slate-400 text-sm">Masuk ke akun Anda untuk melanjutkan</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Username</label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-400 transition-colors">
                  <i className="fa-solid fa-user text-sm"></i>
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-11 pr-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:border-indigo-500 focus:bg-white/10 focus:ring-1 focus:ring-indigo-500/50 outline-none transition-all text-sm"
                  placeholder="Masukkan username"
                  autoComplete="username"
                  disabled={isLoading}
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Password</label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-400 transition-colors">
                  <i className="fa-solid fa-lock text-sm"></i>
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-12 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:border-indigo-500 focus:bg-white/10 focus:ring-1 focus:ring-indigo-500/50 outline-none transition-all text-sm"
                  placeholder="Masukkan password"
                  autoComplete="current-password"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'} text-sm`}></i>
                </button>
              </div>
            </div>

            {(localError || error) && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-300 px-4 py-3 rounded-xl text-sm flex items-center gap-2 animate-scale-in">
                <i className="fa-solid fa-circle-exclamation text-red-400 flex-shrink-0"></i>
                <span>{localError || error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 disabled:from-indigo-800 disabled:to-indigo-700 disabled:opacity-50 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/25 transition-all active:scale-[0.98] flex items-center justify-center gap-2 text-sm mt-2"
            >
              {isLoading ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin"></i>
                  <span>Memproses...</span>
                </>
              ) : (
                <>
                  <span>Masuk</span>
                  <i className="fa-solid fa-arrow-right"></i>
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-slate-600 text-[11px] mt-6 font-medium">
          &copy; {new Date().getFullYear()} IMDACS &middot; Internal Use Only
        </p>
      </div>
    </div>
  );
};

export default Login;
