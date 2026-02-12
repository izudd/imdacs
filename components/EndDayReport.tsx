
import React, { useState, useEffect } from 'react';
import { User, Client, Activity, ActivityType, ReportStatus } from '../types';
import * as api from '../services/apiService';

interface EndDayReportProps {
  user: User;
  clients: Client[];
  activities: Activity[];
  onRefresh: () => void;
  onNavigate?: (tab: string) => void;
}

const ACTIVITY_COLORS: Record<string, { bg: string; icon: string; text: string; border: string }> = {
  CHAT_DM: { bg: 'bg-green-50', icon: 'fa-brands fa-whatsapp text-green-500', text: 'text-green-700', border: 'border-green-200' },
  CALL: { bg: 'bg-blue-50', icon: 'fa-solid fa-phone text-blue-500', text: 'text-blue-700', border: 'border-blue-200' },
  VISIT: { bg: 'bg-purple-50', icon: 'fa-solid fa-location-dot text-purple-500', text: 'text-purple-700', border: 'border-purple-200' },
  MEETING: { bg: 'bg-indigo-50', icon: 'fa-solid fa-users text-indigo-500', text: 'text-indigo-700', border: 'border-indigo-200' },
  POSTING: { bg: 'bg-orange-50', icon: 'fa-solid fa-share-nodes text-orange-500', text: 'text-orange-700', border: 'border-orange-200' },
};

const EndDayReport: React.FC<EndDayReportProps> = ({ user, clients, activities, onRefresh, onNavigate }) => {
  const [isSuccess, setIsSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [existingStatus, setExistingStatus] = useState<string>('');

  const today = new Date().toISOString().split('T')[0];
  const myTodayActivities = activities
    .filter(a => a.marketingId === user.id && a.date === today)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const myClients = clients.filter(c => c.marketingId === user.id);

  const [summary, setSummary] = useState('');
  const [constraints, setConstraints] = useState('');
  const [planTomorrow, setPlanTomorrow] = useState('');

  // Check if already submitted today
  useEffect(() => {
    api.getReports({ date: today, marketing_id: user.id }).then((reports) => {
      if (reports.length > 0) {
        const r = reports[0];
        setAlreadySubmitted(true);
        setExistingStatus(r.status);
        if (r.summary) setSummary(r.summary);
        if (r.constraints) setConstraints(r.constraints);
        if (r.planTomorrow) setPlanTomorrow(r.planTomorrow);
      }
    }).catch(console.error);
  }, [today, user.id]);

  const handleSubmit = async () => {
    if (!summary.trim()) { alert('Ringkasan kegiatan wajib diisi'); return; }
    if (myTodayActivities.length === 0) {
      if (!confirm('Belum ada aktivitas hari ini. Tetap submit report?')) return;
    }
    setIsSaving(true);
    try {
      await api.submitReport({
        date: today, marketingId: user.id, summary,
        newLeads: 0,
        followUps: myTodayActivities.filter(a => a.type === ActivityType.CHAT_DM || a.type === ActivityType.CALL).length,
        dealsToday: 0, dealValue: 0, constraints, supportNeeded: '', planTomorrow,
        status: ReportStatus.SUBMITTED,
        progressUpdates: [],
      });
      setIsSuccess(true); onRefresh();
    } catch (err: unknown) {
      alert('Gagal submit report: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally { setIsSaving(false); }
  };

  const getClientName = (clientId?: string) => {
    if (!clientId) return null;
    return clients.find(c => c.id === clientId)?.name || null;
  };

  const visitCount = myTodayActivities.filter(a => a.type === ActivityType.VISIT).length;
  const chatCallCount = myTodayActivities.filter(a => a.type === ActivityType.CHAT_DM || a.type === ActivityType.CALL).length;
  const meetingCount = myTodayActivities.filter(a => a.type === ActivityType.MEETING).length;

  const generateSummary = () => {
    if (myTodayActivities.length === 0) return;
    const lines = myTodayActivities.map(a => {
      const client = getClientName(a.clientId);
      const typeLabel = a.type === 'CHAT_DM' ? 'Chat/WA' : a.type === 'CALL' ? 'Telepon' : a.type === 'VISIT' ? 'Visit' : a.type === 'MEETING' ? 'Meeting' : 'Posting';
      return `- ${typeLabel}${client ? ` ke ${client}` : ''}: ${a.description}`;
    });
    setSummary(lines.join('\n'));
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Already submitted banner */}
      {alreadySubmitted && (
        <div className={`border p-4 rounded-2xl flex items-start gap-3 ${
          existingStatus === 'APPROVED' ? 'bg-green-50 border-green-200' :
          existingStatus === 'REVISION' ? 'bg-red-50 border-red-200' :
          'bg-blue-50 border-blue-200'
        }`}>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
            existingStatus === 'APPROVED' ? 'bg-green-100' :
            existingStatus === 'REVISION' ? 'bg-red-100' : 'bg-blue-100'
          }`}>
            <i className={`fa-solid ${
              existingStatus === 'APPROVED' ? 'fa-circle-check text-green-600' :
              existingStatus === 'REVISION' ? 'fa-rotate-left text-red-600' :
              'fa-clock text-blue-600'
            } text-sm`}></i>
          </div>
          <div>
            <p className={`font-bold text-sm ${
              existingStatus === 'APPROVED' ? 'text-green-800' :
              existingStatus === 'REVISION' ? 'text-red-800' : 'text-blue-800'
            }`}>
              {existingStatus === 'APPROVED' ? 'Laporan Hari Ini Sudah Di-approve' :
               existingStatus === 'REVISION' ? 'Laporan Perlu Revisi — Update dan submit ulang' :
               'Laporan Hari Ini Sudah Disubmit'}
            </p>
            <p className={`text-xs mt-0.5 ${
              existingStatus === 'APPROVED' ? 'text-green-600' :
              existingStatus === 'REVISION' ? 'text-red-600' : 'text-blue-600'
            }`}>
              {existingStatus === 'REVISION'
                ? 'Manager meminta revisi. Silakan update dan submit ulang.'
                : 'Submit ulang akan meng-update laporan yang sudah ada.'}
            </p>
          </div>
        </div>
      )}

      {/* Main report card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 p-6 lg:p-8 text-white">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold mb-1">Daily Report</h1>
              <p className="text-slate-400 text-sm">Laporan aktivitas harian ke Manager</p>
            </div>
            <div className="text-left sm:text-right">
              <div className="text-lg font-mono text-indigo-400 font-bold">{today}</div>
              <div className="text-xs text-slate-500 mt-0.5">by {user.name}</div>
            </div>
          </div>
        </div>

        <div className="p-5 lg:p-8 space-y-8">
          {/* Section A: Quick Stats */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-bold">A</div>
              <h3 className="text-sm font-bold text-slate-800">Ringkasan Hari Ini</h3>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 text-center">
                <p className="text-2xl font-bold text-slate-800">{myTodayActivities.length}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Total Aktivitas</p>
              </div>
              <div className="p-4 bg-purple-50 rounded-xl border border-purple-100 text-center">
                <p className="text-2xl font-bold text-purple-600">{visitCount}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Visit</p>
              </div>
              <div className="p-4 bg-green-50 rounded-xl border border-green-100 text-center">
                <p className="text-2xl font-bold text-green-600">{chatCallCount}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">WA / Call</p>
              </div>
              <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100 text-center">
                <p className="text-2xl font-bold text-indigo-600">{meetingCount}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Meeting</p>
              </div>
              <div className="p-4 bg-amber-50 rounded-xl border border-amber-100 text-center">
                <p className="text-2xl font-bold text-amber-600">{myClients.length}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Client</p>
              </div>
            </div>
          </section>

          {/* Section B: Timeline */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-bold">B</div>
                <h3 className="text-sm font-bold text-slate-800">Timeline Aktivitas</h3>
                <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-lg font-medium">{myTodayActivities.length} aktivitas</span>
              </div>
              {myTodayActivities.length > 0 && (
                <button onClick={() => onNavigate?.('activity')} className="text-[11px] text-indigo-600 font-bold hover:text-indigo-700 flex items-center gap-1">
                  <i className="fa-solid fa-plus text-[9px]"></i>Tambah
                </button>
              )}
            </div>

            {myTodayActivities.length > 0 ? (
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-[19px] top-4 bottom-4 w-0.5 bg-slate-100"></div>

                <div className="space-y-3">
                  {myTodayActivities.map((activity) => {
                    const colors = ACTIVITY_COLORS[activity.type] || ACTIVITY_COLORS.CHAT_DM;
                    const clientName = getClientName(activity.clientId);
                    return (
                      <div key={activity.id} className="relative flex gap-4">
                        {/* Timeline dot */}
                        <div className={`w-10 h-10 rounded-xl ${colors.bg} border ${colors.border} flex items-center justify-center flex-shrink-0 z-10`}>
                          <i className={`${colors.icon} text-sm`}></i>
                        </div>

                        {/* Content */}
                        <div className={`flex-1 ${colors.bg} border ${colors.border} rounded-xl p-4 hover:shadow-sm transition-shadow`}>
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-[10px] font-bold uppercase ${colors.text}`}>
                                {activity.type.replace('_', '/')}
                              </span>
                              {clientName && (
                                <span className="text-[10px] bg-white/80 text-slate-600 px-2 py-0.5 rounded-md font-medium border border-slate-100">
                                  <i className="fa-solid fa-building text-[8px] mr-1 text-slate-400"></i>{clientName}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono flex-shrink-0">
                              {activity.startTime?.slice(0, 5)} - {activity.endTime?.slice(0, 5)}
                            </span>
                          </div>
                          <p className="text-xs text-slate-700 leading-relaxed">{activity.description}</p>
                          {activity.location && activity.location !== '-' && (
                            <p className="text-[10px] text-slate-400 mt-1.5 flex items-center gap-1">
                              <i className="fa-solid fa-map-pin text-[8px]"></i>{activity.location}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-10 text-center">
                <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center mx-auto mb-3 border border-slate-100">
                  <i className="fa-solid fa-timeline text-slate-300 text-xl"></i>
                </div>
                <p className="text-sm font-medium text-slate-500">Belum ada aktivitas hari ini</p>
                <p className="text-xs text-slate-400 mt-1">Log aktivitas dulu di Daily Log atau Quick Log</p>
                <div className="flex items-center justify-center gap-2 mt-4">
                  <button onClick={() => onNavigate?.('activity')}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-500 transition-all flex items-center gap-1.5">
                    <i className="fa-solid fa-list-check text-[10px]"></i>Daily Log
                  </button>
                  <button onClick={() => onNavigate?.('quicklog')}
                    className="px-4 py-2 bg-white text-slate-700 border border-slate-200 rounded-xl text-xs font-bold hover:bg-slate-50 transition-all flex items-center gap-1.5">
                    <i className="fa-solid fa-bolt text-amber-500 text-[10px]"></i>Quick Log
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Section C: Summary */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-bold">C</div>
                <h3 className="text-sm font-bold text-slate-800">Ringkasan & Catatan *</h3>
              </div>
              {myTodayActivities.length > 0 && (
                <button onClick={generateSummary}
                  className="text-[11px] text-indigo-600 font-bold hover:text-indigo-700 flex items-center gap-1 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100 transition-colors hover:bg-indigo-100">
                  <i className="fa-solid fa-wand-magic-sparkles text-[10px]"></i>Auto-generate
                </button>
              )}
            </div>
            <textarea value={summary} onChange={(e) => setSummary(e.target.value)}
              className="w-full border border-slate-200 p-4 rounded-xl min-h-[120px] focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 outline-none text-sm transition-all resize-none"
              placeholder="Tuliskan ringkasan kegiatan Anda hari ini, atau klik Auto-generate untuk buat otomatis dari timeline..." />
          </section>

          {/* Section D & E */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <section>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-red-50 text-red-500 flex items-center justify-center text-[10px] font-bold">D</div>
                <h3 className="text-sm font-bold text-slate-800">Kendala & Catatan</h3>
              </div>
              <textarea className="w-full border border-slate-200 p-3 rounded-xl text-sm h-24 focus:border-red-300 outline-none resize-none transition-all"
                placeholder="Apa kesulitan yang Anda hadapi hari ini?"
                value={constraints} onChange={(e) => setConstraints(e.target.value)} />
            </section>
            <section>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-green-50 text-green-500 flex items-center justify-center text-[10px] font-bold">E</div>
                <h3 className="text-sm font-bold text-slate-800">Rencana Besok</h3>
              </div>
              <textarea className="w-full border border-slate-200 p-3 rounded-xl text-sm h-24 focus:border-green-300 outline-none resize-none transition-all"
                placeholder="Apa target utama Anda besok?"
                value={planTomorrow} onChange={(e) => setPlanTomorrow(e.target.value)} />
            </section>
          </div>

          {/* Submit */}
          <div className="pt-6 border-t border-slate-100 flex flex-col items-center">
            <p className="text-[11px] text-slate-400 mb-4 text-center max-w-md leading-relaxed">
              Timeline aktivitas di atas akan otomatis dilampirkan dalam laporan ini.
            </p>
            <button onClick={handleSubmit} disabled={isSaving}
              className="w-full sm:w-auto px-12 py-4 bg-gradient-to-r from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 disabled:opacity-50 text-white rounded-2xl font-bold shadow-xl transition-all active:scale-[0.98] text-sm flex items-center justify-center gap-2">
              {isSaving ? (
                <><i className="fa-solid fa-spinner fa-spin"></i>Submitting...</>
              ) : (
                <><i className="fa-solid fa-paper-plane"></i>Submit Report</>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Success Modal */}
      {isSuccess && (
        <div className="fixed inset-0 bg-black/60 glass z-[100] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl p-8 lg:p-10 text-center max-w-sm w-full animate-scale-in shadow-2xl">
            <div className="w-20 h-20 bg-gradient-to-br from-green-400 to-emerald-500 text-white rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-green-500/25 rotate-3">
              <i className="fa-solid fa-check text-3xl"></i>
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Report Submitted!</h2>
            <p className="text-slate-500 text-sm mb-8 leading-relaxed">Terima kasih atas dedikasi Anda hari ini. Selamat beristirahat.</p>
            <button onClick={() => { setIsSuccess(false); if (onNavigate) onNavigate('dashboard'); }}
              className="w-full py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold transition-colors text-sm">
              Kembali ke Dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default EndDayReport;
