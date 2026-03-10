import React, { useState, useEffect, useMemo, useCallback } from 'react';
import * as monitra from '../../services/monitraService';
import type { AuditorReport, MonitaUser } from '../../services/monitraService';

const MonitraDailyReports: React.FC = () => {
  const [reports, setReports] = useState<AuditorReport[]>([]);
  const [users, setUsers] = useState<MonitaUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [datePreset, setDatePreset] = useState<'today' | '7days' | 'month' | 'all'>('7days');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'Pending' | 'Approved' | 'Rejected'>('all');
  const [approving, setApproving] = useState<number | null>(null);
  const [approveModal, setApproveModal] = useState<{ report: AuditorReport; action: 'Approved' | 'Rejected' } | null>(null);
  const [approveNotes, setApproveNotes] = useState('');
  const [expandedReport, setExpandedReport] = useState<number | null>(null);

  const fetchData = async () => {
    try {
      const [r, u] = await Promise.all([monitra.getAuditorReports(), monitra.getMonitaUsers()]);
      setReports(r);
      setUsers(u);
    } catch (e) {
      console.error('Failed to load reports', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const getDateRange = useCallback((): { from: string; to: string } | null => {
    const today = new Date();
    const fmt = (d: Date) => d.toISOString().split('T')[0];
    if (datePreset === 'today') return { from: fmt(today), to: fmt(today) };
    if (datePreset === '7days') { const d = new Date(today); d.setDate(d.getDate() - 6); return { from: fmt(d), to: fmt(today) }; }
    if (datePreset === 'month') { const d = new Date(today.getFullYear(), today.getMonth(), 1); return { from: fmt(d), to: fmt(today) }; }
    return null;
  }, [datePreset]);

  const filtered = useMemo(() => {
    const range = getDateRange();
    const q = search.toLowerCase().trim();
    return reports.filter(r => {
      if (range && (r.tanggal < range.from || r.tanggal > range.to)) return false;
      if (filterStatus !== 'all' && r.approval_status !== filterStatus) return false;
      if (q && !r.nama_pt.toLowerCase().includes(q) && !r.auditor_name.toLowerCase().includes(q) && !r.deskripsi_pekerjaan.toLowerCase().includes(q) && !r.area_diaudit.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [reports, getDateRange, search, filterStatus]);

  // Group by date
  const grouped = useMemo(() => {
    const map = new Map<string, AuditorReport[]>();
    filtered.forEach(r => {
      if (!map.has(r.tanggal)) map.set(r.tanggal, []);
      map.get(r.tanggal)!.push(r);
    });
    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a));
  }, [filtered]);

  const stats = useMemo(() => ({
    total: filtered.length,
    pending: filtered.filter(r => r.approval_status === 'Pending').length,
    approved: filtered.filter(r => r.approval_status === 'Approved').length,
    rejected: filtered.filter(r => r.approval_status === 'Rejected').length,
  }), [filtered]);

  const handleApprove = async () => {
    if (!approveModal) return;
    setApproving(approveModal.report.id);
    try {
      await monitra.approveReport(approveModal.report.id, approveModal.action, approveNotes || undefined);
      setApproveModal(null);
      setApproveNotes('');
      setLoading(true);
      fetchData();
    } catch (e) {
      alert('Gagal update status: ' + (e instanceof Error ? e.message : 'Unknown'));
    } finally {
      setApproving(null);
    }
  };

  const approvalBadge = (status: string) => {
    const cls = status === 'Approved' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                status === 'Rejected' ? 'bg-red-100 text-red-700 border-red-200' :
                'bg-amber-100 text-amber-700 border-amber-200';
    return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cls}`}>{status}</span>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <i className="fa-solid fa-spinner fa-spin text-indigo-500 text-2xl mr-3"></i>
        <span className="text-slate-500 font-medium">Memuat laporan harian...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStat label="Total Laporan" value={stats.total} color="indigo" />
        <MiniStat label="Pending" value={stats.pending} color="amber" />
        <MiniStat label="Approved" value={stats.approved} color="emerald" />
        <MiniStat label="Rejected" value={stats.rejected} color="red" />
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
        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
          {(['all', 'Pending', 'Approved', 'Rejected'] as const).map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filterStatus === s ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>
              {s === 'all' ? 'Semua' : s}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <i className="fa-solid fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari PT, auditor, area..."
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 outline-none" />
        </div>
        <button onClick={() => { setLoading(true); fetchData(); }}
          className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors flex-shrink-0">
          <i className="fa-solid fa-rotate mr-1.5"></i>Refresh
        </button>
      </div>

      {/* Reports timeline */}
      {grouped.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
          <i className="fa-solid fa-clipboard text-slate-200 text-4xl mb-3"></i>
          <p className="text-slate-400 font-bold">Tidak ada laporan ditemukan</p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([date, reps]) => (
            <div key={date}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 bg-indigo-500 rounded-full"></div>
                <span className="text-xs font-bold text-slate-500">{formatDate(date)}</span>
                <span className="text-[10px] text-slate-400">({reps.length} laporan)</span>
              </div>
              <div className="space-y-3 ml-4 border-l-2 border-slate-100 pl-4">
                {reps.map(r => (
                  <div key={r.id} className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                    {/* Report Header - Clickable */}
                    <button onClick={() => setExpandedReport(expandedReport === r.id ? null : r.id)}
                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors text-left">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <span className="text-emerald-600 font-black text-xs">{r.auditor_name?.[0]}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-slate-800 truncate">{r.auditor_name}</p>
                            <span className="text-[10px] text-slate-400 flex-shrink-0">{r.jam_mulai} - {r.jam_selesai}</span>
                          </div>
                          <p className="text-[11px] text-slate-500 truncate">{r.nama_pt} &bull; {r.area_diaudit}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                        {/* Progress */}
                        <div className="flex items-center gap-1.5 w-16">
                          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${r.progress >= 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${r.progress}%` }} />
                          </div>
                          <span className="text-[9px] font-bold text-slate-400">{r.progress}%</span>
                        </div>
                        {approvalBadge(r.approval_status)}
                        <i className={`fa-solid fa-chevron-down text-slate-300 text-xs transition-transform ${expandedReport === r.id ? 'rotate-180' : ''}`}></i>
                      </div>
                    </button>

                    {/* Expanded detail */}
                    {expandedReport === r.id && (
                      <div className="px-4 pb-4 border-t border-slate-100">
                        <div className="pt-3 space-y-3">
                          <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Deskripsi Pekerjaan</p>
                            <p className="text-xs text-slate-600 whitespace-pre-line">{r.deskripsi_pekerjaan}</p>
                          </div>

                          {r.temuan && (
                            <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                              <p className="text-[10px] font-bold text-red-600 mb-1"><i className="fa-solid fa-magnifying-glass mr-1"></i>Temuan</p>
                              <p className="text-xs text-red-700 whitespace-pre-line">{r.temuan}</p>
                            </div>
                          )}

                          {r.kendala && (
                            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                              <p className="text-[10px] font-bold text-amber-600 mb-1"><i className="fa-solid fa-triangle-exclamation mr-1"></i>Kendala</p>
                              <p className="text-xs text-amber-700 whitespace-pre-line">{r.kendala}</p>
                            </div>
                          )}

                          {r.supervisor_notes && (
                            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                              <p className="text-[10px] font-bold text-blue-600 mb-1"><i className="fa-solid fa-comment mr-1"></i>Catatan Supervisor</p>
                              <p className="text-xs text-blue-700 whitespace-pre-line">{r.supervisor_notes}</p>
                            </div>
                          )}

                          <div className="flex items-center gap-3">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${r.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                              {r.status}
                            </span>
                            <span className="text-[10px] text-slate-400">Dibuat: {new Date(r.created_at).toLocaleString('id-ID')}</span>
                          </div>

                          {/* Approve/Reject buttons */}
                          {r.approval_status === 'Pending' && (
                            <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                              <button onClick={() => { setApproveModal({ report: r, action: 'Approved' }); setApproveNotes(''); }}
                                className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-500/25">
                                <i className="fa-solid fa-check mr-1.5"></i>Approve
                              </button>
                              <button onClick={() => { setApproveModal({ report: r, action: 'Rejected' }); setApproveNotes(''); }}
                                className="px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-bold hover:bg-red-700 transition-colors shadow-lg shadow-red-500/25">
                                <i className="fa-solid fa-xmark mr-1.5"></i>Reject
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Approve/Reject Modal */}
      {approveModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={() => setApproveModal(null)} />
          <div className="relative bg-white rounded-3xl shadow-2xl max-w-md w-full animate-slide-up">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-800">
                {approveModal.action === 'Approved' ? '✅ Approve Laporan' : '❌ Reject Laporan'}
              </h3>
              <button onClick={() => setApproveModal(null)} className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors">
                <i className="fa-solid fa-xmark text-slate-500 text-sm"></i>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-xs text-slate-500"><strong>{approveModal.report.auditor_name}</strong> - {approveModal.report.nama_pt}</p>
                <p className="text-[11px] text-slate-400 mt-1">{approveModal.report.area_diaudit} &bull; {formatDate(approveModal.report.tanggal)}</p>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Catatan (opsional)</label>
                <textarea value={approveNotes} onChange={e => setApproveNotes(e.target.value)} rows={3}
                  className="w-full mt-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 outline-none resize-none"
                  placeholder="Tambahkan catatan..." />
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setApproveModal(null)}
                  className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200 transition-colors">
                  Batal
                </button>
                <button onClick={handleApprove} disabled={approving !== null}
                  className={`flex-1 px-4 py-2.5 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-50 shadow-lg ${
                    approveModal.action === 'Approved'
                      ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/25'
                      : 'bg-red-600 hover:bg-red-700 shadow-red-500/25'
                  }`}>
                  {approving !== null ? <i className="fa-solid fa-spinner fa-spin"></i> : approveModal.action === 'Approved' ? 'Approve' : 'Reject'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const MiniStat: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => {
  const colors: Record<string, string> = {
    indigo: 'bg-indigo-100 text-indigo-600',
    amber: 'bg-amber-100 text-amber-600',
    emerald: 'bg-emerald-100 text-emerald-600',
    red: 'bg-red-100 text-red-600',
  };
  const c = (colors[color] || colors.indigo).split(' ');
  return (
    <div className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm flex items-center gap-3">
      <div className={`w-8 h-8 ${c[0]} rounded-lg flex items-center justify-center`}>
        <span className={`${c[1]} font-black text-sm`}>{value}</span>
      </div>
      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{label}</p>
    </div>
  );
};

const formatDate = (d: string) => new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

export default MonitraDailyReports;
