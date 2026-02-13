
import React, { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, LineChart, Line, AreaChart, Area } from 'recharts';
import { User, Client, Activity, EODReport, ClientStatus, ActivityType, UserRole } from '../types';
import { STATUS_COLORS } from '../constants';
import * as api from '../services/apiService';
import { exportExcel, exportPDF } from '../services/exportReport';

interface DashboardProps {
  user: User;
  clients: Client[];
  activities: Activity[];
  users?: User[];
}

const COLORS = ['#3b82f6', '#f59e0b', '#8b5cf6', '#6366f1', '#f97316', '#ec4899', '#22c55e', '#ef4444', '#64748b'];
const MARKETING_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#22c55e'];
const LINE_COLORS = ['#6366f1', '#8b5cf6', '#ec4899'];

const Dashboard: React.FC<DashboardProps> = ({ user, clients, activities, users = [] }) => {
  const [stats, setStats] = useState<api.DashboardStats | null>(null);
  const isManager = user.role === UserRole.MANAGER;
  const marketingUsers = users.filter(u => u.role === UserRole.MARKETING || u.role === UserRole.SUPERVISOR);

  // Manager sees ALL, Marketing sees only theirs
  const myClients = isManager ? clients : clients.filter(c => c.marketingId === user.id);
  const today = new Date().toISOString().split('T')[0];
  const allMyActivities = isManager
    ? activities
    : activities.filter(a => a.marketingId === user.id);
  const todayActivities = allMyActivities.filter(a => a.date === today);

  // Analytics state (Manager only)
  const [trendPeriod, setTrendPeriod] = useState<'week' | 'month'>('week');
  const [dailyTrend, setDailyTrend] = useState<{ data: api.DailyActivityData[]; marketing: api.MarketingMeta[] } | null>(null);
  const [monthlyTrend, setMonthlyTrend] = useState<{ data: api.MonthlyActivityData[]; marketing: api.MarketingMeta[] } | null>(null);
  const [eodCompliance, setEodCompliance] = useState<{ data: api.EODComplianceData[]; totalMarketing: number } | null>(null);

  // Reports state (for export)
  const [reports, setReports] = useState<EODReport[]>([]);
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null);

  // Project Tracking state (Manager only)
  const [projectSearch, setProjectSearch] = useState('');
  const [projectFilterMarketing, setProjectFilterMarketing] = useState('all');
  const [projectFilterStatus, setProjectFilterStatus] = useState('all');

  useEffect(() => {
    api.getDashboardStats().then(setStats).catch(console.error);
  }, []);

  // Fetch reports for export (Manager only)
  useEffect(() => {
    if (!isManager) return;
    api.getReports().then(setReports).catch(console.error);
  }, [isManager]);

  // Fetch analytics when manager
  useEffect(() => {
    if (!isManager) return;
    api.getDailyActivities(trendPeriod).then(setDailyTrend).catch(console.error);
    api.getEODCompliance(trendPeriod).then(setEodCompliance).catch(console.error);
  }, [isManager, trendPeriod]);

  useEffect(() => {
    if (!isManager) return;
    api.getMonthlyActivities().then(setMonthlyTrend).catch(console.error);
  }, [isManager]);

  // === Marketing: weekly activity history (last 7 days from local data) ===
  const myWeeklyActivities = (() => {
    const days: { date: string; label: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      days.push({
        date: dateStr,
        label: d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric' }),
        count: allMyActivities.filter(a => a.date === dateStr).length,
      });
    }
    return days;
  })();

  const totalWeekActivities = myWeeklyActivities.reduce((sum, d) => sum + d.count, 0);

  const statusData = Object.values(ClientStatus).map(status => ({
    name: status.replace('_', ' '),
    value: myClients.filter(c => c.status === status).length
  })).filter(d => d.value > 0);

  const activityBreakdown = Object.values(ActivityType).map(type => ({
    name: type.replace('_', ' '),
    value: todayActivities.filter(a => a.type === type).length
  }));

  const dealsCount = stats?.dealsThisMonth ?? myClients.filter(c => c.status === ClientStatus.DEAL).length;
  const eodStatus = stats?.eodStatus ?? 'Loading...';

  // === Pipeline value calculations ===
  const pipelineValue = myClients
    .filter(c => c.status !== ClientStatus.DEAL && c.status !== ClientStatus.LOST)
    .reduce((sum, c) => sum + (c.estimatedValue || 0), 0);
  const dealValue = myClients
    .filter(c => c.status === ClientStatus.DEAL)
    .reduce((sum, c) => sum + (c.estimatedValue || 0), 0);

  // === Conversion funnel (Marketing) ===
  const funnelStages = [
    { key: 'NEW', label: 'New', color: '#3b82f6', bgClass: 'from-blue-500 to-blue-400' },
    { key: 'FOLLOW_UP', label: 'Follow Up', color: '#f59e0b', bgClass: 'from-yellow-500 to-amber-400' },
    { key: 'VISIT', label: 'Visit', color: '#a855f7', bgClass: 'from-purple-500 to-purple-400' },
    { key: 'PRESENTASI', label: 'Presentasi', color: '#8b5cf6', bgClass: 'from-violet-500 to-purple-400' },
    { key: 'PENAWARAN', label: 'Penawaran', color: '#f97316', bgClass: 'from-orange-500 to-orange-400' },
    { key: 'NEGOSIASI', label: 'Negosiasi', color: '#ec4899', bgClass: 'from-pink-500 to-pink-400' },
    { key: 'DEAL', label: 'Deal', color: '#22c55e', bgClass: 'from-green-500 to-emerald-400' },
  ];
  const funnelData = funnelStages.map(s => ({
    ...s,
    count: myClients.filter(c => c.status === s.key).length,
    value: myClients.filter(c => c.status === s.key).reduce((sum, c) => sum + (c.estimatedValue || 0), 0),
  }));
  const maxFunnel = Math.max(...funnelData.map(f => f.count), 1);

  // === KPI Targets (Marketing) ===
  const KPI_TARGETS = { dailyActivities: 5, weeklyActivities: 25, monthlyDeals: 3 };
  const dailyProgress = Math.min((todayActivities.length / KPI_TARGETS.dailyActivities) * 100, 100);
  const weeklyProgress = Math.min((totalWeekActivities / KPI_TARGETS.weeklyActivities) * 100, 100);
  const dealProgress = Math.min((dealsCount / KPI_TARGETS.monthlyDeals) * 100, 100);

  const formatRupiah = (value: number) => {
    return value.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // === Export handlers (Manager) ===
  const handleExport = async (type: 'excel' | 'pdf') => {
    setExporting(type);
    try {
      const exportData = { user, users, clients, activities, reports };
      if (type === 'excel') {
        exportExcel(exportData);
      } else {
        exportPDF(exportData);
      }
    } catch (err) {
      console.error('Export error:', err);
      alert('Gagal export report. Silakan coba lagi.');
    } finally {
      setTimeout(() => setExporting(null), 1500);
    }
  };

  const recentClients = [...myClients]
    .sort((a, b) => new Date(b.lastUpdate || b.createdAt).getTime() - new Date(a.lastUpdate || a.createdAt).getTime())
    .slice(0, 6);

  const pipelineCounts = [
    { label: 'New', count: myClients.filter(c => c.status === ClientStatus.NEW).length, lightColor: 'bg-blue-50 text-blue-600' },
    { label: 'Follow Up', count: myClients.filter(c => c.status === ClientStatus.FOLLOW_UP).length, lightColor: 'bg-yellow-50 text-yellow-600' },
    { label: 'Visit', count: myClients.filter(c => c.status === ClientStatus.VISIT).length, lightColor: 'bg-purple-50 text-purple-600' },
    { label: 'Presentasi', count: myClients.filter(c => c.status === ClientStatus.PRESENTASI).length, lightColor: 'bg-indigo-50 text-indigo-600' },
    { label: 'Penawaran', count: myClients.filter(c => c.status === ClientStatus.PENAWARAN).length, lightColor: 'bg-orange-50 text-orange-600' },
    { label: 'Negosiasi', count: myClients.filter(c => c.status === ClientStatus.NEGOSIASI).length, lightColor: 'bg-pink-50 text-pink-600' },
    { label: 'Deal', count: myClients.filter(c => c.status === ClientStatus.DEAL).length, lightColor: 'bg-green-50 text-green-600' },
  ];

  // Manager: per-marketing current snapshot
  const perMarketingClients = marketingUsers.map(m => ({
    name: m.name.split(' ')[0],
    fullName: m.name,
    clients: clients.filter(c => c.marketingId === m.id).length,
  }));

  const perMarketingPipeline = marketingUsers.map(m => {
    const mc = clients.filter(c => c.marketingId === m.id);
    return {
      name: m.name.split(' ')[0],
      fullName: m.name,
      NEW: mc.filter(c => c.status === ClientStatus.NEW).length,
      FOLLOW_UP: mc.filter(c => c.status === ClientStatus.FOLLOW_UP).length,
      PRESENTASI: mc.filter(c => c.status === ClientStatus.PRESENTASI).length,
      PENAWARAN: mc.filter(c => c.status === ClientStatus.PENAWARAN).length,
      NEGOSIASI: mc.filter(c => c.status === ClientStatus.NEGOSIASI).length,
      DEAL: mc.filter(c => c.status === ClientStatus.DEAL).length,
    };
  });

  return (
    <div className="space-y-6">
      {/* Welcome header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">
            {isManager ? (
              <>Welcome, <span className="gradient-text">{user.name.split(',')[0]}</span></>
            ) : (
              <>Welcome back, <span className="gradient-text">{user.name}</span></>
            )}
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 ${
            isManager ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' :
            eodStatus === 'MISSING' ? 'bg-red-50 text-red-600 border border-red-100' :
            eodStatus === 'SUBMITTED' || eodStatus === 'APPROVED' ? 'bg-green-50 text-green-600 border border-green-100' :
            'bg-amber-50 text-amber-600 border border-amber-100'
          }`}>
            <div className={`w-1.5 h-1.5 rounded-full ${
              isManager ? 'bg-indigo-500' :
              eodStatus === 'MISSING' ? 'bg-red-500' :
              eodStatus === 'SUBMITTED' || eodStatus === 'APPROVED' ? 'bg-green-500' : 'bg-amber-500'
            }`}></div>
            {isManager ? `EOD: ${eodStatus}` : `EOD: ${eodStatus === 'MISSING' ? 'Belum Submit' : eodStatus}`}
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <div className="bg-white p-4 lg:p-5 rounded-2xl shadow-sm border border-slate-100 card-hover">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
              <i className="fa-solid fa-building text-lg"></i>
            </div>
            <span className="text-[10px] font-bold text-slate-400 uppercase">Clients</span>
          </div>
          <p className="text-2xl lg:text-3xl font-bold text-slate-800">{stats?.totalClients ?? myClients.length}</p>
          <p className="text-xs text-slate-400 mt-1">{isManager ? 'All team portfolio' : 'Total portfolio'}</p>
        </div>

        <div className="bg-white p-4 lg:p-5 rounded-2xl shadow-sm border border-slate-100 card-hover">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center">
              <i className="fa-solid fa-bolt text-lg"></i>
            </div>
            <span className="text-[10px] font-bold text-slate-400 uppercase">Today</span>
          </div>
          <p className="text-2xl lg:text-3xl font-bold text-slate-800">{stats?.todayActivities ?? todayActivities.length}</p>
          <p className="text-xs text-slate-400 mt-1">{isManager ? 'Team activities today' : 'Activities logged'}</p>
        </div>

        <div className="bg-white p-4 lg:p-5 rounded-2xl shadow-sm border border-slate-100 card-hover">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 bg-green-50 text-green-600 rounded-xl flex items-center justify-center">
              <i className="fa-solid fa-handshake text-lg"></i>
            </div>
            <span className="text-[10px] font-bold text-slate-400 uppercase">Deals</span>
          </div>
          <p className="text-2xl lg:text-3xl font-bold text-slate-800">{dealsCount}</p>
          <p className="text-xs text-slate-400 mt-1">This month</p>
        </div>

        <div className="bg-gradient-to-br from-indigo-600 to-purple-600 p-4 lg:p-5 rounded-2xl shadow-lg shadow-indigo-500/20 card-hover text-white">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <i className={`fa-solid ${isManager ? 'fa-users' : 'fa-trophy'} text-lg`}></i>
            </div>
            <span className="text-[10px] font-bold text-indigo-200 uppercase">{isManager ? 'Team' : 'Rate'}</span>
          </div>
          <p className="text-2xl lg:text-3xl font-bold">
            {isManager
              ? marketingUsers.length
              : myClients.length > 0 ? Math.round((myClients.filter(c => c.status === ClientStatus.DEAL).length / myClients.length) * 100) : 0
            }{!isManager && '%'}
          </p>
          <p className="text-xs text-indigo-200 mt-1">{isManager ? 'Marketing members' : 'Conversion rate'}</p>
        </div>
      </div>

      {/* Pipeline Funnel */}
      <div className="bg-white p-4 lg:p-6 rounded-2xl shadow-sm border border-slate-100">
        <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
          <i className="fa-solid fa-filter text-indigo-500"></i>
          {isManager ? 'Team Sales Pipeline' : 'Sales Pipeline'}
        </h3>
        <div className="grid grid-cols-4 lg:grid-cols-7 gap-2 lg:gap-3">
          {pipelineCounts.map((item) => (
            <div key={item.label} className="text-center">
              <div className={`${item.lightColor} rounded-xl p-3 lg:p-4 mb-2`}>
                <p className="text-xl lg:text-2xl font-bold">{item.count}</p>
              </div>
              <p className="text-[10px] lg:text-xs font-semibold text-slate-500">{item.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ================================================= */}
      {/* ============ MARKETING DASHBOARD ================ */}
      {/* ================================================= */}
      {!isManager && (
        <>
          {/* Pipeline Value Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:gap-4">
            <div className="bg-gradient-to-br from-emerald-600 to-green-500 p-5 rounded-2xl shadow-lg shadow-green-500/20 text-white">
              <div className="flex items-center justify-between mb-2">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <i className="fa-solid fa-coins text-lg"></i>
                </div>
                <span className="text-[10px] font-bold text-green-200 uppercase">Pipeline</span>
              </div>
              <p className="text-2xl lg:text-3xl font-bold">Rp {formatRupiah(pipelineValue)}</p>
              <p className="text-xs text-green-200 mt-1">Estimasi potensi revenue (active)</p>
            </div>
            <div className="bg-gradient-to-br from-amber-500 to-orange-500 p-5 rounded-2xl shadow-lg shadow-amber-500/20 text-white">
              <div className="flex items-center justify-between mb-2">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <i className="fa-solid fa-trophy text-lg"></i>
                </div>
                <span className="text-[10px] font-bold text-amber-200 uppercase">Closed</span>
              </div>
              <p className="text-2xl lg:text-3xl font-bold">Rp {formatRupiah(dealValue)}</p>
              <p className="text-xs text-amber-200 mt-1">Total nilai deal berhasil</p>
            </div>
          </div>

          {/* KPI Target Progress */}
          <div className="bg-white p-4 lg:p-6 rounded-2xl shadow-sm border border-slate-100">
            <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
              <i className="fa-solid fa-bullseye text-red-500"></i>
              Target & KPI
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 bg-slate-50 rounded-xl">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Aktivitas Hari Ini</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${dailyProgress >= 100 ? 'bg-green-100 text-green-700' : dailyProgress >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                    {todayActivities.length}/{KPI_TARGETS.dailyActivities}
                  </span>
                </div>
                <div className="h-2.5 w-full bg-slate-200 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-700 ${dailyProgress >= 100 ? 'bg-green-500' : dailyProgress >= 60 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${dailyProgress}%` }}></div>
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5">{dailyProgress >= 100 ? 'Target tercapai!' : `Butuh ${KPI_TARGETS.dailyActivities - todayActivities.length} lagi`}</p>
              </div>
              <div className="p-4 bg-slate-50 rounded-xl">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Aktivitas Minggu Ini</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${weeklyProgress >= 100 ? 'bg-green-100 text-green-700' : weeklyProgress >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                    {totalWeekActivities}/{KPI_TARGETS.weeklyActivities}
                  </span>
                </div>
                <div className="h-2.5 w-full bg-slate-200 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-700 ${weeklyProgress >= 100 ? 'bg-green-500' : weeklyProgress >= 60 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${weeklyProgress}%` }}></div>
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5">{weeklyProgress >= 100 ? 'Target tercapai!' : `Butuh ${KPI_TARGETS.weeklyActivities - totalWeekActivities} lagi`}</p>
              </div>
              <div className="p-4 bg-slate-50 rounded-xl">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Deal Bulan Ini</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${dealProgress >= 100 ? 'bg-green-100 text-green-700' : dealProgress >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                    {dealsCount}/{KPI_TARGETS.monthlyDeals}
                  </span>
                </div>
                <div className="h-2.5 w-full bg-slate-200 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-700 ${dealProgress >= 100 ? 'bg-green-500' : dealProgress >= 60 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${dealProgress}%` }}></div>
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5">{dealProgress >= 100 ? 'Target tercapai!' : `Butuh ${KPI_TARGETS.monthlyDeals - dealsCount} lagi`}</p>
              </div>
            </div>
          </div>

          {/* Conversion Funnel */}
          <div className="bg-white p-4 lg:p-6 rounded-2xl shadow-sm border border-slate-100">
            <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
              <i className="fa-solid fa-filter text-purple-500"></i>
              Conversion Funnel
            </h3>
            <div className="space-y-2.5">
              {funnelData.map((stage, idx) => (
                <div key={stage.key} className="flex items-center gap-3">
                  <div className="w-20 lg:w-24 text-right">
                    <p className="text-[10px] font-bold text-slate-500">{stage.label}</p>
                  </div>
                  <div className="flex-1 relative">
                    <div className="h-8 bg-slate-100 rounded-lg overflow-hidden">
                      <div
                        className={`h-full bg-gradient-to-r ${stage.bgClass} rounded-lg transition-all duration-700 flex items-center justify-end pr-2`}
                        style={{ width: `${Math.max((stage.count / maxFunnel) * 100, stage.count > 0 ? 15 : 0)}%` }}
                      >
                        {stage.count > 0 && <span className="text-[10px] font-bold text-white">{stage.count}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="w-20 lg:w-28 text-right">
                    <p className="text-[10px] font-bold text-slate-600">
                      {stage.value > 0 ? `Rp ${formatRupiah(stage.value)}` : '-'}
                    </p>
                  </div>
                  {idx > 0 && funnelData[idx - 1].count > 0 && (
                    <div className="w-12 text-right">
                      <span className={`text-[9px] font-bold ${stage.count > 0 ? 'text-green-600' : 'text-slate-300'}`}>
                        {Math.round((stage.count / funnelData[idx - 1].count) * 100)}%
                      </span>
                    </div>
                  )}
                  {(idx === 0 || funnelData[idx - 1].count === 0) && (
                    <div className="w-12"></div>
                  )}
                </div>
              ))}
            </div>
            {myClients.length > 0 && (
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                <p className="text-[10px] text-slate-400">Total conversion rate</p>
                <p className="text-sm font-bold text-green-600">
                  {myClients.length > 0 ? Math.round(((funnelData.find(f => f.key === 'DEAL')?.count ?? 0) / myClients.length) * 100) : 0}%
                </p>
              </div>
            )}
          </div>

          {/* Weekly Activity Trend (Marketing) */}
          <div className="bg-white p-4 lg:p-6 rounded-2xl shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <i className="fa-solid fa-chart-line text-indigo-500"></i>
                Aktivitas 7 Hari Terakhir
              </h3>
              <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg">
                {totalWeekActivities} total
              </span>
            </div>
            <div className="h-56 lg:h-64">
              {totalWeekActivities > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={myWeeklyActivities}>
                    <defs>
                      <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15}/>
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fontWeight: 600 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                    <Tooltip
                      formatter={(value: number) => [`${value} aktivitas`, 'Jumlah']}
                      contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                    />
                    <Area type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2.5} fill="url(#colorCount)" dot={{ r: 4, fill: '#6366f1' }} activeDot={{ r: 6 }} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-300">
                  <i className="fa-solid fa-chart-line text-4xl mb-3"></i>
                  <p className="text-sm font-medium">Belum ada data aktivitas minggu ini</p>
                </div>
              )}
            </div>
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
            <div className="bg-white p-4 lg:p-6 rounded-2xl shadow-sm border border-slate-100">
              <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                <i className="fa-solid fa-chart-pie text-indigo-500"></i>
                Client Distribution
              </h3>
              <div className="h-56 lg:h-64">
                {statusData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={statusData} cx="50%" cy="50%" labelLine={false} innerRadius={40} outerRadius={80} fill="#8884d8" dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                        {statusData.map((_entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-300">
                    <i className="fa-solid fa-chart-pie text-4xl mb-3"></i>
                    <p className="text-sm font-medium">Belum ada data client</p>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white p-4 lg:p-6 rounded-2xl shadow-sm border border-slate-100">
              <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                <i className="fa-solid fa-chart-bar text-indigo-500"></i>
                Activity Breakdown Hari Ini
              </h3>
              <div className="h-56 lg:h-64">
                {todayActivities.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={activityBreakdown} barCategoryGap="20%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Bar dataKey="value" fill="#6366f1" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-300">
                    <i className="fa-solid fa-chart-bar text-4xl mb-3"></i>
                    <p className="text-sm font-medium">Belum ada aktivitas hari ini</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ================================================= */}
      {/* ============ MANAGER DASHBOARD ================== */}
      {/* ================================================= */}
      {isManager && marketingUsers.length > 0 && (
        <>
          {/* Export Report Buttons */}
          <div className="bg-white p-4 lg:p-5 rounded-2xl shadow-sm border border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <i className="fa-solid fa-download text-indigo-500"></i>
                  Download Report
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Export data lengkap tim marketing</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleExport('excel')}
                  disabled={exporting !== null}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-[0.97] ${
                    exporting === 'excel'
                      ? 'bg-green-100 text-green-600 cursor-wait'
                      : 'bg-gradient-to-r from-green-600 to-emerald-500 text-white hover:from-green-500 hover:to-emerald-400 shadow-lg shadow-green-500/20'
                  }`}
                >
                  {exporting === 'excel' ? (
                    <><i className="fa-solid fa-spinner fa-spin"></i> Exporting...</>
                  ) : (
                    <><i className="fa-solid fa-file-excel"></i> Excel (.xlsx)</>
                  )}
                </button>
                <button
                  onClick={() => handleExport('pdf')}
                  disabled={exporting !== null}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-[0.97] ${
                    exporting === 'pdf'
                      ? 'bg-red-100 text-red-600 cursor-wait'
                      : 'bg-gradient-to-r from-red-600 to-rose-500 text-white hover:from-red-500 hover:to-rose-400 shadow-lg shadow-red-500/20'
                  }`}
                >
                  {exporting === 'pdf' ? (
                    <><i className="fa-solid fa-spinner fa-spin"></i> Exporting...</>
                  ) : (
                    <><i className="fa-solid fa-file-pdf"></i> PDF Report</>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Period Toggle */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Periode:</span>
            <div className="flex bg-white rounded-xl border border-slate-200 p-0.5">
              {(['week', 'month'] as const).map(p => (
                <button key={p} onClick={() => setTrendPeriod(p)}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                    trendPeriod === p ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}>
                  {p === 'week' ? '7 Hari' : 'Bulan Ini'}
                </button>
              ))}
            </div>
          </div>

          {/* Total Pipeline & Deal Value Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 lg:gap-4">
            <div className="bg-gradient-to-br from-emerald-600 to-green-500 p-5 rounded-2xl shadow-lg shadow-green-500/20 text-white">
              <div className="flex items-center justify-between mb-2">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <i className="fa-solid fa-coins text-lg"></i>
                </div>
                <span className="text-[10px] font-bold text-green-200 uppercase">Pipeline</span>
              </div>
              <p className="text-2xl font-bold">Rp {formatRupiah(pipelineValue)}</p>
              <p className="text-xs text-green-200 mt-1">Total estimasi pipeline aktif</p>
            </div>
            <div className="bg-gradient-to-br from-amber-500 to-orange-500 p-5 rounded-2xl shadow-lg shadow-amber-500/20 text-white">
              <div className="flex items-center justify-between mb-2">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <i className="fa-solid fa-trophy text-lg"></i>
                </div>
                <span className="text-[10px] font-bold text-amber-200 uppercase">Closed Deal</span>
              </div>
              <p className="text-2xl font-bold">Rp {formatRupiah(dealValue)}</p>
              <p className="text-xs text-amber-200 mt-1">Total nilai deal berhasil</p>
            </div>
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                  <i className="fa-solid fa-sack-dollar text-lg"></i>
                </div>
                <span className="text-[10px] font-bold text-slate-400 uppercase">Total Value</span>
              </div>
              <p className="text-2xl font-bold text-slate-800">Rp {formatRupiah(pipelineValue + dealValue)}</p>
              <p className="text-xs text-slate-400 mt-1">Pipeline + Deal combined</p>
            </div>
          </div>

          {/* Daily Activity Trend Line Chart (per marketing) */}
          <div className="bg-white p-4 lg:p-6 rounded-2xl shadow-sm border border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <i className="fa-solid fa-chart-line text-indigo-500"></i>
                  Tren Aktivitas Harian Per Marketing
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {trendPeriod === 'week' ? 'Data 7 hari terakhir' : 'Data bulan ini'}
                </p>
              </div>
            </div>
            <div className="h-72 lg:h-80">
              {dailyTrend && dailyTrend.data.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dailyTrend.data}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fontWeight: 600 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                    <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 600 }} />
                    {dailyTrend.marketing.map((m, idx) => (
                      <Line
                        key={m.id}
                        type="monotone"
                        dataKey={m.id}
                        name={m.shortName}
                        stroke={LINE_COLORS[idx % LINE_COLORS.length]}
                        strokeWidth={2.5}
                        dot={{ r: 3, fill: LINE_COLORS[idx % LINE_COLORS.length] }}
                        activeDot={{ r: 5 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-300">
                  <i className="fa-solid fa-chart-line text-4xl mb-3"></i>
                  <p className="text-sm font-medium">Belum ada data aktivitas</p>
                </div>
              )}
            </div>
          </div>

          {/* EOD Compliance Trend + Monthly Trend */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
            {/* EOD Compliance Daily */}
            <div className="bg-white p-4 lg:p-6 rounded-2xl shadow-sm border border-slate-100">
              <h3 className="text-sm font-bold text-slate-800 mb-1 flex items-center gap-2">
                <i className="fa-solid fa-clipboard-check text-green-500"></i>
                EOD Report Compliance
              </h3>
              <p className="text-xs text-slate-400 mb-4">Kepatuhan submit laporan harian</p>
              <div className="h-56 lg:h-64">
                {eodCompliance && eodCompliance.data.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={eodCompliance.data} barCategoryGap="15%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="label" tick={{ fontSize: 9, fontWeight: 600 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10 }} domain={[0, eodCompliance.totalMarketing]} />
                      <Tooltip
                        formatter={(value: number, name: string) => [value, name === 'submitted' ? 'Sudah Submit' : 'Belum Submit']}
                        contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                      />
                      <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 600 }} />
                      <Bar dataKey="submitted" name="Sudah Submit" stackId="a" fill="#22c55e" />
                      <Bar dataKey="missing" name="Belum Submit" stackId="a" fill="#fca5a5" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-300">
                    <i className="fa-solid fa-clipboard-check text-4xl mb-3"></i>
                    <p className="text-sm font-medium">Belum ada data</p>
                  </div>
                )}
              </div>
            </div>

            {/* Monthly Activity Trend */}
            <div className="bg-white p-4 lg:p-6 rounded-2xl shadow-sm border border-slate-100">
              <h3 className="text-sm font-bold text-slate-800 mb-1 flex items-center gap-2">
                <i className="fa-solid fa-calendar-days text-purple-500"></i>
                Tren Aktivitas Bulanan
              </h3>
              <p className="text-xs text-slate-400 mb-4">6 bulan terakhir per marketing</p>
              <div className="h-56 lg:h-64">
                {monthlyTrend && monthlyTrend.data.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyTrend.data} barCategoryGap="20%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fontWeight: 600 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                      <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 600 }} />
                      {monthlyTrend.marketing.map((m, idx) => (
                        <Bar key={m.id} dataKey={m.id} name={m.shortName} fill={MARKETING_COLORS[idx % MARKETING_COLORS.length]} radius={idx === monthlyTrend.marketing.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0]} stackId="monthly" />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-300">
                    <i className="fa-solid fa-calendar-days text-4xl mb-3"></i>
                    <p className="text-sm font-medium">Belum ada data bulanan</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Per-Marketing Overview + Pipeline */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
            <div className="bg-white p-4 lg:p-6 rounded-2xl shadow-sm border border-slate-100">
              <h3 className="text-sm font-bold text-slate-800 mb-1 flex items-center gap-2">
                <i className="fa-solid fa-chart-bar text-indigo-500"></i>
                Total Client Per Marketing
              </h3>
              <p className="text-xs text-slate-400 mb-4">Jumlah client yang di-handle</p>
              <div className="h-56 lg:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={perMarketingClients} barCategoryGap="25%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fontWeight: 600 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                    <Tooltip
                      formatter={(value: number) => [`${value} clients`, 'Total']}
                      labelFormatter={(label: string) => perMarketingClients.find(m => m.name === label)?.fullName || label}
                      contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                    />
                    <Bar dataKey="clients" radius={[8, 8, 0, 0]}>
                      {perMarketingClients.map((_e, i) => (
                        <Cell key={`c-${i}`} fill={MARKETING_COLORS[i % MARKETING_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-4 lg:p-6 rounded-2xl shadow-sm border border-slate-100">
              <h3 className="text-sm font-bold text-slate-800 mb-1 flex items-center gap-2">
                <i className="fa-solid fa-layer-group text-purple-500"></i>
                Pipeline Breakdown
              </h3>
              <p className="text-xs text-slate-400 mb-4">Status client per orang</p>
              <div className="h-56 lg:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={perMarketingPipeline} barCategoryGap="20%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fontWeight: 600 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                    <Tooltip
                      labelFormatter={(label: string) => perMarketingPipeline.find(m => m.name === label)?.fullName || label}
                      contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                    />
                    <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 600 }} />
                    <Bar dataKey="NEW" name="New" stackId="a" fill="#3b82f6" />
                    <Bar dataKey="FOLLOW_UP" name="Follow Up" stackId="a" fill="#f59e0b" />
                    <Bar dataKey="PRESENTASI" name="Presentasi" stackId="a" fill="#8b5cf6" />
                    <Bar dataKey="PENAWARAN" name="Penawaran" stackId="a" fill="#f97316" />
                    <Bar dataKey="NEGOSIASI" name="Negosiasi" stackId="a" fill="#ec4899" />
                    <Bar dataKey="DEAL" name="Deal" stackId="a" fill="#22c55e" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Marketing Team Cards */}
          <div className="bg-white p-4 lg:p-6 rounded-2xl shadow-sm border border-slate-100">
            <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
              <i className="fa-solid fa-users text-indigo-500"></i>
              Marketing Team Overview
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {marketingUsers.map((m) => {
                const mc = clients.filter(c => c.marketingId === m.id);
                const mAct = activities.filter(a => a.marketingId === m.id && a.date === today);
                const mDeals = mc.filter(c => c.status === ClientStatus.DEAL).length;
                const convRate = mc.length > 0 ? Math.round((mDeals / mc.length) * 100) : 0;
                const mPipelineVal = mc.filter(c => c.status !== ClientStatus.DEAL && c.status !== ClientStatus.LOST).reduce((s, c) => s + (c.estimatedValue || 0), 0);
                const mDealVal = mc.filter(c => c.status === ClientStatus.DEAL).reduce((s, c) => s + (c.estimatedValue || 0), 0);
                // Week total from local data
                const weekActs = activities.filter(a => {
                  if (a.marketingId !== m.id) return false;
                  const diff = (new Date(today).getTime() - new Date(a.date).getTime()) / (1000*60*60*24);
                  return diff >= 0 && diff < 7;
                }).length;
                return (
                  <div key={m.id} className="p-4 rounded-2xl border border-slate-100 hover:border-indigo-200 hover:shadow-md transition-all">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="relative">
                        <img src={m.avatar} className="w-12 h-12 rounded-full object-cover border-2 border-slate-100" alt={m.name} />
                        <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white"></div>
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-slate-800 truncate">{m.name}</p>
                        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Marketing</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      <div className="text-center p-2 rounded-xl bg-blue-50">
                        <p className="text-base font-bold text-blue-600">{mc.length}</p>
                        <p className="text-[8px] font-bold text-slate-400 uppercase">Clients</p>
                      </div>
                      <div className="text-center p-2 rounded-xl bg-amber-50">
                        <p className="text-base font-bold text-amber-600">{mAct.length}</p>
                        <p className="text-[8px] font-bold text-slate-400 uppercase">Today</p>
                      </div>
                      <div className="text-center p-2 rounded-xl bg-purple-50">
                        <p className="text-base font-bold text-purple-600">{weekActs}</p>
                        <p className="text-[8px] font-bold text-slate-400 uppercase">Week</p>
                      </div>
                      <div className="text-center p-2 rounded-xl bg-green-50">
                        <p className="text-base font-bold text-green-600">{mDeals}</p>
                        <p className="text-[8px] font-bold text-slate-400 uppercase">Deals</p>
                      </div>
                    </div>
                    {(mPipelineVal > 0 || mDealVal > 0) && (
                      <div className="mt-3 grid grid-cols-2 gap-1.5">
                        <div className="text-center p-1.5 rounded-lg bg-emerald-50 border border-emerald-100">
                          <p className="text-[10px] font-bold text-emerald-700">Rp {formatRupiah(mPipelineVal)}</p>
                          <p className="text-[7px] font-bold text-slate-400 uppercase">Pipeline</p>
                        </div>
                        <div className="text-center p-1.5 rounded-lg bg-amber-50 border border-amber-100">
                          <p className="text-[10px] font-bold text-amber-700">Rp {formatRupiah(mDealVal)}</p>
                          <p className="text-[7px] font-bold text-slate-400 uppercase">Deal Value</p>
                        </div>
                      </div>
                    )}
                    <div className="mt-3 flex items-center gap-2">
                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all" style={{ width: `${convRate}%` }}></div>
                      </div>
                      <span className="text-[10px] font-bold text-slate-500">{convRate}%</span>
                    </div>
                    <p className="text-[9px] text-slate-400 mt-1">Conversion rate</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Project Tracking Table */}
          {(() => {
            const filteredProjects = clients.filter(c => {
              const matchSearch = projectSearch === '' || c.name.toLowerCase().includes(projectSearch.toLowerCase());
              const matchMarketing = projectFilterMarketing === 'all' || c.marketingId === projectFilterMarketing;
              const matchStatus = projectFilterStatus === 'all' || c.status === projectFilterStatus;
              return matchSearch && matchMarketing && matchStatus;
            });

            const totalDpp = filteredProjects.reduce((sum, c) => sum + (c.dpp || 0), 0);
            const totalDpPaid = filteredProjects.reduce((sum, c) => sum + (c.dpPaid || 0), 0);
            const totalBersih = totalDpp - totalDpPaid;

            return (
              <div className="bg-white p-4 lg:p-6 rounded-2xl shadow-sm border border-slate-100">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <i className="fa-solid fa-clipboard-list text-indigo-500"></i>
                    Project Tracking
                  </h3>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <i className="fa-solid fa-search absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300 text-[10px]"></i>
                      <input
                        type="text"
                        placeholder="Cari nama PT..."
                        value={projectSearch}
                        onChange={(e) => setProjectSearch(e.target.value)}
                        className="pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 w-40 bg-slate-50"
                      />
                    </div>
                    <select
                      value={projectFilterMarketing}
                      onChange={(e) => setProjectFilterMarketing(e.target.value)}
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 bg-slate-50 text-slate-600"
                    >
                      <option value="all">Semua Marketing</option>
                      {marketingUsers.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                    <select
                      value={projectFilterStatus}
                      onChange={(e) => setProjectFilterStatus(e.target.value)}
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 bg-slate-50 text-slate-600"
                    >
                      <option value="all">Semua Status</option>
                      {Object.values(ClientStatus).map(s => (
                        <option key={s} value={s}>{s.replace('_', ' ')}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3">
                    <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Total DPP</p>
                    <p className="text-sm lg:text-base font-bold text-indigo-700 mt-1">Rp {formatRupiah(totalDpp)}</p>
                  </div>
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                    <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Total DP Dibayar</p>
                    <p className="text-sm lg:text-base font-bold text-amber-700 mt-1">Rp {formatRupiah(totalDpPaid)}</p>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                    <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Total Bersih / Net</p>
                    <p className={`text-sm lg:text-base font-bold mt-1 ${totalBersih >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>Rp {formatRupiah(totalBersih)}</p>
                  </div>
                </div>

                {/* Table */}
                {filteredProjects.length > 0 ? (
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gradient-to-r from-slate-50 to-slate-100 sticky top-0">
                          <th className="text-[10px] uppercase tracking-wider font-bold text-slate-500 px-3 py-3 text-center w-12">No</th>
                          <th className="text-[10px] uppercase tracking-wider font-bold text-slate-500 px-3 py-3 text-left min-w-[180px]">Nama PT</th>
                          <th className="text-[10px] uppercase tracking-wider font-bold text-slate-500 px-3 py-3 text-left">Marketing</th>
                          <th className="text-[10px] uppercase tracking-wider font-bold text-slate-500 px-3 py-3 text-center">Thn Kerja</th>
                          <th className="text-[10px] uppercase tracking-wider font-bold text-slate-500 px-3 py-3 text-center">Thn Buku</th>
                          <th className="text-[10px] uppercase tracking-wider font-bold text-slate-500 px-3 py-3 text-left min-w-[140px]">Jasa</th>
                          <th className="text-[10px] uppercase tracking-wider font-bold text-slate-500 px-3 py-3 text-right">DPP</th>
                          <th className="text-[10px] uppercase tracking-wider font-bold text-slate-500 px-3 py-3 text-center">PPN</th>
                          <th className="text-[10px] uppercase tracking-wider font-bold text-slate-500 px-3 py-3 text-right">DP (Bukti)</th>
                          <th className="text-[10px] uppercase tracking-wider font-bold text-slate-500 px-3 py-3 text-right">Bersih</th>
                          <th className="text-[10px] uppercase tracking-wider font-bold text-slate-500 px-3 py-3 text-center">Progres</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredProjects.map((c, idx) => {
                          const bersih = (c.dpp || 0) - (c.dpPaid || 0);
                          const marketingName = users.find(u => u.id === c.marketingId)?.name || '-';
                          return (
                            <tr key={c.id} className="hover:bg-indigo-50/40 transition-colors border-b border-slate-100 last:border-0">
                              <td className="px-3 py-2.5 text-center text-slate-400 font-medium">{idx + 1}</td>
                              <td className="px-3 py-2.5">
                                <p className="font-semibold text-slate-800">{c.name}</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">{c.industry}</p>
                              </td>
                              <td className="px-3 py-2.5 text-slate-500">{marketingName}</td>
                              <td className="px-3 py-2.5 text-center text-slate-500">{c.yearWork ?? '-'}</td>
                              <td className="px-3 py-2.5 text-center text-slate-500">{c.yearBook ?? '-'}</td>
                              <td className="px-3 py-2.5 text-slate-600">{c.serviceType || '-'}</td>
                              <td className="px-3 py-2.5 text-right font-medium text-slate-700">Rp {formatRupiah(c.dpp || 0)}</td>
                              <td className="px-3 py-2.5 text-center">
                                <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold ${c.ppnType === 'INCLUDE' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                  {c.ppnType === 'INCLUDE' ? 'Include' : 'Exclude'}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-right font-medium text-slate-700">Rp {formatRupiah(c.dpPaid || 0)}</td>
                              <td className={`px-3 py-2.5 text-right font-bold ${bersih > 0 ? 'text-emerald-600' : bersih < 0 ? 'text-red-500' : 'text-slate-500'}`}>
                                Rp {formatRupiah(bersih)}
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border ${STATUS_COLORS[c.status]}`}>
                                  {c.status.replace('_', ' ')}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-50 font-bold">
                          <td colSpan={6} className="px-3 py-3 text-xs text-slate-700 uppercase tracking-wider">Total</td>
                          <td className="px-3 py-3 text-right text-xs text-slate-800">Rp {formatRupiah(totalDpp)}</td>
                          <td className="px-3 py-3"></td>
                          <td className="px-3 py-3 text-right text-xs text-slate-800">Rp {formatRupiah(totalDpPaid)}</td>
                          <td className={`px-3 py-3 text-right text-xs font-bold ${totalBersih >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>Rp {formatRupiah(totalBersih)}</td>
                          <td className="px-3 py-3"></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-12 text-slate-300">
                    <i className="fa-solid fa-folder-open text-4xl mb-3"></i>
                    <p className="text-sm font-medium text-slate-400">Tidak ada project yang cocok</p>
                    <p className="text-[10px] text-slate-300 mt-1">Coba ubah filter atau kata kunci pencarian</p>
                  </div>
                )}
              </div>
            );
          })()}
        </>
      )}

      {/* Recent Clients (both roles) */}
      <div className="bg-white p-4 lg:p-6 rounded-2xl shadow-sm border border-slate-100">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <i className="fa-solid fa-clock-rotate-left text-indigo-500"></i>
            Recent Client Updates
          </h3>
          <span className="text-[10px] text-slate-400 font-medium">{myClients.length} total</span>
        </div>
        {recentClients.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {recentClients.map(client => (
              <div key={client.id} className="group flex items-center gap-3 p-3 bg-slate-50/80 rounded-xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all">
                <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-slate-400 border border-slate-100 flex-shrink-0">
                  <i className="fa-solid fa-building text-sm"></i>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm text-slate-800 truncate">{client.name}</p>
                  <p className="text-[10px] text-slate-400 truncate">
                    {isManager
                      ? (marketingUsers.find(m => m.id === client.marketingId)?.name || client.industry)
                      : client.industry
                    }
                  </p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase flex-shrink-0 border ${STATUS_COLORS[client.status]}`}>
                  {client.status.replace('_', ' ')}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-slate-300">
            <i className="fa-solid fa-building text-3xl mb-2"></i>
            <p className="text-sm font-medium">Belum ada client</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
