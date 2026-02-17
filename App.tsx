
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { User, UserRole, Client, Activity } from './types';
import { useAuth } from './contexts/AuthContext';
import * as api from './services/apiService';
import { ImportResult } from './services/apiService';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import ClientManager from './components/ClientManager';
import DailyLog from './components/DailyLog';
import EndDayReport from './components/EndDayReport';
import ManagerView from './components/ManagerView';
import TeamView from './components/TeamView';
import QuickLog from './components/QuickLog';
import AuditorView from './components/AuditorView';
import logoImg from './public/logo.jpeg';

const APP_VERSION = '1.3.0';
const EOD_REMINDER_HOUR = 16;
const EOD_REMINDER_MINUTE = 30;

const App: React.FC = () => {
  const { user: currentUser, isLoading: authLoading, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [clients, setClients] = useState<Client[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showEodReminder, setShowEodReminder] = useState(true);
  const [showEodPopup, setShowEodPopup] = useState(false);
  const eodPopupShownRef = useRef(false);

  // Set default tab for AUDITOR role
  useEffect(() => {
    if (currentUser?.role === UserRole.AUDITOR) {
      setActiveTab('auditor');
    }
  }, [currentUser]);

  // ============ EOD 16:30 Popup Timer ============
  useEffect(() => {
    if (!currentUser || (currentUser.role !== UserRole.MARKETING && currentUser.role !== UserRole.SUPERVISOR)) return;

    const todayKey = `eod_popup_${new Date().toISOString().slice(0, 10)}`;

    // Check if already dismissed today
    if (localStorage.getItem(todayKey) === 'dismissed') {
      eodPopupShownRef.current = true;
      return;
    }

    const checkTime = () => {
      if (eodPopupShownRef.current) return;
      const now = new Date();
      const h = now.getHours();
      const m = now.getMinutes();
      if (h > EOD_REMINDER_HOUR || (h === EOD_REMINDER_HOUR && m >= EOD_REMINDER_MINUTE)) {
        eodPopupShownRef.current = true;
        setShowEodPopup(true);
      }
    };

    // Check immediately on mount
    checkTime();

    // Then check every 30 seconds
    const interval = setInterval(checkTime, 30_000);
    return () => clearInterval(interval);
  }, [currentUser]);

  const dismissEodPopup = () => {
    const todayKey = `eod_popup_${new Date().toISOString().slice(0, 10)}`;
    localStorage.setItem(todayKey, 'dismissed');
    setShowEodPopup(false);
  };

  const goToEodFromPopup = () => {
    dismissEodPopup();
    setActiveTab('report');
  };

  const fetchData = useCallback(async () => {
    if (!currentUser) return;
    const [clientsRes, activitiesRes, usersRes] = await Promise.allSettled([
      api.getClients(),
      api.getActivities(),
      api.getUsers()
    ]);
    if (clientsRes.status === 'fulfilled') setClients(clientsRes.value);
    else console.error('Failed to fetch clients:', clientsRes.reason);
    if (activitiesRes.status === 'fulfilled') setActivities(activitiesRes.value);
    else console.error('Failed to fetch activities:', activitiesRes.reason);
    if (usersRes.status === 'fulfilled') setUsers(usersRes.value);
    else console.error('Failed to fetch users:', usersRes.reason);
  }, [currentUser]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAddClient = async (clientData: Partial<Client>) => {
    try {
      const newClient = await api.addClient(clientData);
      setClients(prev => [newClient, ...prev]);
    } catch (err: any) {
      alert('Gagal menambah client: ' + err.message);
    }
  };

  const handleEditClient = async (clientData: Partial<Client> & { id: string }) => {
    try {
      const updatedClient = await api.updateClient(clientData);
      setClients(prev => prev.map(c => c.id === updatedClient.id ? updatedClient : c));
    } catch (err: any) {
      alert('Gagal mengupdate client: ' + err.message);
    }
  };

  const handleAddActivity = async (activityData: Partial<Activity>) => {
    try {
      const newActivity = await api.addActivity(activityData);
      setActivities(prev => [newActivity, ...prev]);
    } catch (err: any) {
      alert('Gagal menambah aktivitas: ' + err.message);
    }
  };

  const handleQuickAddClient = async (name: string, estimatedValue?: number): Promise<Client> => {
    const newClient = await api.quickAddClient(name, estimatedValue);
    setClients(prev => [newClient, ...prev]);
    return newClient;
  };

  const handleImportClients = async (clientsData: Partial<Client>[]): Promise<ImportResult> => {
    const result = await api.importClients(clientsData);
    if (result.imported.length > 0) {
      setClients(prev => [...result.imported, ...prev]);
    }
    return result;
  };

  const handleRefreshData = () => {
    fetchData();
  };

  // Loading screen
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 flex items-center justify-center">
        <div className="text-center animate-fade-in">
          <div className="relative mb-6">
            <img src={logoImg} alt="IMDACS" className="w-20 h-20 rounded-2xl mx-auto shadow-2xl shadow-indigo-500/30 object-contain" />
            <div className="absolute -inset-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl opacity-20 animate-ping"></div>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight mb-1">IMDACS</h1>
          <div className="flex items-center justify-center gap-1.5 mt-3">
            <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
            <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
            <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <Login />;
  }

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: 'fa-solid fa-grid-2', mobileIcon: 'fa-solid fa-grid-2', roles: [UserRole.MARKETING, UserRole.SUPERVISOR, UserRole.MANAGER] },
    { id: 'quicklog', label: 'Quick Log', icon: 'fa-solid fa-bolt', mobileIcon: 'fa-solid fa-bolt', roles: [UserRole.MARKETING, UserRole.SUPERVISOR] },
    { id: 'clients', label: 'Clients', icon: 'fa-solid fa-building', mobileIcon: 'fa-solid fa-building', roles: [UserRole.MARKETING, UserRole.SUPERVISOR, UserRole.MANAGER] },
    { id: 'activity', label: 'Daily Log', icon: 'fa-solid fa-list-check', mobileIcon: 'fa-solid fa-list-check', roles: [UserRole.MARKETING, UserRole.SUPERVISOR] },
    { id: 'report', label: 'EOD Report', icon: 'fa-solid fa-file-lines', mobileIcon: 'fa-solid fa-file-lines', roles: [UserRole.MARKETING, UserRole.SUPERVISOR] },
    { id: 'team', label: 'Team', icon: 'fa-solid fa-users-gear', mobileIcon: 'fa-solid fa-users-gear', roles: [UserRole.SUPERVISOR] },
    { id: 'oversight', label: 'Oversight', icon: 'fa-solid fa-chart-line', mobileIcon: 'fa-solid fa-chart-line', roles: [UserRole.MANAGER] },
    { id: 'auditor', label: 'Audit', icon: 'fa-solid fa-clipboard-check', mobileIcon: 'fa-solid fa-clipboard-check', roles: [UserRole.AUDITOR] },
  ];

  const filteredNav = navItems.filter(item => item.roles.includes(currentUser.role as UserRole));

  const handleNavClick = (id: string) => {
    setActiveTab(id);
    setSidebarOpen(false);
  };

  return (
    <div className="min-h-screen flex bg-slate-50/50">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden animate-fade-in"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Desktop fixed, Mobile slide-in */}
      <aside className={`
        fixed lg:sticky top-0 left-0 h-screen w-72 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950
        text-white flex flex-col z-50 shadow-2xl
        sidebar-transition
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Brand */}
        <div className="p-6 pb-2">
          <div className="flex items-center gap-3 mb-1">
            <img src={logoImg} alt="IMDACS" className="w-10 h-10 rounded-xl shadow-lg shadow-indigo-500/25 object-contain" />
            <div>
              <h1 className="text-xl font-black tracking-tight">IMDACS</h1>
              <p className="text-[9px] text-indigo-400 font-bold uppercase tracking-[0.2em]">Marketing System</p>
            </div>
          </div>
          <span className="mt-2 inline-flex items-center gap-1 text-[10px] text-slate-500 font-medium">
            <i className="fa-solid fa-code-branch text-[9px] text-indigo-500/40"></i>
            v{APP_VERSION}
          </span>
        </div>

        {/* Date info */}
        <div className="px-6 py-3">
          <div className="bg-white/5 rounded-xl px-4 py-2.5 border border-white/5">
            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Today</p>
            <p className="text-sm text-white font-semibold">
              {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-2 overflow-y-auto no-scrollbar">
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest px-3 mb-2">Menu</p>
          <div className="space-y-1">
            {filteredNav.map(item => (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
                  activeTab === item.id
                    ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-lg shadow-indigo-600/30'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                  activeTab === item.id ? 'bg-white/20' : 'bg-transparent group-hover:bg-white/5'
                }`}>
                  <i className={`${item.icon} text-sm`}></i>
                </div>
                <span className="font-semibold text-sm">{item.label}</span>
                {activeTab === item.id && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white"></div>
                )}
              </button>
            ))}
          </div>
        </nav>

        {/* User card */}
        <div className="p-4 mt-auto">
          <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
            <div className="flex items-center gap-3 mb-3">
              <div className="relative">
                <img src={currentUser.avatar} className="w-10 h-10 rounded-full border-2 border-indigo-500/50 object-cover" alt="Avatar" />
                <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-slate-900"></div>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold truncate">{currentUser.name}</p>
                <p className="text-[10px] text-indigo-400 font-semibold uppercase tracking-wider">{currentUser.role}</p>
              </div>
            </div>
            <button
              onClick={logout}
              className="w-full py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 border border-red-500/10"
            >
              <i className="fa-solid fa-arrow-right-from-bracket text-[10px]"></i>
              Logout
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-screen w-full lg:w-auto">
        {/* Top header for mobile */}
        <header className="sticky top-0 z-30 bg-white/80 glass-light border-b border-slate-100 px-4 py-3 lg:hidden">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setSidebarOpen(true)}
              className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors"
            >
              <i className="fa-solid fa-bars text-slate-600"></i>
            </button>
            <div className="flex items-center gap-2">
              <img src={logoImg} alt="IMDACS" className="w-8 h-8 rounded-lg object-contain" />
              <h1 className="text-lg font-black tracking-tight text-slate-800">IMDACS</h1>
              <span className="text-[9px] text-slate-400 font-semibold bg-slate-100 px-1.5 py-0.5 rounded-full ml-1">v{APP_VERSION}</span>
            </div>
            <div className="relative">
              <img src={currentUser.avatar} className="w-10 h-10 rounded-full border-2 border-indigo-100 object-cover" alt="Avatar" />
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 pb-24 lg:pb-8">
          <div className="max-w-7xl mx-auto animate-fade-in">
            {activeTab === 'dashboard' && <Dashboard user={currentUser} clients={clients} activities={activities} users={users} />}
            {activeTab === 'quicklog' && <QuickLog user={currentUser} clients={clients} activities={activities} onAddActivity={handleAddActivity} onQuickAddClient={handleQuickAddClient} onEditClient={handleEditClient} onRefresh={handleRefreshData} />}
            {activeTab === 'clients' && <ClientManager user={currentUser} clients={clients} users={users} activities={activities} onAddClient={handleAddClient} onEditClient={handleEditClient} onImportClients={handleImportClients} />}
            {activeTab === 'activity' && <DailyLog user={currentUser} clients={clients} activities={activities} onAddActivity={handleAddActivity} onRefresh={handleRefreshData} />}
            {activeTab === 'report' && <EndDayReport user={currentUser} clients={clients} activities={activities} onRefresh={handleRefreshData} onNavigate={setActiveTab} />}
            {activeTab === 'team' && <TeamView user={currentUser} users={users} clients={clients} activities={activities} />}
            {activeTab === 'oversight' && <ManagerView user={currentUser} users={users} clients={clients} activities={activities} />}
            {activeTab === 'auditor' && <AuditorView user={currentUser} clients={clients} users={users} onEditClient={handleEditClient} onRefresh={handleRefreshData} />}
          </div>
        </main>

        {/* Mobile Bottom Navigation */}
        <nav className="fixed bottom-0 left-0 right-0 bg-white/90 glass border-t border-slate-200/80 z-30 lg:hidden pb-safe">
          <div className="flex items-center justify-around px-2 py-1">
            {filteredNav.map(item => (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-all min-w-0 flex-1 ${
                  activeTab === item.id
                    ? 'text-indigo-600'
                    : 'text-slate-400'
                }`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                  activeTab === item.id
                    ? 'bg-indigo-50 scale-110'
                    : ''
                }`}>
                  <i className={`${item.mobileIcon} text-base`}></i>
                </div>
                <span className={`text-[10px] font-bold truncate ${activeTab === item.id ? 'text-indigo-600' : 'text-slate-400'}`}>
                  {item.label}
                </span>
                {activeTab === item.id && (
                  <div className="w-4 h-0.5 bg-indigo-600 rounded-full"></div>
                )}
              </button>
            ))}
          </div>
        </nav>
      </div>

      {/* EOD Floating Reminder (static, always visible until dismissed) */}
      {(currentUser.role === UserRole.MARKETING || currentUser.role === UserRole.SUPERVISOR) && activeTab !== 'report' && showEodReminder && (
        <div className="fixed bottom-20 lg:bottom-6 right-4 lg:right-6 bg-white shadow-2xl shadow-slate-900/10 rounded-2xl p-4 border border-slate-100 flex items-start gap-3 z-40 max-w-xs animate-slide-up">
          <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-orange-500 text-white rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-amber-500/25">
            <i className="fa-solid fa-bell text-sm"></i>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-slate-800">EOD Report Reminder</p>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">Jangan lupa submit laporan harian Anda sebelum jam 23:59.</p>
            <button
              onClick={() => { setActiveTab('report'); setShowEodReminder(false); }}
              className="mt-2 text-[11px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
            >
              Submit Sekarang <i className="fa-solid fa-arrow-right text-[9px]"></i>
            </button>
          </div>
          <button
            onClick={() => setShowEodReminder(false)}
            className="text-slate-300 hover:text-slate-500 p-0.5 flex-shrink-0"
          >
            <i className="fa-solid fa-xmark text-xs"></i>
          </button>
        </div>
      )}

      {/* EOD 16:30 Popup Notification */}
      {showEodPopup && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={dismissEodPopup} />

          {/* Popup Card */}
          <div className="relative bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden animate-slide-up">
            {/* Gradient Header */}
            <div className="bg-gradient-to-br from-amber-400 via-orange-500 to-red-500 px-6 pt-8 pb-12 text-center relative overflow-hidden">
              {/* Background decorations */}
              <div className="absolute top-0 left-0 w-full h-full opacity-20">
                <div className="absolute -top-10 -right-10 w-40 h-40 bg-white rounded-full"></div>
                <div className="absolute -bottom-16 -left-10 w-48 h-48 bg-white rounded-full"></div>
              </div>

              {/* Bell icon with animation */}
              <div className="relative inline-flex items-center justify-center mb-4">
                <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm border border-white/30">
                  <i className="fa-solid fa-bell text-white text-3xl animate-[ring_1s_ease-in-out_infinite]"></i>
                </div>
                {/* Pulse rings */}
                <div className="absolute inset-0 w-20 h-20 bg-white/10 rounded-full animate-ping"></div>
              </div>

              <h2 className="text-xl font-black text-white relative">Waktunya EOD Report!</h2>
              <p className="text-sm text-white/80 mt-1 font-medium relative">
                {new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
              </p>
            </div>

            {/* Content */}
            <div className="px-6 pt-6 pb-4 -mt-6 relative">
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-5">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                    <i className="fa-solid fa-clock text-amber-600 text-sm"></i>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-amber-900">Sudah jam 16:30!</p>
                    <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                      Segera isi dan submit laporan harian (EOD Report) Anda sebelum jam 23:59 ya.
                    </p>
                  </div>
                </div>
              </div>

              {/* CTA Button */}
              <button
                onClick={goToEodFromPopup}
                className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-700 hover:to-indigo-600 text-white rounded-2xl font-bold text-sm transition-all duration-200 shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 flex items-center justify-center gap-2 active:scale-[0.98]"
              >
                <i className="fa-solid fa-file-lines"></i>
                Isi EOD Report Sekarang
              </button>

              {/* Dismiss */}
              <button
                onClick={dismissEodPopup}
                className="w-full py-2.5 text-slate-400 hover:text-slate-600 text-xs font-semibold mt-2 transition-colors"
              >
                Nanti saja, ingatkan lagi besok
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
