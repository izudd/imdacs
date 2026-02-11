
import React, { useState, useMemo, useRef } from 'react';
import { Activity, ActivityType, ActivityStatus, User, Client } from '../types';
import { ACTIVITY_ICONS } from '../constants';
import * as api from '../services/apiService';

interface DailyLogProps {
  user: User;
  clients: Client[];
  activities: Activity[];
  onAddActivity: (activity: Partial<Activity>) => Promise<void>;
  onRefresh: () => void;
}

const ACTIVITY_LABELS: Record<ActivityType, string> = {
  [ActivityType.CHAT_DM]: 'Chat/DM',
  [ActivityType.CALL]: 'Phone Call',
  [ActivityType.VISIT]: 'Visit',
  [ActivityType.MEETING]: 'Meeting',
  [ActivityType.POSTING]: 'Posting',
};

const ACTIVITY_COLORS: Record<ActivityType, { bg: string; text: string; dot: string }> = {
  [ActivityType.CHAT_DM]: { bg: 'bg-green-50', text: 'text-green-600', dot: 'bg-green-500' },
  [ActivityType.CALL]: { bg: 'bg-blue-50', text: 'text-blue-600', dot: 'bg-blue-500' },
  [ActivityType.VISIT]: { bg: 'bg-purple-50', text: 'text-purple-600', dot: 'bg-purple-500' },
  [ActivityType.MEETING]: { bg: 'bg-indigo-50', text: 'text-indigo-600', dot: 'bg-indigo-500' },
  [ActivityType.POSTING]: { bg: 'bg-orange-50', text: 'text-orange-600', dot: 'bg-orange-500' },
};

const DailyLog: React.FC<DailyLogProps> = ({ user, clients, activities, onAddActivity, onRefresh }) => {
  const [showForm, setShowForm] = useState(false);
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [activityForm, setActivityForm] = useState({
    type: ActivityType.CHAT_DM as ActivityType,
    clientId: '',
    description: '',
    startTime: '',
    endTime: '',
  });

  const [checkInForm, setCheckInForm] = useState({ clientId: '', description: 'Check-in lapangan' });

  const [geoLocation, setGeoLocation] = useState<{lat: number; lng: number} | null>(null);
  const [geoError, setGeoError] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const today = new Date().toISOString().split('T')[0];
  const myActivities = activities.filter(a => a.marketingId === user.id && a.date === today)
    .sort((a, b) => b.startTime.localeCompare(a.startTime));

  const activityMix = useMemo(() => {
    const counts: Record<string, number> = { CHAT_DM: 0, CALL: 0, VISIT: 0, MEETING: 0, POSTING: 0 };
    myActivities.forEach(a => { if (counts[a.type] !== undefined) counts[a.type]++; });
    const max = Math.max(...Object.values(counts), 1);
    return Object.entries(counts).map(([key, count]) => ({
      type: key as ActivityType, label: ACTIVITY_LABELS[key as ActivityType], count,
      color: ACTIVITY_COLORS[key as ActivityType], pct: max > 0 ? (count / max) * 100 : 0,
    }));
  }, [myActivities]);

  const handleSaveActivity = async () => {
    if (!activityForm.description.trim() || !activityForm.startTime || !activityForm.endTime) {
      alert('Deskripsi, Jam Mulai, dan Jam Selesai wajib diisi'); return;
    }
    setIsSaving(true);
    try {
      await onAddActivity({ type: activityForm.type, clientId: activityForm.clientId || undefined,
        description: activityForm.description, startTime: activityForm.startTime,
        endTime: activityForm.endTime, date: today, status: ActivityStatus.DONE });
      setActivityForm({ type: ActivityType.CHAT_DM, clientId: '', description: '', startTime: '', endTime: '' });
      setShowForm(false);
    } catch { } finally { setIsSaving(false); }
  };

  const handleOpenCheckIn = () => {
    setShowCheckIn(true); setGeoError(''); setGeoLocation(null); setPhoto(null); setPhotoPreview(null);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setGeoLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => setGeoError('Gagal mendapatkan lokasi: ' + err.message),
        { enableHighAccuracy: true, timeout: 15000 }
      );
    } else { setGeoError('Browser tidak mendukung Geolocation'); }
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { setPhoto(file); const reader = new FileReader(); reader.onload = () => setPhotoPreview(reader.result as string); reader.readAsDataURL(file); }
  };

  const handleCheckIn = async () => {
    if (!geoLocation) { alert('Tunggu lokasi GPS terdeteksi'); return; }
    setIsCheckingIn(true);
    try {
      const formData = new FormData();
      formData.append('latitude', String(geoLocation.lat));
      formData.append('longitude', String(geoLocation.lng));
      formData.append('description', checkInForm.description || 'Check-in lapangan');
      if (checkInForm.clientId) formData.append('client_id', checkInForm.clientId);
      if (photo) formData.append('photo', photo);
      await api.checkIn(formData);
      setShowCheckIn(false); setCheckInForm({ clientId: '', description: 'Check-in lapangan' });
      setPhoto(null); setPhotoPreview(null); onRefresh();
    } catch (err: any) { alert('Check-in gagal: ' + err.message); } finally { setIsCheckingIn(false); }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Daily Activities</h1>
          <p className="text-slate-500 text-sm mt-0.5">Log aktivitas harian Anda secara real-time</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleOpenCheckIn}
            className="bg-gradient-to-r from-green-600 to-emerald-500 text-white px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-lg shadow-green-500/20 text-sm font-semibold active:scale-[0.98]">
            <i className="fa-solid fa-map-pin"></i><span className="hidden sm:inline">Check-In</span>
          </button>
          <button onClick={() => setShowForm(true)}
            className="bg-gradient-to-r from-indigo-600 to-indigo-500 text-white px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-lg shadow-indigo-500/20 text-sm font-semibold active:scale-[0.98]">
            <i className="fa-solid fa-plus"></i><span className="hidden sm:inline">Log Activity</span>
          </button>
        </div>
      </div>


      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 text-center">
          <p className="text-2xl font-bold text-slate-800">{myActivities.length}</p>
          <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Total</p>
        </div>
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 text-center">
          <p className="text-2xl font-bold text-green-600">{myActivities.filter(a => a.status === ActivityStatus.DONE).length}</p>
          <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Selesai</p>
        </div>
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 text-center">
          <p className="text-2xl font-bold text-amber-600">{myActivities.filter(a => a.status === ActivityStatus.PENDING).length}</p>
          <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Pending</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-4 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2">
                <i className="fa-solid fa-timeline text-indigo-500"></i>Timeline Hari Ini
              </h3>
              <span className="text-[10px] text-slate-400 font-medium bg-white px-2 py-1 rounded-lg">{myActivities.length} aktivitas</span>
            </div>
            <div className="p-4">
              {myActivities.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <i className="fa-solid fa-list-check text-slate-300 text-2xl"></i>
                  </div>
                  <p className="text-slate-400 font-medium text-sm">Belum ada aktivitas hari ini</p>
                  <p className="text-slate-300 text-xs mt-1">Tap "Log Activity" untuk mulai</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {myActivities.map(activity => {
                    const colorSet = ACTIVITY_COLORS[activity.type];
                    return (
                      <div key={activity.id} className="flex gap-3 group">
                        <div className={`w-10 h-10 ${colorSet.bg} ${colorSet.text} rounded-xl flex items-center justify-center flex-shrink-0 text-sm`}>
                          {ACTIVITY_ICONS[activity.type]}
                        </div>
                        <div className="flex-1 bg-slate-50/80 rounded-xl p-3.5 border border-slate-100 group-hover:border-indigo-200 transition-colors min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold ${colorSet.bg} ${colorSet.text}`}>{ACTIVITY_LABELS[activity.type]}</span>
                              <span className="text-[10px] text-slate-400 font-medium">{activity.startTime} - {activity.endTime}</span>
                            </div>
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold flex-shrink-0 ${activity.status === 'DONE' ? 'bg-green-100 text-green-700' : activity.status === 'PENDING' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>{activity.status}</span>
                          </div>
                          <p className="text-sm text-slate-800 font-medium">{activity.description}</p>
                          {activity.clientId && (
                            <div className="flex items-center text-xs text-indigo-500 font-medium mt-1.5">
                              <i className="fa-solid fa-building mr-1.5 text-[10px]"></i>{clients.find(c => c.id === activity.clientId)?.name}
                            </div>
                          )}
                          {activity.location && (
                            <div className="flex items-center text-xs text-slate-400 mt-1">
                              <i className="fa-solid fa-location-dot mr-1.5 text-[10px]"></i>{activity.location}
                            </div>
                          )}
                          {activity.proofUrl && (
                            <div className="mt-2"><img src={activity.proofUrl} alt="Proof" className="w-20 h-20 object-cover rounded-lg border border-slate-200" /></div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-gradient-to-br from-indigo-600 via-indigo-500 to-purple-600 rounded-2xl p-5 text-white shadow-xl shadow-indigo-500/20 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2"></div>
            <h3 className="font-bold text-base mb-1 relative">Field Visit</h3>
            <p className="text-indigo-200 text-xs mb-4 leading-relaxed relative">Check-in setiap kali tiba di lokasi client.</p>
            <button onClick={handleOpenCheckIn}
              className="w-full py-3 bg-white text-indigo-600 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-50 text-sm relative active:scale-[0.98]">
              <i className="fa-solid fa-map-pin"></i> Check-In Lapangan
            </button>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
            <h4 className="font-bold text-sm text-slate-800 mb-4 flex items-center gap-2">
              <i className="fa-solid fa-chart-simple text-indigo-500"></i>Activity Mix
            </h4>
            <div className="space-y-3">
              {activityMix.map(item => (
                <div key={item.type}>
                  <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-1.5">
                    <span className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${item.color.dot}`}></span>{item.label}</span>
                    <span className={`${item.color.text} font-bold`}>{item.count}</span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full ${item.color.dot} transition-all duration-700 rounded-full`} style={{ width: `${item.pct}%` }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>


      {showForm && (
        <div className="fixed inset-0 bg-black/40 glass z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg overflow-hidden animate-slide-up max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
              <div><h2 className="text-lg font-bold text-slate-800">Log Activity</h2><p className="text-xs text-slate-400">Catat aktivitas baru</p></div>
              <button onClick={() => setShowForm(false)} className="w-8 h-8 rounded-lg bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center"><i className="fa-solid fa-xmark text-sm"></i></button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 140px)' }}>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Jenis Aktivitas</label>
                <div className="grid grid-cols-5 gap-2">
                  {Object.values(ActivityType).map(t => {
                    const c = ACTIVITY_COLORS[t];
                    return (
                      <button key={t} onClick={() => setActivityForm({...activityForm, type: t})}
                        className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border-2 transition-all text-xs ${activityForm.type === t ? `${c.bg} ${c.text} border-current` : 'border-slate-100 text-slate-400 hover:border-slate-200'}`}>
                        <span className="text-base">{ACTIVITY_ICONS[t]}</span>
                        <span className="text-[9px] font-bold">{t.replace('_', ' ')}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Client (Opsional)</label>
                <select className="w-full border border-slate-200 p-3 rounded-xl outline-none text-sm"
                  value={activityForm.clientId} onChange={(e) => setActivityForm({...activityForm, clientId: e.target.value})}>
                  <option value="">-- General Activity --</option>
                  {clients.filter(c => c.marketingId === user.id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Deskripsi *</label>
                <textarea className="w-full border border-slate-200 p-3 rounded-xl h-24 outline-none text-sm resize-none" placeholder="Apa yang Anda lakukan?"
                  value={activityForm.description} onChange={(e) => setActivityForm({...activityForm, description: e.target.value})}></textarea>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Jam Mulai *</label>
                  <input type="time" className="w-full border border-slate-200 p-3 rounded-xl outline-none text-sm"
                    value={activityForm.startTime} onChange={(e) => setActivityForm({...activityForm, startTime: e.target.value})} />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Jam Selesai *</label>
                  <input type="time" className="w-full border border-slate-200 p-3 rounded-xl outline-none text-sm"
                    value={activityForm.endTime} onChange={(e) => setActivityForm({...activityForm, endTime: e.target.value})} />
                </div>
              </div>
            </div>
            <div className="p-5 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 sticky bottom-0">
              <button onClick={() => setShowForm(false)} className="px-5 py-2.5 text-slate-600 font-medium rounded-xl text-sm">Batal</button>
              <button onClick={handleSaveActivity} disabled={isSaving}
                className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-500 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20 flex items-center gap-2 text-sm active:scale-[0.98]">
                {isSaving ? <><i className="fa-solid fa-spinner fa-spin"></i>Saving...</> : <><i className="fa-solid fa-check"></i>Save</>}
              </button>
            </div>
          </div>
        </div>
      )}


      {showCheckIn && (
        <div className="fixed inset-0 bg-black/40 glass z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg overflow-hidden animate-slide-up max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
              <div><h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><i className="fa-solid fa-map-pin text-green-500"></i>Check-In</h2><p className="text-xs text-slate-400">Verifikasi lokasi kunjungan</p></div>
              <button onClick={() => setShowCheckIn(false)} className="w-8 h-8 rounded-lg bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center"><i className="fa-solid fa-xmark text-sm"></i></button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 140px)' }}>
              <div className={`p-4 rounded-xl flex items-center gap-3 ${geoLocation ? 'bg-green-50 border border-green-200' : geoError ? 'bg-red-50 border border-red-200' : 'bg-blue-50 border border-blue-200'}`}>
                {geoLocation ? (
                  <><div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0"><i className="fa-solid fa-location-crosshairs text-green-600"></i></div>
                  <div><p className="text-xs font-bold text-green-700">Lokasi Terdeteksi</p><p className="text-[10px] text-green-600 font-mono">{geoLocation.lat.toFixed(6)}, {geoLocation.lng.toFixed(6)}</p></div></>
                ) : geoError ? (
                  <><div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0"><i className="fa-solid fa-triangle-exclamation text-red-600"></i></div><p className="text-xs text-red-700">{geoError}</p></>
                ) : (
                  <><div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0"><i className="fa-solid fa-spinner fa-spin text-blue-600"></i></div>
                  <div><p className="text-xs font-bold text-blue-700">Mendeteksi lokasi...</p><p className="text-[10px] text-blue-500">Pastikan GPS aktif</p></div></>
                )}
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Foto Bukti (Opsional)</label>
                <input type="file" ref={fileInputRef} accept="image/*" capture="environment" onChange={handlePhotoChange} className="hidden" />
                {photoPreview ? (
                  <div className="relative">
                    <img src={photoPreview} alt="Preview" className="w-full h-48 object-cover rounded-xl border border-slate-200" />
                    <button onClick={() => { setPhoto(null); setPhotoPreview(null); if(fileInputRef.current) fileInputRef.current.value = ''; }}
                      className="absolute top-2 right-2 w-8 h-8 bg-red-500 text-white rounded-lg flex items-center justify-center shadow-lg"><i className="fa-solid fa-xmark text-xs"></i></button>
                  </div>
                ) : (
                  <button onClick={() => fileInputRef.current?.click()}
                    className="w-full py-10 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 hover:border-indigo-300 hover:text-indigo-500 transition-colors flex flex-col items-center gap-2">
                    <i className="fa-solid fa-camera text-2xl"></i><span className="text-xs font-medium">Ambil Foto / Pilih File</span>
                  </button>
                )}
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Client / PT</label>
                <select className="w-full border border-slate-200 p-3 rounded-xl outline-none text-sm"
                  value={checkInForm.clientId} onChange={(e) => setCheckInForm({...checkInForm, clientId: e.target.value})}>
                  <option value="">-- Pilih Client --</option>
                  {clients.filter(c => c.marketingId === user.id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Keterangan</label>
                <input type="text" className="w-full border border-slate-200 p-3 rounded-xl outline-none text-sm" placeholder="Keterangan check-in"
                  value={checkInForm.description} onChange={(e) => setCheckInForm({...checkInForm, description: e.target.value})} />
              </div>
            </div>
            <div className="p-5 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 sticky bottom-0">
              <button onClick={() => setShowCheckIn(false)} className="px-5 py-2.5 text-slate-600 font-medium rounded-xl text-sm">Batal</button>
              <button onClick={handleCheckIn} disabled={isCheckingIn || !geoLocation}
                className="px-6 py-2.5 bg-gradient-to-r from-green-600 to-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg shadow-green-500/20 flex items-center gap-2 text-sm active:scale-[0.98]">
                {isCheckingIn ? <><i className="fa-solid fa-spinner fa-spin"></i>Processing...</> : <><i className="fa-solid fa-check"></i>Check-In</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DailyLog;
