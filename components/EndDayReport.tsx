
import React, { useState, useEffect } from 'react';
import { User, Client, Activity, ActivityType, ClientStatus, ClientProgressUpdate, ReportStatus } from '../types';
import * as api from '../services/apiService';

interface EndDayReportProps {
  user: User;
  clients: Client[];
  activities: Activity[];
  onRefresh: () => void;
  onNavigate?: (tab: string) => void;
}

const EndDayReport: React.FC<EndDayReportProps> = ({ user, clients, activities, onRefresh, onNavigate }) => {
  const [isSuccess, setIsSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [existingStatus, setExistingStatus] = useState<string>('');

  const today = new Date().toISOString().split('T')[0];
  const myTodayActivities = activities.filter(a => a.marketingId === user.id && a.date === today);
  const myClients = clients.filter(c => c.marketingId === user.id);

  const [summary, setSummary] = useState('');
  const [constraints, setConstraints] = useState('');
  const [planTomorrow, setPlanTomorrow] = useState('');
  const [progressUpdates, setProgressUpdates] = useState<Array<{
    clientId: string; clientName: string; prevStatus: ClientStatus; newStatus: ClientStatus; result: string;
  }>>([]);

  // Check if already submitted today
  useEffect(() => {
    api.getReports({ date: today, marketing_id: user.id }).then((reports) => {
      if (reports.length > 0) {
        const r = reports[0];
        setAlreadySubmitted(true);
        setExistingStatus(r.status);
      }
    }).catch(console.error);
  }, [today, user.id]);

  // Stable key: only rebuild when client list membership changes, not on every render
  const clientKey = myClients.map(c => `${c.id}:${c.status}`).join(',');
  useEffect(() => {
    const updates = myClients.map(c => ({
      clientId: c.id, clientName: c.name, prevStatus: c.status, newStatus: c.status, result: '',
    }));
    setProgressUpdates(updates);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientKey]);

  const handleProgressChange = (index: number, field: string, value: string) => {
    setProgressUpdates(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleSubmit = async () => {
    if (!summary.trim()) { alert('Ringkasan kegiatan wajib diisi'); return; }
    setIsSaving(true);
    try {
      await api.submitReport({
        date: today, marketingId: user.id, summary,
        newLeads: 0, followUps: myTodayActivities.filter(a => a.type === ActivityType.CHAT_DM || a.type === ActivityType.CALL).length,
        dealsToday: 0, dealValue: 0, constraints, supportNeeded: '', planTomorrow,
        status: ReportStatus.SUBMITTED,
        progressUpdates: progressUpdates.map(u => ({
          clientId: u.clientId, activity: '', prevStatus: u.prevStatus, newStatus: u.newStatus, result: u.result,
        })),
      });
      setIsSuccess(true); onRefresh();
    } catch (err: any) { alert('Gagal submit report: ' + err.message); } finally { setIsSaving(false); }
  };

  const visitCount = myTodayActivities.filter(a => a.type === ActivityType.VISIT).length;
  const chatCallCount = myTodayActivities.filter(a => a.type === ActivityType.CHAT_DM || a.type === ActivityType.CALL).length;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Alert banner */}
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 p-4 rounded-2xl flex items-start gap-3">
        <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
          <i className="fa-solid fa-bell text-amber-600 text-sm"></i>
        </div>
        <div>
          <p className="font-bold text-amber-800 text-sm">Mandatory Daily Report</p>
          <p className="text-xs text-amber-600 mt-0.5">Laporan harian wajib dikirimkan setiap jam 17:00 WIB untuk evaluasi performa.</p>
        </div>
      </div>

      {/* Already submitted banner */}
      {alreadySubmitted && (
        <div className={`border p-4 rounded-2xl flex items-start gap-3 ${
          existingStatus === 'APPROVED' ? 'bg-green-50 border-green-200' :
          existingStatus === 'REVISION' ? 'bg-red-50 border-red-200' :
          'bg-blue-50 border-blue-200'
        }`}>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
            existingStatus === 'APPROVED' ? 'bg-green-100' :
            existingStatus === 'REVISION' ? 'bg-red-100' :
            'bg-blue-100'
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
              existingStatus === 'REVISION' ? 'text-red-800' :
              'text-blue-800'
            }`}>
              {existingStatus === 'APPROVED' ? 'Laporan Hari Ini Sudah Di-approve' :
               existingStatus === 'REVISION' ? 'Laporan Perlu Revisi' :
               'Laporan Hari Ini Sudah Disubmit'}
            </p>
            <p className={`text-xs mt-0.5 ${
              existingStatus === 'APPROVED' ? 'text-green-600' :
              existingStatus === 'REVISION' ? 'text-red-600' :
              'text-blue-600'
            }`}>
              {existingStatus === 'REVISION'
                ? 'Manager meminta revisi. Silakan update dan submit ulang.'
                : 'Submit ulang akan meng-update laporan yang sudah ada.'
              }
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
              <h1 className="text-2xl lg:text-3xl font-bold mb-1">End of Day Report</h1>
              <p className="text-slate-400 text-sm">Marketing Activity & Client Progress</p>
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
              <h3 className="text-sm font-bold text-slate-800">Informasi Umum</h3>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 text-center">
                <p className="text-2xl font-bold text-slate-800">{myTodayActivities.length}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Total Aktivitas</p>
              </div>
              <div className="p-4 bg-purple-50 rounded-xl border border-purple-100 text-center">
                <p className="text-2xl font-bold text-purple-600">{visitCount}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Visit Lapangan</p>
              </div>
              <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 text-center">
                <p className="text-2xl font-bold text-blue-600">{chatCallCount}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">WhatsApp / Call</p>
              </div>
              <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100 text-center">
                <p className="text-2xl font-bold text-indigo-600">{myClients.length}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Total Client</p>
              </div>
            </div>
          </section>

          {/* Section B: Summary */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-bold">B</div>
              <h3 className="text-sm font-bold text-slate-800">Ringkasan Kegiatan Hari Ini *</h3>
            </div>
            <textarea value={summary} onChange={(e) => setSummary(e.target.value)}
              className="w-full border border-slate-200 p-4 rounded-xl min-h-[100px] focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 outline-none text-sm transition-all resize-none"
              placeholder="Tuliskan ringkasan kegiatan Anda hari ini..." />
          </section>

          {/* Section C: Progress Update */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-bold">C</div>
              <h3 className="text-sm font-bold text-slate-800">Client Progress Update</h3>
            </div>

            {/* Mobile-friendly cards instead of table */}
            <div className="space-y-3">
              {progressUpdates.map((update, index) => (
                <div key={update.clientId} className="bg-slate-50 rounded-xl border border-slate-100 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-slate-400 border border-slate-100">
                        <i className="fa-solid fa-building text-xs"></i>
                      </div>
                      <span className="font-bold text-sm text-slate-800">{update.clientName}</span>
                    </div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase bg-white px-2 py-1 rounded-md border border-slate-100">
                      {update.prevStatus.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Update Status</label>
                      <select className="w-full p-2.5 border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-300"
                        value={update.newStatus} onChange={(e) => handleProgressChange(index, 'newStatus', e.target.value)}>
                        {Object.values(ClientStatus).map(s => (
                          <option key={s} value={s}>{s.replace('_', ' ')}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Hasil / Respon</label>
                      <input type="text" className="w-full p-2.5 border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-300"
                        placeholder="Misal: Client minta revisi" value={update.result}
                        onChange={(e) => handleProgressChange(index, 'result', e.target.value)} />
                    </div>
                  </div>
                </div>
              ))}
              {progressUpdates.length === 0 && (
                <div className="p-8 text-center text-slate-400">
                  <i className="fa-solid fa-building text-2xl mb-2"></i>
                  <p className="text-sm font-medium">Belum ada client yang di-assign</p>
                </div>
              )}
            </div>
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
              Dengan mengklik "Submit Report", Anda menyatakan bahwa data di atas adalah benar dan dapat dipertanggungjawabkan.
            </p>
            <button onClick={handleSubmit} disabled={isSaving}
              className="w-full sm:w-auto px-12 py-4 bg-gradient-to-r from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 disabled:opacity-50 text-white rounded-2xl font-bold shadow-xl transition-all active:scale-[0.98] text-sm flex items-center justify-center gap-2">
              {isSaving ? (
                <><i className="fa-solid fa-spinner fa-spin"></i>Submitting...</>
              ) : (
                <>Submit Report <i className="fa-solid fa-paper-plane"></i></>
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
