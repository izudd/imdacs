import React, { useState, useEffect, useMemo } from 'react';
import * as monitra from '../../services/monitraService';
import type { MonitraArchivePT, AuditorReport } from '../../services/monitraService';

const MonitraArchive: React.FC = () => {
  const [archives, setArchives] = useState<MonitraArchivePT[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedPT, setExpandedPT] = useState<number | null>(null);
  const [ptReports, setPtReports] = useState<AuditorReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [restoring, setRestoring] = useState<number | null>(null);

  const fetchArchives = async () => {
    try {
      const data = await monitra.getArchive();
      setArchives(data);
    } catch (e) {
      console.error('Failed to load archives', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchArchives(); }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return archives;
    const q = search.toLowerCase();
    return archives.filter(a =>
      a.nama_pt.toLowerCase().includes(q) ||
      (a.auditor_names || '').toLowerCase().includes(q)
    );
  }, [archives, search]);

  const handleExpand = async (ptId: number) => {
    if (expandedPT === ptId) {
      setExpandedPT(null);
      setPtReports([]);
      return;
    }
    setExpandedPT(ptId);
    setLoadingReports(true);
    try {
      const reports = await monitra.getArchiveReports(ptId);
      setPtReports(reports);
    } catch (e) {
      console.error('Failed to load archive reports', e);
      setPtReports([]);
    } finally {
      setLoadingReports(false);
    }
  };

  const handleRestore = async (ptId: number) => {
    setRestoring(ptId);
    try {
      await monitra.restorePT(ptId);
      setLoading(true);
      fetchArchives();
    } catch (e) {
      alert('Gagal restore PT: ' + (e instanceof Error ? e.message : 'Unknown'));
    } finally {
      setRestoring(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <i className="fa-solid fa-spinner fa-spin text-indigo-500 text-2xl mr-3"></i>
        <span className="text-slate-500 font-medium">Memuat arsip PT...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
              <i className="fa-solid fa-box-archive text-slate-500 text-sm"></i>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Arsip</p>
              <p className="text-xl font-black text-slate-800">{archives.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
              <i className="fa-solid fa-clipboard-check text-emerald-600 text-sm"></i>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Laporan</p>
              <p className="text-xl font-black text-slate-800">{archives.reduce((s, a) => s + a.total_reports, 0)}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
              <i className="fa-solid fa-magnifying-glass text-red-600 text-sm"></i>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Temuan</p>
              <p className="text-xl font-black text-slate-800">{archives.reduce((s, a) => s + a.total_findings, 0)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <i className="fa-solid fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari PT, auditor..."
          className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 outline-none" />
      </div>

      {/* Archive List */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
          <i className="fa-solid fa-box-open text-slate-200 text-4xl mb-3"></i>
          <p className="text-slate-400 font-bold">Belum ada PT diarsipkan</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(pt => (
            <div key={pt.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              {/* PT Header */}
              <button onClick={() => handleExpand(pt.id)}
                className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <i className="fa-solid fa-building text-slate-500 text-sm"></i>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-800 truncate">{pt.nama_pt}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-[10px] text-slate-400">
                        <i className="fa-solid fa-users mr-1"></i>{pt.total_auditors} auditor
                      </span>
                      <span className="text-[10px] text-slate-400">
                        <i className="fa-solid fa-clipboard mr-1"></i>{pt.total_reports} laporan
                      </span>
                      <span className="text-[10px] text-slate-400">
                        <i className="fa-solid fa-magnifying-glass mr-1"></i>{pt.total_findings} temuan
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                  {/* Progress */}
                  <div className="flex items-center gap-2 w-20">
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${pt.final_progress >= 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                        style={{ width: `${Math.min(pt.final_progress, 100)}%` }} />
                    </div>
                    <span className="text-[10px] font-bold text-slate-500">{pt.final_progress}%</span>
                  </div>
                  {pt.archived_at && (
                    <span className="text-[9px] text-slate-400">{formatDate(pt.archived_at)}</span>
                  )}
                  <i className={`fa-solid fa-chevron-down text-slate-300 text-xs transition-transform ${expandedPT === pt.id ? 'rotate-180' : ''}`}></i>
                </div>
              </button>

              {/* Expanded Content */}
              {expandedPT === pt.id && (
                <div className="border-t border-slate-100 px-5 py-4">
                  {/* Auditor names */}
                  {pt.auditor_names && (
                    <div className="mb-3">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Tim Auditor</p>
                      <div className="flex flex-wrap gap-1">
                        {pt.auditor_names.split(',').map((name, i) => (
                          <span key={i} className="bg-indigo-50 text-indigo-600 text-[10px] font-semibold px-2 py-0.5 rounded-full">{name.trim()}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Restore button */}
                  <div className="mb-3">
                    <button onClick={() => handleRestore(pt.id)} disabled={restoring === pt.id}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50 shadow-lg shadow-indigo-500/25">
                      {restoring === pt.id ? <i className="fa-solid fa-spinner fa-spin"></i> : <><i className="fa-solid fa-rotate-left mr-1.5"></i>Restore PT</>}
                    </button>
                  </div>

                  {/* Reports */}
                  {loadingReports ? (
                    <div className="flex items-center justify-center py-8">
                      <i className="fa-solid fa-spinner fa-spin text-indigo-500 mr-2"></i>
                      <span className="text-slate-400 text-sm">Memuat laporan...</span>
                    </div>
                  ) : ptReports.length === 0 ? (
                    <p className="text-slate-400 text-xs text-center py-4">Tidak ada laporan tersimpan</p>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Laporan ({ptReports.length})</p>
                      {ptReports.map(r => (
                        <div key={r.id} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-slate-700">{r.auditor_name} - {formatDate(r.tanggal)}</p>
                              <p className="text-[10px] text-slate-400">{r.jam_mulai} - {r.jam_selesai} &bull; {r.area_diaudit}</p>
                            </div>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              r.approval_status === 'Approved' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                              r.approval_status === 'Rejected' ? 'bg-red-100 text-red-700 border-red-200' :
                              'bg-amber-100 text-amber-700 border-amber-200'
                            }`}>{r.approval_status}</span>
                          </div>
                          <p className="text-xs text-slate-600 line-clamp-2">{r.deskripsi_pekerjaan}</p>
                          {r.temuan && (
                            <p className="text-[10px] text-red-600 mt-1"><i className="fa-solid fa-triangle-exclamation mr-1"></i>{r.temuan}</p>
                          )}
                          <div className="flex items-center gap-2 mt-2">
                            <div className="flex-1 h-1 bg-slate-200 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${r.progress >= 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${r.progress}%` }} />
                            </div>
                            <span className="text-[9px] font-bold text-slate-400">{r.progress}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const formatDate = (d: string) => new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

export default MonitraArchive;
