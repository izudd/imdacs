import React, { useState, useEffect, useMemo } from 'react';
import * as monitra from '../../services/monitraService';
import type { MonitraStats, MonitraProgress } from '../../services/monitraService';

const MonitraDashboard: React.FC = () => {
  const [stats, setStats] = useState<MonitraStats | null>(null);
  const [progress, setProgress] = useState<MonitraProgress[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [s, p] = await Promise.all([monitra.getStats(), monitra.getProgress()]);
        setStats(s);
        setProgress(p);
      } catch (e) {
        console.error('Failed to load dashboard', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Group progress by PT
  const ptGroups = useMemo(() => {
    const map = new Map<number, { nama_pt: string; periode_start: string | null; periode_end: string | null; auditors: MonitraProgress[] }>();
    progress.forEach(p => {
      if (!map.has(p.pt_id)) {
        map.set(p.pt_id, { nama_pt: p.nama_pt, periode_start: p.periode_start, periode_end: p.periode_end, auditors: [] });
      }
      map.get(p.pt_id)!.auditors.push(p);
    });
    return Array.from(map.values());
  }, [progress]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <i className="fa-solid fa-spinner fa-spin text-indigo-500 text-2xl mr-3"></i>
        <span className="text-slate-500 font-medium">Memuat dashboard...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon="fa-building" color="indigo" label="Total PT" value={stats?.totalPT ?? 0} />
        <StatCard icon="fa-users" color="blue" label="Auditor Aktif" value={stats?.totalAuditors ?? 0} />
        <StatCard icon="fa-hourglass-half" color="amber" label="Pending Approval" value={stats?.pendingApprovals ?? 0} />
        <StatCard icon="fa-magnifying-glass" color="red" label="Total Temuan" value={stats?.totalFindings ?? 0} />
      </div>

      {/* PT Progress Overview */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-black text-slate-800">Progress Audit per PT</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">{ptGroups.length} perusahaan aktif</p>
          </div>
        </div>

        {ptGroups.length === 0 ? (
          <div className="p-12 text-center">
            <i className="fa-solid fa-chart-pie text-slate-200 text-4xl mb-3"></i>
            <p className="text-slate-400 font-bold text-sm">Belum ada data progress</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {ptGroups.map((pt, idx) => {
              const avgProgress = pt.auditors.length > 0
                ? Math.round(pt.auditors.reduce((s, a) => s + a.latest_progress, 0) / pt.auditors.length)
                : 0;
              const totalReports = pt.auditors.reduce((s, a) => s + a.total_reports, 0);
              const pendingReports = pt.auditors.reduce((s, a) => s + a.pending_reports, 0);
              const approvedReports = pt.auditors.reduce((s, a) => s + a.approved_reports, 0);

              return (
                <div key={idx} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-800">{pt.nama_pt}</p>
                      <p className="text-[10px] text-slate-400">
                        {pt.auditors.length} auditor &bull; {totalReports} laporan
                        {pt.periode_start && ` • ${formatDate(pt.periode_start)} - ${pt.periode_end ? formatDate(pt.periode_end) : 'Sekarang'}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {pendingReports > 0 && (
                        <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                          {pendingReports} pending
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${avgProgress >= 100 ? 'bg-emerald-500' : avgProgress >= 60 ? 'bg-indigo-500' : 'bg-amber-500'}`}
                        style={{ width: `${Math.min(avgProgress, 100)}%` }}
                      />
                    </div>
                    <span className="text-xs font-black text-slate-600 w-10 text-right">{avgProgress}%</span>
                  </div>

                  {/* Auditor chips */}
                  <div className="flex flex-wrap gap-2">
                    {pt.auditors.map(aud => (
                      <div key={aud.auditor_id} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-1.5">
                        <div className="w-5 h-5 bg-indigo-100 rounded flex items-center justify-center">
                          <span className="text-indigo-600 font-black text-[9px]">{aud.auditor_name?.[0]}</span>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-700">{aud.auditor_name}</p>
                          <p className="text-[9px] text-slate-400">
                            {aud.latest_progress}% &bull; {aud.approved_reports}/{aud.total_reports} approved
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick Stats - PT Progress Chart */}
      {stats && stats.ptProgress && stats.ptProgress.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 className="text-sm font-black text-slate-800 mb-4">Progress Terakhir per PT</h3>
          <div className="space-y-3">
            {stats.ptProgress.map(pt => (
              <div key={pt.pt_id} className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-600 w-40 truncate">{pt.nama_pt}</span>
                <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${pt.latest_progress >= 100 ? 'bg-emerald-500' : pt.latest_progress >= 60 ? 'bg-indigo-500' : 'bg-amber-500'}`}
                    style={{ width: `${Math.min(pt.latest_progress, 100)}%` }}
                  />
                </div>
                <span className="text-xs font-black text-slate-500 w-10 text-right">{pt.latest_progress}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Helper components
const StatCard: React.FC<{ icon: string; color: string; label: string; value: number }> = ({ icon, color, label, value }) => {
  const colors: Record<string, { bg: string; text: string }> = {
    indigo: { bg: 'bg-indigo-100', text: 'text-indigo-600' },
    blue: { bg: 'bg-blue-100', text: 'text-blue-600' },
    amber: { bg: 'bg-amber-100', text: 'text-amber-600' },
    red: { bg: 'bg-red-100', text: 'text-red-600' },
    emerald: { bg: 'bg-emerald-100', text: 'text-emerald-600' },
    purple: { bg: 'bg-purple-100', text: 'text-purple-600' },
  };
  const c = colors[color] || colors.indigo;
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

const formatDate = (d: string) => new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

export default MonitraDashboard;
