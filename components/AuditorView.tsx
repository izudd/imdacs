
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { User, Client, ClientStatus } from '../types';
import { STATUS_COLORS, AUDITOR_TEAM_MEMBERS } from '../constants';
import * as api from '../services/apiService';
import * as monitra from '../services/monitraService';
import type { SpvReport, AuditorReport, MonitaUser } from '../services/monitraService';

interface AuditorViewProps {
  user: User;
  clients: Client[];
  users: User[];
  onEditClient: (client: Partial<Client> & { id: string }) => Promise<void>;
  onRefresh: () => void;
}

const AuditorView: React.FC<AuditorViewProps> = ({ user, clients, users, onEditClient, onRefresh }) => {
  const [activeView, setActiveView] = useState<'team' | 'unassigned' | 'progress'>('team');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [assignLoading, setAssignLoading] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // MONITRA state
  const [monitraTab, setMonitraTab] = useState<'manager' | 'supervisor' | 'auditor'>('manager');
  const [spvReports, setSpvReports] = useState<SpvReport[]>([]);
  const [auditorReports, setAuditorReports] = useState<AuditorReport[]>([]);
  const [monitraUsers, setMonitraUsers] = useState<MonitaUser[]>([]);
  const [monitraLoading, setMonitraLoading] = useState(false);
  const [monitraLoaded, setMonitraLoaded] = useState(false);
  const [monitraDatePreset, setMonitraDatePreset] = useState<'today' | '7days' | 'month' | 'all'>('7days');
  const [monitraSearch, setMonitraSearch] = useState('');
  const [expandedSpv, setExpandedSpv] = useState<number | null>(null);
  const [expandedAuditor, setExpandedAuditor] = useState<number | null>(null);

  // Filter clients: DEAL status or dpPaid > 0
  const auditClients = useMemo(() =>
    clients.filter(c => c.status === ClientStatus.DEAL || c.dpPaid > 0),
    [clients]
  );

  const unassignedClients = useMemo(() =>
    auditClients.filter(c => !c.auditorAssignee),
    [auditClients]
  );

  const assignedClients = useMemo(() =>
    auditClients.filter(c => !!c.auditorAssignee),
    [auditClients]
  );

  const teamGroups = useMemo(() => {
    const groups: Record<string, Client[]> = {};
    AUDITOR_TEAM_MEMBERS.forEach(name => { groups[name] = []; });
    assignedClients.forEach(c => {
      if (c.auditorAssignee && groups[c.auditorAssignee]) {
        groups[c.auditorAssignee].push(c);
      }
    });
    return groups;
  }, [assignedClients]);

  const getMarketingName = useCallback((marketingId: string) => {
    const u = users.find(u => u.id === marketingId);
    return u?.name || marketingId;
  }, [users]);

  const [notifStatus, setNotifStatus] = useState<{ type: 'success' | 'warning' | 'error'; message: string } | null>(null);

  // Fetch MONITRA data when Progress tab is opened
  const fetchMonitraData = useCallback(async () => {
    setMonitraLoading(true);
    try {
      const [spv, aud, usrs] = await Promise.all([
        monitra.getSpvReports(),
        monitra.getAuditorReports(),
        monitra.getMonitaUsers(),
      ]);
      setSpvReports(spv);
      setAuditorReports(aud);
      setMonitraUsers(usrs);
      setMonitraLoaded(true);
    } catch (e) {
      console.error('Failed to load MONITRA data', e);
    } finally {
      setMonitraLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeView === 'progress' && !monitraLoaded) {
      fetchMonitraData();
    }
  }, [activeView, monitraLoaded, fetchMonitraData]);

  // Date filter helper
  const getDateRange = useCallback((): { from: string; to: string } | null => {
    const today = new Date();
    const fmt = (d: Date) => d.toISOString().split('T')[0];
    if (monitraDatePreset === 'today') return { from: fmt(today), to: fmt(today) };
    if (monitraDatePreset === '7days') {
      const d = new Date(today); d.setDate(d.getDate() - 6);
      return { from: fmt(d), to: fmt(today) };
    }
    if (monitraDatePreset === 'month') {
      const d = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: fmt(d), to: fmt(today) };
    }
    return null; // 'all'
  }, [monitraDatePreset]);

  // Filtered MONITRA data
  const filteredManagerReports = useMemo(() => {
    const range = getDateRange();
    const q = monitraSearch.toLowerCase().trim();
    return spvReports.filter(r => {
      if (r.author_role !== 'Manager') return false;
      if (range && (r.tanggal < range.from || r.tanggal > range.to)) return false;
      if (q && !r.judul.toLowerCase().includes(q) && !r.isi.toLowerCase().includes(q) && !r.author_name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [spvReports, getDateRange, monitraSearch]);

  const filteredSupervisorReports = useMemo(() => {
    const range = getDateRange();
    const q = monitraSearch.toLowerCase().trim();
    return spvReports.filter(r => {
      if (r.author_role !== 'Supervisor') return false;
      if (range && (r.tanggal < range.from || r.tanggal > range.to)) return false;
      if (q && !r.judul.toLowerCase().includes(q) && !r.isi.toLowerCase().includes(q) && !r.author_name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [spvReports, getDateRange, monitraSearch]);

  const filteredAuditorReports = useMemo(() => {
    const range = getDateRange();
    const q = monitraSearch.toLowerCase().trim();
    return auditorReports.filter(r => {
      if (range && (r.tanggal < range.from || r.tanggal > range.to)) return false;
      if (q && !r.nama_pt.toLowerCase().includes(q) && !r.auditor_name.toLowerCase().includes(q) && !r.deskripsi_pekerjaan.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [auditorReports, getDateRange, monitraSearch]);

  // Group auditor reports by SPV → Auditor
  const auditorsBySpv = useMemo(() => {
    const supervisors = monitraUsers.filter(u => u.role === 'Supervisor' && u.is_active);
    const auditors = monitraUsers.filter(u => u.role === 'Auditor' && u.is_active);

    return supervisors.map(spv => {
      const spvAuditors = auditors.filter(a => a.supervisor_id === spv.id);
      const spvAuditorsWithReports = spvAuditors.map(aud => {
        const reports = filteredAuditorReports.filter(r => r.auditor_id === aud.id);
        const approved = reports.filter(r => r.approval_status === 'Approved').length;
        const pending = reports.filter(r => r.approval_status === 'Pending').length;
        const rejected = reports.filter(r => r.approval_status === 'Rejected').length;
        const avgProgress = reports.length > 0 ? Math.round(reports.reduce((s, r) => s + r.progress, 0) / reports.length) : 0;
        return { ...aud, reports, approved, pending, rejected, avgProgress };
      });
      const totalReports = spvAuditorsWithReports.reduce((s, a) => s + a.reports.length, 0);
      return { ...spv, auditors: spvAuditorsWithReports, totalReports };
    }).filter(spv => spv.auditors.length > 0);
  }, [monitraUsers, filteredAuditorReports]);

  // MONITRA stats
  const monitraStats = useMemo(() => ({
    managerCount: filteredManagerReports.length,
    supervisorCount: filteredSupervisorReports.length,
    auditorCount: filteredAuditorReports.length,
    pendingCount: filteredAuditorReports.filter(r => r.approval_status === 'Pending').length,
  }), [filteredManagerReports, filteredSupervisorReports, filteredAuditorReports]);

  const handleAssign = async (clientId: string, assignee: string) => {
    setAssignLoading(clientId);
    setNotifStatus(null);
    try {
      const client = auditClients.find(c => c.id === clientId);
      await onEditClient({ id: clientId, auditorAssignee: assignee } as Partial<Client> & { id: string });
      if (client) {
        try {
          const result = await api.sendAssignNotification({
            assignee,
            clientName: client.name,
            clientIndustry: client.industry,
            clientPic: client.picName,
            clientStatus: client.status,
            marketingName: getMarketingName(client.marketingId),
            notes: client.notes || '',
          });
          const waSent = result.notifications?.wa?.sent;
          const emailSent = result.notifications?.email?.sent;
          if (waSent && emailSent) setNotifStatus({ type: 'success', message: `✅ ${assignee} dinotifikasi via WhatsApp & Email` });
          else if (waSent) setNotifStatus({ type: 'success', message: `✅ ${assignee} dinotifikasi via WhatsApp` });
          else if (emailSent) setNotifStatus({ type: 'success', message: `✅ ${assignee} dinotifikasi via Email` });
          else setNotifStatus({ type: 'warning', message: `⚠️ Client diassign, tapi notifikasi belum dikonfigurasi` });
        } catch {
          setNotifStatus({ type: 'warning', message: `⚠️ Client diassign ke ${assignee}, tapi gagal kirim notifikasi` });
        }
      }
      onRefresh();
      setTimeout(() => setNotifStatus(null), 5000);
    } catch {
      alert('Gagal assign client');
    } finally {
      setAssignLoading(null);
    }
  };

  const handleUnassign = async (clientId: string) => {
    setAssignLoading(clientId);
    try {
      await onEditClient({ id: clientId, auditorAssignee: '' } as Partial<Client> & { id: string });
      onRefresh();
    } catch {
      alert('Gagal unassign client');
    } finally {
      setAssignLoading(null);
    }
  };

  const openClientDetail = (client: Client) => {
    setSelectedClient(client);
  };

  const filteredUnassigned = useMemo(() => {
    if (!searchQuery.trim()) return unassignedClients;
    const q = searchQuery.toLowerCase();
    return unassignedClients.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.picName.toLowerCase().includes(q) ||
      c.industry.toLowerCase().includes(q)
    );
  }, [unassignedClients, searchQuery]);

  // Stats
  const totalAudit = auditClients.length;
  const totalAssigned = assignedClients.length;
  const totalUnassigned = unassignedClients.length;

  const formatDate = (d: string) => new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

  // Helper to group reports by date and return sorted entries
  const groupByDate = (items: SpvReport[]): [string, SpvReport[]][] => {
    const groups: Record<string, SpvReport[]> = {};
    items.forEach(item => {
      if (!groups[item.tanggal]) groups[item.tanggal] = [];
      groups[item.tanggal].push(item);
    });
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  };

  const groupAuditorByDate = (items: AuditorReport[]): [string, AuditorReport[]][] => {
    const groups: Record<string, AuditorReport[]> = {};
    items.forEach(item => {
      if (!groups[item.tanggal]) groups[item.tanggal] = [];
      groups[item.tanggal].push(item);
    });
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  };

  // Render timeline card for SPV/Manager reports
  const renderSpvCard = (r: SpvReport) => (
    <div key={r.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-indigo-600 font-black text-xs">{r.author_name?.[0] || '?'}</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-800 truncate">{r.author_name}</p>
            <p className="text-[10px] text-slate-400">{r.author_role}</p>
          </div>
        </div>
        <span className="text-[10px] text-slate-400 flex-shrink-0">{new Date(r.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      <h4 className="text-sm font-bold text-slate-700 mb-1">{r.judul}</h4>
      <p className="text-xs text-slate-600 whitespace-pre-line mb-3 line-clamp-4">{r.isi}</p>
      {r.kegiatan && (
        <div className="flex flex-wrap gap-1 mb-2">
          {r.kegiatan.split('\n').filter(Boolean).map((k, i) => (
            <span key={i} className="bg-indigo-50 text-indigo-600 text-[10px] font-semibold px-2 py-0.5 rounded-full">{k.trim()}</span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {r.kendala && (
          <p className="text-[10px] text-amber-600"><i className="fa-solid fa-triangle-exclamation mr-1"></i>Kendala: {r.kendala}</p>
        )}
        {r.rencana && (
          <p className="text-[10px] text-blue-600"><i className="fa-solid fa-clipboard-list mr-1"></i>Rencana: {r.rencana}</p>
        )}
      </div>
    </div>
  );

  // Approval status badge
  const approvalBadge = (status: string) => {
    const cls = status === 'Approved' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                status === 'Rejected' ? 'bg-red-100 text-red-700 border-red-200' :
                'bg-amber-100 text-amber-700 border-amber-200';
    return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cls}`}>{status}</span>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-800 tracking-tight">Audit Dashboard</h1>
        <p className="text-slate-500 text-sm mt-0.5">Kelola klien DEAL & DP - Assign ke tim audit</p>
      </div>

      {/* Notification Toast */}
      {notifStatus && (
        <div className={`rounded-xl p-3 flex items-center gap-3 text-sm font-semibold animate-fade-in ${
          notifStatus.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
          notifStatus.type === 'warning' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
          'bg-red-50 text-red-700 border border-red-200'
        }`}>
          <span>{notifStatus.message}</span>
          <button onClick={() => setNotifStatus(null)} className="ml-auto text-current opacity-50 hover:opacity-100">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
      )}

      {/* Stats Cards — only show on team/unassigned views */}
      {activeView !== 'progress' && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                <i className="fa-solid fa-file-contract text-emerald-600 text-sm"></i>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Klien</p>
                <p className="text-xl font-black text-slate-800">{totalAudit}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                <i className="fa-solid fa-user-check text-blue-600 text-sm"></i>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Diassign</p>
                <p className="text-xl font-black text-slate-800">{totalAssigned}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                <i className="fa-solid fa-clock text-amber-600 text-sm"></i>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Belum Assign</p>
                <p className="text-xl font-black text-slate-800">{totalUnassigned}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab Switcher */}
      <div className="flex items-center gap-2 bg-slate-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => setActiveView('team')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
            activeView === 'team' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <i className="fa-solid fa-users-gear mr-2 text-xs"></i>
          Tim Board
        </button>
        <button
          onClick={() => setActiveView('unassigned')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
            activeView === 'unassigned' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <i className="fa-solid fa-inbox mr-2 text-xs"></i>
          Belum Diassign
          {totalUnassigned > 0 && (
            <span className="ml-2 bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{totalUnassigned}</span>
          )}
        </button>
        <button
          onClick={() => setActiveView('progress')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
            activeView === 'progress' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <i className="fa-solid fa-chart-line mr-2 text-xs"></i>
          Progress Audit
        </button>
      </div>

      {/* ═══ TEAM BOARD ═══ */}
      {activeView === 'team' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {AUDITOR_TEAM_MEMBERS.map(member => {
            const memberClients = teamGroups[member] || [];
            return (
              <div key={member} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
                      <span className="text-indigo-600 font-black text-sm">{member[0]}</span>
                    </div>
                    <span className="font-bold text-slate-700 text-sm">{member}</span>
                  </div>
                  <span className="bg-indigo-50 text-indigo-600 text-[10px] font-bold px-2 py-1 rounded-full">
                    {memberClients.length} klien
                  </span>
                </div>
                <div className="divide-y divide-slate-50">
                  {memberClients.length === 0 ? (
                    <div className="p-6 text-center">
                      <i className="fa-solid fa-inbox text-slate-300 text-2xl mb-2"></i>
                      <p className="text-slate-400 text-xs">Belum ada klien</p>
                    </div>
                  ) : (
                    memberClients.map(client => (
                      <div key={client.id} onClick={() => openClientDetail(client)} className="p-3 hover:bg-slate-50 cursor-pointer transition-colors">
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-slate-800 truncate">{client.name}</p>
                            <p className="text-[11px] text-slate-400 truncate">{client.industry} - {getMarketingName(client.marketingId)}</p>
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_COLORS[client.status]}`}>
                            {client.status}
                          </span>
                        </div>
                        {client.notes && (
                          <p className="text-[10px] text-slate-500 truncate"><i className="fa-solid fa-sticky-note mr-1"></i>{client.notes}</p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ UNASSIGNED ═══ */}
      {activeView === 'unassigned' && (
        <div className="space-y-4">
          <div className="relative">
            <i className="fa-solid fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Cari klien..."
              className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 outline-none" />
          </div>
          {filteredUnassigned.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
              <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <i className="fa-solid fa-check-double text-emerald-400 text-2xl"></i>
              </div>
              <p className="text-slate-600 font-bold">Semua klien sudah diassign</p>
              <p className="text-slate-400 text-sm mt-1">Tidak ada klien DEAL/DP yang belum diassign ke tim.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredUnassigned.map(client => (
                <div key={client.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-800 truncate">{client.name}</p>
                      <p className="text-[11px] text-slate-400">{client.industry}</p>
                      <p className="text-[11px] text-slate-400">PIC: {client.picName} - Marketing: {getMarketingName(client.marketingId)}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${STATUS_COLORS[client.status]}`}>
                      {client.status}
                    </span>
                  </div>
                  {client.notes && (
                    <p className="text-[11px] text-slate-500 mb-3 line-clamp-2"><i className="fa-solid fa-sticky-note mr-1 text-slate-400"></i>{client.notes}</p>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 font-semibold">Assign ke:</span>
                    {AUDITOR_TEAM_MEMBERS.map(member => (
                      <button key={member} onClick={() => handleAssign(client.id, member)} disabled={assignLoading === client.id}
                        className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg text-[11px] font-bold transition-colors disabled:opacity-50">
                        {assignLoading === client.id ? <i className="fa-solid fa-spinner fa-spin"></i> : member}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ PROGRESS AUDIT (MONITRA) ═══ */}
      {activeView === 'progress' && (
        <div className="space-y-4">
          {/* MONITRA Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                  <i className="fa-solid fa-file-lines text-purple-600 text-sm"></i>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Catatan Manager</p>
                  <p className="text-xl font-black text-slate-800">{monitraStats.managerCount}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                  <i className="fa-solid fa-user-tie text-blue-600 text-sm"></i>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Catatan Supervisor</p>
                  <p className="text-xl font-black text-slate-800">{monitraStats.supervisorCount}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                  <i className="fa-solid fa-clipboard-check text-emerald-600 text-sm"></i>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Laporan Auditor</p>
                  <p className="text-xl font-black text-slate-800">{monitraStats.auditorCount}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                  <i className="fa-solid fa-hourglass-half text-amber-600 text-sm"></i>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Pending Approval</p>
                  <p className="text-xl font-black text-slate-800">{monitraStats.pendingCount}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Filter bar */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
              {(['today', '7days', 'month', 'all'] as const).map(preset => (
                <button key={preset} onClick={() => setMonitraDatePreset(preset)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    monitraDatePreset === preset ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {preset === 'today' ? 'Hari Ini' : preset === '7days' ? '7 Hari' : preset === 'month' ? 'Bulan Ini' : 'Semua'}
                </button>
              ))}
            </div>
            <div className="relative flex-1">
              <i className="fa-solid fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
              <input type="text" value={monitraSearch} onChange={e => setMonitraSearch(e.target.value)} placeholder="Cari laporan..."
                className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 outline-none" />
            </div>
            <button onClick={() => { setMonitraLoaded(false); fetchMonitraData(); }}
              className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors flex-shrink-0">
              <i className="fa-solid fa-rotate mr-1.5"></i>Refresh
            </button>
          </div>

          {/* Sub-tabs: Manager / Supervisor / Auditor */}
          <div className="flex items-center gap-2 bg-slate-100 rounded-xl p-1 w-fit">
            {(['manager', 'supervisor', 'auditor'] as const).map(tab => (
              <button key={tab} onClick={() => setMonitraTab(tab)}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                  monitraTab === tab ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab === 'manager' ? `Manager (${monitraStats.managerCount})` :
                 tab === 'supervisor' ? `Supervisor (${monitraStats.supervisorCount})` :
                 `Auditor per SPV`}
              </button>
            ))}
          </div>

          {/* Loading */}
          {monitraLoading && (
            <div className="flex items-center justify-center py-16">
              <i className="fa-solid fa-spinner fa-spin text-indigo-500 text-2xl mr-3"></i>
              <span className="text-slate-500 font-medium">Memuat data dari MONITRA...</span>
            </div>
          )}

          {/* Manager Tab */}
          {!monitraLoading && monitraTab === 'manager' && (
            filteredManagerReports.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
                <i className="fa-solid fa-file-lines text-slate-200 text-4xl mb-3"></i>
                <p className="text-slate-400 font-bold">Belum ada catatan manager</p>
              </div>
            ) : (
              <div className="space-y-4">
                {groupByDate(filteredManagerReports).map(([date, reports]) => (
                  <div key={date}>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                      <span className="text-xs font-bold text-slate-500">{formatDate(date)}</span>
                      <span className="text-[10px] text-slate-400">({reports.length} catatan)</span>
                    </div>
                    <div className="space-y-3 ml-4 border-l-2 border-slate-100 pl-4">
                      {reports.map(r => renderSpvCard(r))}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {/* Supervisor Tab */}
          {!monitraLoading && monitraTab === 'supervisor' && (
            filteredSupervisorReports.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
                <i className="fa-solid fa-user-tie text-slate-200 text-4xl mb-3"></i>
                <p className="text-slate-400 font-bold">Belum ada catatan supervisor</p>
              </div>
            ) : (
              <div className="space-y-4">
                {groupByDate(filteredSupervisorReports).map(([date, reports]) => (
                  <div key={date}>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      <span className="text-xs font-bold text-slate-500">{formatDate(date)}</span>
                      <span className="text-[10px] text-slate-400">({reports.length} catatan)</span>
                    </div>
                    <div className="space-y-3 ml-4 border-l-2 border-slate-100 pl-4">
                      {reports.map(r => renderSpvCard(r))}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {/* Auditor per SPV Tab */}
          {!monitraLoading && monitraTab === 'auditor' && (
            auditorsBySpv.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
                <i className="fa-solid fa-clipboard-check text-slate-200 text-4xl mb-3"></i>
                <p className="text-slate-400 font-bold">Belum ada laporan auditor</p>
              </div>
            ) : (
              <div className="space-y-4">
                {auditorsBySpv.map(spv => (
                  <div key={spv.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    {/* SPV Header */}
                    <button onClick={() => setExpandedSpv(expandedSpv === spv.id ? null : spv.id)}
                      className="w-full px-4 py-3 bg-gradient-to-r from-slate-50 to-slate-100 flex items-center justify-between hover:bg-slate-100 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center">
                          <i className="fa-solid fa-user-tie text-blue-600 text-sm"></i>
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-bold text-slate-800">SPV: {spv.full_name}</p>
                          <p className="text-[10px] text-slate-400">{spv.auditors.length} auditor • {spv.totalReports} laporan</p>
                        </div>
                      </div>
                      <i className={`fa-solid fa-chevron-down text-slate-400 text-xs transition-transform ${expandedSpv === spv.id ? 'rotate-180' : ''}`}></i>
                    </button>

                    {/* SPV Content */}
                    {expandedSpv === spv.id && (
                      <div className="divide-y divide-slate-100">
                        {spv.auditors.map(aud => (
                          <div key={aud.id}>
                            {/* Auditor Header */}
                            <button onClick={() => setExpandedAuditor(expandedAuditor === aud.id ? null : aud.id)}
                              className="w-full px-5 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                                  <span className="text-emerald-600 font-black text-xs">{aud.full_name?.[0]}</span>
                                </div>
                                <div className="text-left">
                                  <p className="text-sm font-bold text-slate-700">{aud.full_name}</p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    {aud.approved > 0 && <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">{aud.approved} Approved</span>}
                                    {aud.pending > 0 && <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">{aud.pending} Pending</span>}
                                    {aud.rejected > 0 && <span className="text-[9px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">{aud.rejected} Rejected</span>}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                {/* Avg progress */}
                                <div className="flex items-center gap-2 w-24">
                                  <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full ${aud.avgProgress >= 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${aud.avgProgress}%` }} />
                                  </div>
                                  <span className="text-[10px] font-bold text-slate-500">{aud.avgProgress}%</span>
                                </div>
                                <i className={`fa-solid fa-chevron-down text-slate-300 text-xs transition-transform ${expandedAuditor === aud.id ? 'rotate-180' : ''}`}></i>
                              </div>
                            </button>

                            {/* Auditor Reports */}
                            {expandedAuditor === aud.id && aud.reports.length > 0 && (
                              <div className="px-5 pb-4">
                                {groupAuditorByDate(aud.reports).map(([date, reps]) => (
                                  <div key={date} className="mb-3">
                                    <p className="text-[10px] font-bold text-slate-400 mb-2 ml-1">{formatDate(date)}</p>
                                    <div className="space-y-2">
                                      {reps.map(r => (
                                        <div key={r.id} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                                          <div className="flex items-start justify-between gap-2 mb-2">
                                            <div className="min-w-0 flex-1">
                                              <p className="text-xs font-bold text-slate-800">{r.nama_pt}</p>
                                              <p className="text-[10px] text-slate-400">{r.jam_mulai} - {r.jam_selesai} • Area: {r.area_diaudit}</p>
                                            </div>
                                            {approvalBadge(r.approval_status)}
                                          </div>
                                          <p className="text-xs text-slate-600 mb-2 line-clamp-2">{r.deskripsi_pekerjaan}</p>
                                          {r.temuan && (
                                            <div className="bg-red-50 border border-red-100 rounded-lg p-2 mb-2">
                                              <p className="text-[10px] text-red-700"><i className="fa-solid fa-triangle-exclamation mr-1"></i>Temuan: {r.temuan}</p>
                                            </div>
                                          )}
                                          <div className="flex items-center gap-2">
                                            <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                              <div className={`h-full rounded-full ${r.progress >= 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${r.progress}%` }} />
                                            </div>
                                            <span className="text-[10px] font-bold text-slate-500">{r.progress}%</span>
                                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${r.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{r.status}</span>
                                          </div>
                                          {r.kendala && (
                                            <p className="text-[10px] text-amber-600 mt-1.5"><i className="fa-solid fa-triangle-exclamation mr-1"></i>{r.kendala}</p>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      )}

      {/* ═══ CLIENT DETAIL MODAL ═══ */}
      {selectedClient && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={() => setSelectedClient(null)} />
          <div className="relative bg-white rounded-3xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden animate-slide-up flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-black text-slate-800 truncate">{selectedClient.name}</h3>
                <p className="text-xs text-slate-400">{selectedClient.industry}</p>
              </div>
              <button onClick={() => setSelectedClient(null)}
                className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors flex-shrink-0 ml-2">
                <i className="fa-solid fa-xmark text-slate-500 text-sm"></i>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-6 space-y-5">
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Informasi Klien</h4>
                <div className="grid grid-cols-2 gap-3">
                  <InfoItem label="PIC" value={selectedClient.picName} />
                  <InfoItem label="Telepon" value={selectedClient.phone || '-'} />
                  <InfoItem label="Email" value={selectedClient.email || '-'} />
                  <InfoItem label="Status" value={selectedClient.status} badge={STATUS_COLORS[selectedClient.status]} />
                  <InfoItem label="Marketing" value={getMarketingName(selectedClient.marketingId)} />
                  <InfoItem label="Jasa" value={selectedClient.serviceType || '-'} />
                </div>
              </div>
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Info Tambahan</h4>
                <div className="grid grid-cols-2 gap-3">
                  {selectedClient.yearWork && <InfoItem label="Tahun Kerja" value={String(selectedClient.yearWork)} />}
                  {selectedClient.yearBook && <InfoItem label="Tahun Buku" value={String(selectedClient.yearBook)} />}
                </div>
              </div>
              {selectedClient.notes && (
                <div>
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Catatan</h4>
                  <p className="text-sm text-slate-600 bg-slate-50 rounded-xl p-3">{selectedClient.notes}</p>
                </div>
              )}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Assign Tim</h4>
                <div className="flex items-center gap-2 flex-wrap">
                  {AUDITOR_TEAM_MEMBERS.map(member => (
                    <button key={member} onClick={() => handleAssign(selectedClient.id, member)} disabled={assignLoading === selectedClient.id}
                      className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                        selectedClient.auditorAssignee === member
                          ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}>{member}</button>
                  ))}
                  {selectedClient.auditorAssignee && (
                    <button onClick={() => handleUnassign(selectedClient.id)} disabled={assignLoading === selectedClient.id}
                      className="px-4 py-2 rounded-xl text-sm font-bold bg-red-50 text-red-500 hover:bg-red-100 transition-all">
                      <i className="fa-solid fa-xmark mr-1"></i>Unassign
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper sub-component
const InfoItem: React.FC<{ label: string; value: string; badge?: string; highlight?: boolean }> = ({ label, value, badge, highlight }) => (
  <div>
    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{label}</p>
    {badge ? (
      <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded-full border ${badge}`}>{value}</span>
    ) : (
      <p className={`text-sm font-semibold ${highlight ? 'text-emerald-600' : 'text-slate-700'} truncate`}>{value}</p>
    )}
  </div>
);

export default AuditorView;
