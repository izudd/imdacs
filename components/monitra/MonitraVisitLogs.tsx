import React, { useState, useEffect, useMemo, useCallback } from 'react';
import * as monitra from '../../services/monitraService';
import type { MonitraVisitLog } from '../../services/monitraService';

const MonitraVisitLogs: React.FC = () => {
  const [visits, setVisits] = useState<MonitraVisitLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [datePreset, setDatePreset] = useState<'today' | '7days' | 'month' | 'all'>('7days');
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'check_in' | 'check_out'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'Pending' | 'Approved' | 'Rejected'>('all');
  const [photoModal, setPhotoModal] = useState<string | null>(null);
  const [approveModal, setApproveModal] = useState<{ visit: MonitraVisitLog; action: 'Approved' | 'Rejected' } | null>(null);
  const [approveNotes, setApproveNotes] = useState('');
  const [approving, setApproving] = useState<number | null>(null);

  const fetchData = async () => {
    try {
      const data = await monitra.getVisitLogs();
      setVisits(data);
    } catch (e) {
      console.error('Failed to load visits', e);
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
    return visits.filter(v => {
      const vDate = v.timestamp.split('T')[0];
      if (range && (vDate < range.from || vDate > range.to)) return false;
      if (filterType !== 'all' && v.type !== filterType) return false;
      if (filterStatus !== 'all' && v.approval_status !== filterStatus) return false;
      if (q && !v.nama_pt.toLowerCase().includes(q) && !v.auditor_name.toLowerCase().includes(q) && !v.notes.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [visits, getDateRange, search, filterType, filterStatus]);

  // Group by date
  const grouped = useMemo(() => {
    const map = new Map<string, MonitraVisitLog[]>();
    filtered.forEach(v => {
      const date = v.timestamp.split('T')[0];
      if (!map.has(date)) map.set(date, []);
      map.get(date)!.push(v);
    });
    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a));
  }, [filtered]);

  const stats = useMemo(() => ({
    total: filtered.length,
    checkin: filtered.filter(v => v.type === 'check_in').length,
    checkout: filtered.filter(v => v.type === 'check_out').length,
    pending: filtered.filter(v => v.approval_status === 'Pending').length,
  }), [filtered]);

  const handleApprove = async () => {
    if (!approveModal) return;
    setApproving(approveModal.visit.id);
    try {
      await monitra.approveVisit(approveModal.visit.id, approveModal.action, approveNotes || undefined);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <i className="fa-solid fa-spinner fa-spin text-indigo-500 text-2xl mr-3"></i>
        <span className="text-slate-500 font-medium">Memuat data kunjungan...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStat label="Total" value={stats.total} icon="fa-location-dot" color="indigo" />
        <MiniStat label="Check In" value={stats.checkin} icon="fa-right-to-bracket" color="emerald" />
        <MiniStat label="Check Out" value={stats.checkout} icon="fa-right-from-bracket" color="blue" />
        <MiniStat label="Pending" value={stats.pending} icon="fa-hourglass-half" color="amber" />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
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
          {(['all', 'check_in', 'check_out'] as const).map(t => (
            <button key={t} onClick={() => setFilterType(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filterType === t ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>
              {t === 'all' ? 'Semua' : t === 'check_in' ? 'Check In' : 'Check Out'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
          {(['all', 'Pending', 'Approved', 'Rejected'] as const).map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filterStatus === s ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>
              {s === 'all' ? 'Status' : s}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <i className="fa-solid fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari PT, auditor..."
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 outline-none" />
        </div>
        <button onClick={() => { setLoading(true); fetchData(); }}
          className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors flex-shrink-0">
          <i className="fa-solid fa-rotate mr-1.5"></i>Refresh
        </button>
      </div>

      {/* Visit List */}
      {grouped.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
          <i className="fa-solid fa-location-dot text-slate-200 text-4xl mb-3"></i>
          <p className="text-slate-400 font-bold">Tidak ada kunjungan ditemukan</p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([date, items]) => (
            <div key={date}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                <span className="text-xs font-bold text-slate-500">{formatDate(date)}</span>
                <span className="text-[10px] text-slate-400">({items.length} kunjungan)</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 ml-4 border-l-2 border-slate-100 pl-4">
                {items.map(v => (
                  <div key={v.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          v.type === 'check_in' ? 'bg-emerald-100' : 'bg-blue-100'
                        }`}>
                          <i className={`fa-solid ${v.type === 'check_in' ? 'fa-right-to-bracket text-emerald-600' : 'fa-right-from-bracket text-blue-600'} text-xs`}></i>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-800 truncate">{v.auditor_name}</p>
                          <p className="text-[10px] text-slate-400">{v.nama_pt}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          v.type === 'check_in' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {v.type === 'check_in' ? 'IN' : 'OUT'}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          v.approval_status === 'Approved' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                          v.approval_status === 'Rejected' ? 'bg-red-100 text-red-700 border-red-200' :
                          'bg-amber-100 text-amber-700 border-amber-200'
                        }`}>{v.approval_status}</span>
                      </div>
                    </div>

                    <p className="text-[10px] text-slate-400 mb-2">
                      <i className="fa-solid fa-clock mr-1"></i>
                      {new Date(v.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                    </p>

                    {v.notes && (
                      <p className="text-xs text-slate-600 mb-2 line-clamp-2">
                        <i className="fa-solid fa-comment text-slate-400 mr-1"></i>{v.notes}
                      </p>
                    )}

                    {/* Photo + GPS row */}
                    <div className="flex items-center gap-2 mb-2">
                      {v.photo && (
                        <button onClick={() => setPhotoModal(v.photo)}
                          className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg text-[10px] font-bold transition-colors">
                          <i className="fa-solid fa-camera mr-1"></i>Lihat Foto
                        </button>
                      )}
                      {v.latitude && v.longitude && (
                        <a href={`https://maps.google.com/?q=${v.latitude},${v.longitude}`} target="_blank" rel="noopener noreferrer"
                          className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg text-[10px] font-bold transition-colors">
                          <i className="fa-solid fa-map-marker-alt mr-1"></i>Lokasi GPS
                        </a>
                      )}
                    </div>

                    {v.supervisor_notes && (
                      <div className="bg-blue-50 rounded-lg p-2 mb-2">
                        <p className="text-[10px] text-blue-700"><i className="fa-solid fa-comment mr-1"></i>{v.supervisor_notes}</p>
                      </div>
                    )}

                    {/* Approve/Reject */}
                    {v.approval_status === 'Pending' && (
                      <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                        <button onClick={() => { setApproveModal({ visit: v, action: 'Approved' }); setApproveNotes(''); }}
                          className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-[10px] font-bold hover:bg-emerald-700 transition-colors">
                          <i className="fa-solid fa-check mr-1"></i>Approve
                        </button>
                        <button onClick={() => { setApproveModal({ visit: v, action: 'Rejected' }); setApproveNotes(''); }}
                          className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-[10px] font-bold hover:bg-red-700 transition-colors">
                          <i className="fa-solid fa-xmark mr-1"></i>Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Photo Modal */}
      {photoModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setPhotoModal(null)} />
          <div className="relative max-w-2xl w-full max-h-[90vh]">
            <button onClick={() => setPhotoModal(null)}
              className="absolute -top-10 right-0 w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center hover:bg-white/40 transition-colors z-10">
              <i className="fa-solid fa-xmark text-white text-sm"></i>
            </button>
            <img
              src={photoModal.startsWith('data:') || photoModal.startsWith('http') ? photoModal : `https://monitra.assetsmanagement.shop${photoModal}`}
              alt="Foto Kunjungan"
              className="w-full h-auto max-h-[85vh] object-contain rounded-2xl"
              onError={e => { (e.target as HTMLImageElement).src = ''; (e.target as HTMLImageElement).alt = 'Gagal memuat foto'; }}
            />
          </div>
        </div>
      )}

      {/* Approve/Reject Modal */}
      {approveModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={() => setApproveModal(null)} />
          <div className="relative bg-white rounded-3xl shadow-2xl max-w-md w-full animate-slide-up">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-800">
                {approveModal.action === 'Approved' ? '✅ Approve Kunjungan' : '❌ Reject Kunjungan'}
              </h3>
              <button onClick={() => setApproveModal(null)} className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors">
                <i className="fa-solid fa-xmark text-slate-500 text-sm"></i>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-xs text-slate-500">
                  <strong>{approveModal.visit.auditor_name}</strong> - {approveModal.visit.nama_pt}
                  <span className="ml-2 text-[10px] text-slate-400">{approveModal.visit.type === 'check_in' ? 'Check In' : 'Check Out'}</span>
                </p>
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
                    approveModal.action === 'Approved' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/25' : 'bg-red-600 hover:bg-red-700 shadow-red-500/25'
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

const MiniStat: React.FC<{ label: string; value: number; icon: string; color: string }> = ({ label, value, icon, color }) => {
  const colors: Record<string, string> = {
    indigo: 'bg-indigo-100 text-indigo-600', emerald: 'bg-emerald-100 text-emerald-600',
    blue: 'bg-blue-100 text-blue-600', amber: 'bg-amber-100 text-amber-600',
  };
  const c = (colors[color] || colors.indigo).split(' ');
  return (
    <div className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm flex items-center gap-3">
      <div className={`w-8 h-8 ${c[0]} rounded-lg flex items-center justify-center`}>
        <i className={`fa-solid ${icon} ${c[1]} text-xs`}></i>
      </div>
      <div>
        <p className="text-xl font-black text-slate-800">{value}</p>
        <p className="text-[9px] text-slate-400 font-bold uppercase">{label}</p>
      </div>
    </div>
  );
};

const formatDate = (d: string) => new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

export default MonitraVisitLogs;
