import React, { useState, useEffect, useMemo, useCallback } from 'react';
import * as monitra from '../../services/monitraService';
import type { SpvReport, AuditorReport, MonitaUser } from '../../services/monitraService';

const MonitraProgressAudit: React.FC = () => {
  const [monitraTab, setMonitraTab] = useState<'manager' | 'supervisor' | 'auditor'>('manager');
  const [spvReports, setSpvReports] = useState<SpvReport[]>([]);
  const [auditorReports, setAuditorReports] = useState<AuditorReport[]>([]);
  const [monitraUsers, setMonitraUsers] = useState<MonitaUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [datePreset, setDatePreset] = useState<'today' | '7days' | 'month' | 'all'>('7days');
  const [search, setSearch] = useState('');
  const [expandedSpv, setExpandedSpv] = useState<number | null>(null);
  const [expandedAuditor, setExpandedAuditor] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [spv, aud, usrs] = await Promise.all([
        monitra.getSpvReports(),
        monitra.getAuditorReports(),
        monitra.getMonitaUsers(),
      ]);
      setSpvReports(spv);
      setAuditorReports(aud);
      setMonitraUsers(usrs);
    } catch (e) {
      console.error('Failed to load MONITRA data', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getDateRange = useCallback((): { from: string; to: string } | null => {
    const today = new Date();
    const fmt = (d: Date) => d.toISOString().split('T')[0];
    if (datePreset === 'today') return { from: fmt(today), to: fmt(today) };
    if (datePreset === '7days') { const d = new Date(today); d.setDate(d.getDate() - 6); return { from: fmt(d), to: fmt(today) }; }
    if (datePreset === 'month') { const d = new Date(today.getFullYear(), today.getMonth(), 1); return { from: fmt(d), to: fmt(today) }; }
    return null;
  }, [datePreset]);

  const filteredManagerReports = useMemo(() => {
    const range = getDateRange();
    const q = search.toLowerCase().trim();
    return spvReports.filter(r => {
      if (r.author_role !== 'Manager') return false;
      if (range && (r.tanggal < range.from || r.tanggal > range.to)) return false;
      if (q && !r.judul.toLowerCase().includes(q) && !r.isi.toLowerCase().includes(q) && !r.author_name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [spvReports, getDateRange, search]);

  const filteredSupervisorReports = useMemo(() => {
    const range = getDateRange();
    const q = search.toLowerCase().trim();
    return spvReports.filter(r => {
      if (r.author_role !== 'Supervisor') return false;
      if (range && (r.tanggal < range.from || r.tanggal > range.to)) return false;
      if (q && !r.judul.toLowerCase().includes(q) && !r.isi.toLowerCase().includes(q) && !r.author_name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [spvReports, getDateRange, search]);

  const filteredAuditorReports = useMemo(() => {
    const range = getDateRange();
    const q = search.toLowerCase().trim();
    return auditorReports.filter(r => {
      if (range && (r.tanggal < range.from || r.tanggal > range.to)) return false;
      if (q && !r.nama_pt.toLowerCase().includes(q) && !r.auditor_name.toLowerCase().includes(q) && !r.deskripsi_pekerjaan.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [auditorReports, getDateRange, search]);

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

  const stats = useMemo(() => ({
    managerCount: filteredManagerReports.length,
    supervisorCount: filteredSupervisorReports.length,
    auditorCount: filteredAuditorReports.length,
    pendingCount: filteredAuditorReports.filter(r => r.approval_status === 'Pending').length,
  }), [filteredManagerReports, filteredSupervisorReports, filteredAuditorReports]);

  const groupByDate = (items: SpvReport[]): [string, SpvReport[]][] => {
    const groups: Record<string, SpvReport[]> = {};
    items.forEach(item => { if (!groups[item.tanggal]) groups[item.tanggal] = []; groups[item.tanggal].push(item); });
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  };

  const groupAuditorByDate = (items: AuditorReport[]): [string, AuditorReport[]][] => {
    const groups: Record<string, AuditorReport[]> = {};
    items.forEach(item => { if (!groups[item.tanggal]) groups[item.tanggal] = []; groups[item.tanggal].push(item); });
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  };

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
        {r.kendala && <p className="text-[10px] text-amber-600"><i className="fa-solid fa-triangle-exclamation mr-1"></i>Kendala: {r.kendala}</p>}
        {r.rencana && <p className="text-[10px] text-blue-600"><i className="fa-solid fa-clipboard-list mr-1"></i>Rencana: {r.rencana}</p>}
      </div>
    </div>
  );

  const approvalBadge = (status: string) => {
    const cls = status === 'Approved' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                status === 'Rejected' ? 'bg-red-100 text-red-700 border-red-200' :
                'bg-amber-100 text-amber-700 border-amber-200';
    return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cls}`}>{status}</span>;
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon="fa-file-lines" color="purple" label="Catatan Manager" value={stats.managerCount} />
        <StatCard icon="fa-user-tie" color="blue" label="Catatan Supervisor" value={stats.supervisorCount} />
        <StatCard icon="fa-clipboard-check" color="emerald" label="Laporan Auditor" value={stats.auditorCount} />
        <StatCard icon="fa-hourglass-half" color="amber" label="Pending Approval" value={stats.pendingCount} />
      </div>

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
          {(['today', '7days', 'month', 'all'] as const).map(preset => (
            <button key={preset} onClick={() => setDatePreset(preset)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                datePreset === preset ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>
              {preset === 'today' ? 'Hari Ini' : preset === '7days' ? '7 Hari' : preset === 'month' ? 'Bulan Ini' : 'Semua'}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <i className="fa-solid fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari laporan..."
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 outline-none" />
        </div>
        <button onClick={fetchData}
          className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors flex-shrink-0">
          <i className="fa-solid fa-rotate mr-1.5"></i>Refresh
        </button>
      </div>

      {/* Sub-tabs */}
      <div className="flex items-center gap-2 bg-slate-100 rounded-xl p-1 w-fit">
        {(['manager', 'supervisor', 'auditor'] as const).map(tab => (
          <button key={tab} onClick={() => setMonitraTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              monitraTab === tab ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            {tab === 'manager' ? `Manager (${stats.managerCount})` : tab === 'supervisor' ? `Supervisor (${stats.supervisorCount})` : `Auditor per SPV`}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <i className="fa-solid fa-spinner fa-spin text-indigo-500 text-2xl mr-3"></i>
          <span className="text-slate-500 font-medium">Memuat data dari MONITRA...</span>
        </div>
      )}

      {/* Manager Tab */}
      {!loading && monitraTab === 'manager' && (
        filteredManagerReports.length === 0 ? (
          <Empty icon="fa-file-lines" text="Belum ada catatan manager" />
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
      {!loading && monitraTab === 'supervisor' && (
        filteredSupervisorReports.length === 0 ? (
          <Empty icon="fa-user-tie" text="Belum ada catatan supervisor" />
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
      {!loading && monitraTab === 'auditor' && (
        auditorsBySpv.length === 0 ? (
          <Empty icon="fa-clipboard-check" text="Belum ada laporan auditor" />
        ) : (
          <div className="space-y-4">
            {auditorsBySpv.map(spv => (
              <div key={spv.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <button onClick={() => setExpandedSpv(expandedSpv === spv.id ? null : spv.id)}
                  className="w-full px-4 py-3 bg-gradient-to-r from-slate-50 to-slate-100 flex items-center justify-between hover:bg-slate-100 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center">
                      <i className="fa-solid fa-user-tie text-blue-600 text-sm"></i>
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold text-slate-800">SPV: {spv.full_name}</p>
                      <p className="text-[10px] text-slate-400">{spv.auditors.length} auditor &bull; {spv.totalReports} laporan</p>
                    </div>
                  </div>
                  <i className={`fa-solid fa-chevron-down text-slate-400 text-xs transition-transform ${expandedSpv === spv.id ? 'rotate-180' : ''}`}></i>
                </button>

                {expandedSpv === spv.id && (
                  <div className="divide-y divide-slate-100">
                    {spv.auditors.map(aud => (
                      <div key={aud.id}>
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
                            <div className="flex items-center gap-2 w-24">
                              <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${aud.avgProgress >= 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${aud.avgProgress}%` }} />
                              </div>
                              <span className="text-[10px] font-bold text-slate-500">{aud.avgProgress}%</span>
                            </div>
                            <i className={`fa-solid fa-chevron-down text-slate-300 text-xs transition-transform ${expandedAuditor === aud.id ? 'rotate-180' : ''}`}></i>
                          </div>
                        </button>

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
                                          <p className="text-[10px] text-slate-400">{r.jam_mulai} - {r.jam_selesai} &bull; Area: {r.area_diaudit}</p>
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
                                      {r.kendala && <p className="text-[10px] text-amber-600 mt-1.5"><i className="fa-solid fa-triangle-exclamation mr-1"></i>{r.kendala}</p>}
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
  );
};

const StatCard: React.FC<{ icon: string; color: string; label: string; value: number }> = ({ icon, color, label, value }) => {
  const colors: Record<string, { bg: string; text: string }> = {
    purple: { bg: 'bg-purple-100', text: 'text-purple-600' },
    blue: { bg: 'bg-blue-100', text: 'text-blue-600' },
    emerald: { bg: 'bg-emerald-100', text: 'text-emerald-600' },
    amber: { bg: 'bg-amber-100', text: 'text-amber-600' },
  };
  const c = colors[color] || colors.purple;
  return (
    <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 ${c.bg} rounded-xl flex items-center justify-center`}>
          <i className={`fa-solid ${icon} ${c.text} text-sm`}></i>
        </div>
        <div>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{label}</p>
          <p className="text-xl font-black text-slate-800">{value}</p>
        </div>
      </div>
    </div>
  );
};

const Empty: React.FC<{ icon: string; text: string }> = ({ icon, text }) => (
  <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
    <i className={`fa-solid ${icon} text-slate-200 text-4xl mb-3`}></i>
    <p className="text-slate-400 font-bold">{text}</p>
  </div>
);

const formatDate = (d: string) => new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

export default MonitraProgressAudit;
