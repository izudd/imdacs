
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Activity, ActivityType, ActivityStatus, User, Client } from '../types';
import * as api from '../services/apiService';

interface QuickLogProps {
  user: User;
  clients: Client[];
  activities: Activity[];
  onAddActivity: (activity: Partial<Activity>) => Promise<void>;
  onQuickAddClient: (name: string, estimatedValue?: number) => Promise<Client>;
  onEditClient: (client: Partial<Client> & { id: string }) => Promise<void>;
  onRefresh: () => void;
}

// Auto-detect activity type from description keywords
function detectActivityType(desc: string): ActivityType {
  const d = desc.toUpperCase();
  if (/\b(VISIT|BERTEMU|KETEMU|ENTRY\s*MEETING|KUNJUNG)\b/.test(d)) return ActivityType.VISIT;
  if (/\b(PHONE|CALL|TELPON|TELP|HUBUNGI)\b/.test(d)) return ActivityType.CALL;
  if (/\b(MEETING|RAPAT|DISKUSI)\b/.test(d)) return ActivityType.MEETING;
  if (/\b(POSTING|POST|UPLOAD|KONTEN)\b/.test(d)) return ActivityType.POSTING;
  return ActivityType.CHAT_DM;
}

const ACTIVITY_TYPE_LABELS: Record<ActivityType, { label: string; icon: string; color: string }> = {
  [ActivityType.CHAT_DM]: { label: 'Chat/DM', icon: 'fa-brands fa-whatsapp', color: 'text-green-600 bg-green-50' },
  [ActivityType.CALL]: { label: 'Call', icon: 'fa-solid fa-phone', color: 'text-blue-600 bg-blue-50' },
  [ActivityType.VISIT]: { label: 'Visit', icon: 'fa-solid fa-location-dot', color: 'text-purple-600 bg-purple-50' },
  [ActivityType.MEETING]: { label: 'Meeting', icon: 'fa-solid fa-users', color: 'text-indigo-600 bg-indigo-50' },
  [ActivityType.POSTING]: { label: 'Posting', icon: 'fa-solid fa-share-nodes', color: 'text-orange-600 bg-orange-50' },
};

function formatCurrency(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}M`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(0)}jt`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}rb`;
  return value.toString();
}

const QuickLog: React.FC<QuickLogProps> = ({ user, clients, activities, onAddActivity, onQuickAddClient, onEditClient, onRefresh }) => {
  // Form state
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isNewClient, setIsNewClient] = useState(false);
  const [description, setDescription] = useState('');
  const [feeValue, setFeeValue] = useState('');
  const [followUpPlan, setFollowUpPlan] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Date navigation
  const [viewDate, setViewDate] = useState(() => new Date().toISOString().split('T')[0]);
  const today = new Date().toISOString().split('T')[0];
  const isToday = viewDate === today;

  // Refs
  const clientInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  // My clients only
  const myClients = useMemo(() =>
    clients.filter(c => c.marketingId === user.id),
    [clients, user.id]
  );

  // Filtered client suggestions
  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return [];
    const search = clientSearch.toUpperCase().trim();
    return myClients
      .filter(c => c.name.toUpperCase().includes(search))
      .slice(0, 8);
  }, [clientSearch, myClients]);

  // Check if typed name exactly matches existing client
  const exactMatch = useMemo(() => {
    if (!clientSearch.trim()) return null;
    return myClients.find(c => c.name.toUpperCase() === clientSearch.toUpperCase().trim());
  }, [clientSearch, myClients]);

  // Activities for viewed date
  const dateActivities = useMemo(() =>
    activities
      .filter(a => a.marketingId === user.id && a.date === viewDate)
      .sort((a, b) => {
        // Sort by ID desc (newest first) since multiple entries might have same time
        return b.id.localeCompare(a.id);
      }),
    [activities, user.id, viewDate]
  );

  // Stats for viewed date
  const dateStats = useMemo(() => {
    const acts = dateActivities;
    let totalFee = 0;
    acts.forEach(a => {
      if (a.clientId) {
        const c = clients.find(cl => cl.id === a.clientId);
        if (c && c.estimatedValue) totalFee += c.estimatedValue;
      }
    });
    return { total: acts.length, totalFee };
  }, [dateActivities, clients]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Flash success message
  useEffect(() => {
    if (saveSuccess) {
      const timer = setTimeout(() => setSaveSuccess(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [saveSuccess]);

  // Select client from dropdown
  const handleSelectClient = (client: Client) => {
    setSelectedClient(client);
    setClientSearch(client.name);
    setIsNewClient(false);
    setShowDropdown(false);
    descriptionRef.current?.focus();
  };

  // Choose to create new client
  const handleNewClient = () => {
    setSelectedClient(null);
    setIsNewClient(true);
    setShowDropdown(false);
    descriptionRef.current?.focus();
  };

  // Save handler
  const handleSave = async () => {
    // Validations
    if (!clientSearch.trim()) {
      alert('Nama Badan Usaha wajib diisi');
      clientInputRef.current?.focus();
      return;
    }
    if (!description.trim()) {
      alert('Keterangan wajib diisi');
      descriptionRef.current?.focus();
      return;
    }

    setIsSaving(true);
    try {
      let clientId: string | undefined;
      const fee = feeValue ? parseInt(feeValue.replace(/\D/g, ''), 10) || 0 : 0;

      // Resolve client
      if (selectedClient) {
        // Existing selected client
        clientId = selectedClient.id;
        // Update fee if provided
        if (fee > 0) {
          await onEditClient({ id: selectedClient.id, estimatedValue: fee });
        }
      } else if (exactMatch) {
        // User typed exact name of existing client
        clientId = exactMatch.id;
        if (fee > 0) {
          await onEditClient({ id: exactMatch.id, estimatedValue: fee });
        }
      } else {
        // New client - quick create
        const newClient = await onQuickAddClient(clientSearch.trim(), fee);
        clientId = newClient.id;
      }

      // Auto-detect type
      const activityType = detectActivityType(description);

      // Current time for start/end
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      // Build description with FU plan appended if provided
      let fullDescription = description.trim();
      if (followUpPlan.trim()) {
        fullDescription += ` | Rencana FU: ${followUpPlan.trim()}`;
      }

      // Save activity
      await onAddActivity({
        type: activityType,
        clientId,
        description: fullDescription,
        startTime: timeStr,
        endTime: timeStr,
        date: today,
        status: ActivityStatus.DONE,
      });

      // Reset form
      setClientSearch('');
      setSelectedClient(null);
      setIsNewClient(false);
      setDescription('');
      setFeeValue('');
      setFollowUpPlan('');
      setSaveSuccess(true);

      // Ensure we're viewing today
      setViewDate(today);

      // Focus back to client input
      clientInputRef.current?.focus();

    } catch (err: any) {
      alert('Gagal menyimpan: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  };

  // Keyboard shortcut: Ctrl+Enter to save
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
  };

  // Date navigation
  const goDate = (offset: number) => {
    const d = new Date(viewDate);
    d.setDate(d.getDate() + offset);
    setViewDate(d.toISOString().split('T')[0]);
  };

  const formatDisplayDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  // Fee input formatting
  const handleFeeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    if (raw === '') {
      setFeeValue('');
      return;
    }
    const num = parseInt(raw, 10);
    setFeeValue(num.toLocaleString('id-ID'));
  };

  // Detected type preview
  const detectedType = description.trim() ? detectActivityType(description) : null;
  const typeInfo = detectedType ? ACTIVITY_TYPE_LABELS[detectedType] : null;

  return (
    <div className="space-y-5" onKeyDown={handleKeyDown}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800 flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/20">
              <i className="fa-solid fa-bolt text-white text-lg"></i>
            </div>
            Quick Log
          </h1>
          <p className="text-slate-500 text-sm mt-1">Input aktivitas harian</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <i className="fa-regular fa-keyboard"></i>
          <span className="hidden sm:inline">Ctrl+Enter untuk simpan</span>
        </div>
      </div>

      {/* Success Toast */}
      {saveSuccess && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl flex items-center gap-2 animate-slide-up text-sm font-medium">
          <i className="fa-solid fa-circle-check text-green-500"></i>
          Aktivitas berhasil disimpan! Silakan input berikutnya.
        </div>
      )}

      {/* ═══ INPUT FORM ═══ */}
      {isToday && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-5 py-3.5 flex items-center gap-3">
            <i className="fa-solid fa-pen-to-square text-indigo-400"></i>
            <span className="text-white font-bold text-sm">Input Aktivitas</span>
            {detectedType && typeInfo && (
              <span className={`ml-auto px-2.5 py-1 rounded-lg text-[10px] font-bold ${typeInfo.color} flex items-center gap-1.5`}>
                <i className={typeInfo.icon}></i>
                {typeInfo.label}
              </span>
            )}
          </div>

          <div className="p-5 space-y-4">
            {/* Row 1: Badan Usaha */}
            <div className="relative" ref={dropdownRef}>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Badan Usaha / Client *
              </label>
              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                  <i className="fa-solid fa-building text-sm"></i>
                </div>
                <input
                  ref={clientInputRef}
                  type="text"
                  value={clientSearch}
                  onChange={(e) => {
                    setClientSearch(e.target.value);
                    setSelectedClient(null);
                    setIsNewClient(false);
                    setShowDropdown(true);
                  }}
                  onFocus={() => clientSearch.trim() && setShowDropdown(true)}
                  className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl outline-none text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 transition-all placeholder-slate-300"
                  placeholder="Ketik nama PT / Badan Usaha..."
                  autoComplete="off"
                />
                {selectedClient && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <span className="bg-green-100 text-green-700 text-[9px] font-bold px-2 py-0.5 rounded-md">EXISTING</span>
                  </div>
                )}
                {isNewClient && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <span className="bg-amber-100 text-amber-700 text-[9px] font-bold px-2 py-0.5 rounded-md">NEW</span>
                  </div>
                )}
              </div>

              {/* Dropdown suggestions */}
              {showDropdown && clientSearch.trim().length >= 1 && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-64 overflow-y-auto">
                  {filteredClients.map(c => (
                    <button
                      key={c.id}
                      onClick={() => handleSelectClient(c)}
                      className="w-full text-left px-4 py-3 hover:bg-indigo-50 transition-colors flex items-center gap-3 border-b border-slate-50 last:border-0"
                    >
                      <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <i className="fa-solid fa-building text-slate-400 text-xs"></i>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800 truncate">{c.name}</p>
                        <p className="text-[10px] text-slate-400">
                          {c.status.replace('_', ' ')}
                          {c.estimatedValue > 0 ? ` · Rp ${formatCurrency(c.estimatedValue)}` : ''}
                        </p>
                      </div>
                      <i className="fa-solid fa-chevron-right text-slate-300 text-[10px]"></i>
                    </button>
                  ))}

                  {/* Create new option */}
                  {!exactMatch && clientSearch.trim().length >= 2 && (
                    <button
                      onClick={handleNewClient}
                      className="w-full text-left px-4 py-3 hover:bg-amber-50 transition-colors flex items-center gap-3 bg-amber-50/50 border-t border-amber-100"
                    >
                      <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <i className="fa-solid fa-plus text-amber-600 text-xs"></i>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-amber-800">
                          Tambah "<span className="text-amber-600">{clientSearch.trim()}</span>"
                        </p>
                        <p className="text-[10px] text-amber-500">Buat sebagai client baru</p>
                      </div>
                    </button>
                  )}

                  {filteredClients.length === 0 && (!clientSearch.trim() || clientSearch.trim().length < 2) && (
                    <div className="px-4 py-3 text-xs text-slate-400 text-center">
                      Ketik minimal 2 huruf untuk mencari...
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Row 2: Keterangan */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Keterangan *
              </label>
              <textarea
                ref={descriptionRef}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full border border-slate-200 p-3.5 rounded-xl outline-none text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 transition-all resize-none placeholder-slate-300"
                rows={3}
                placeholder="Contoh: VISIT KE KLIEN, BERTEMU PAK BUDI TERKAIT PROPOSAL AUDIT 2025..."
              />
            </div>

            {/* Row 3: Fee + Rencana FU (side by side) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Nilai Fee (Rp) <span className="text-slate-300 normal-case">— opsional</span>
                </label>
                <div className="relative">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">Rp</div>
                  <input
                    type="text"
                    value={feeValue}
                    onChange={handleFeeChange}
                    className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl outline-none text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 transition-all placeholder-slate-300"
                    placeholder="0"
                    inputMode="numeric"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Rencana Follow Up <span className="text-slate-300 normal-case">— opsional</span>
                </label>
                <input
                  type="text"
                  value={followUpPlan}
                  onChange={(e) => setFollowUpPlan(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 transition-all placeholder-slate-300"
                  placeholder="Contoh: FU minggu depan, Visit Kamis..."
                />
              </div>
            </div>

            {/* Save Button */}
            <div className="flex items-center justify-between pt-2">
              <p className="text-[11px] text-slate-300 hidden sm:block">
                <i className="fa-regular fa-lightbulb mr-1"></i>
                Tipe aktivitas terdeteksi otomatis dari keterangan
              </p>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="w-full sm:w-auto px-8 py-3 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 disabled:opacity-50 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2 text-sm"
              >
                {isSaving ? (
                  <><i className="fa-solid fa-spinner fa-spin"></i>Menyimpan...</>
                ) : (
                  <><i className="fa-solid fa-plus"></i>Simpan &amp; Input Lagi</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ DATE NAVIGATION + STATS ═══ */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-4 flex items-center justify-between border-b border-slate-100">
          <button
            onClick={() => goDate(-1)}
            className="w-9 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors"
          >
            <i className="fa-solid fa-chevron-left text-slate-500 text-xs"></i>
          </button>

          <div className="text-center flex-1 min-w-0 px-3">
            <p className="text-sm font-bold text-slate-800">
              {isToday ? 'Hari Ini' : formatDisplayDate(viewDate)}
            </p>
            {isToday && (
              <p className="text-[10px] text-slate-400">{formatDisplayDate(viewDate)}</p>
            )}
          </div>

          <button
            onClick={() => goDate(1)}
            disabled={isToday}
            className="w-9 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-slate-100 flex items-center justify-center transition-colors"
          >
            <i className="fa-solid fa-chevron-right text-slate-500 text-xs"></i>
          </button>
        </div>

        {/* Quick stats bar */}
        <div className="grid grid-cols-2 divide-x divide-slate-100 bg-slate-50/50">
          <div className="px-4 py-3 text-center">
            <p className="text-lg font-bold text-slate-800">{dateStats.total}</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase">Aktivitas</p>
          </div>
          <div className="px-4 py-3 text-center">
            <p className="text-lg font-bold text-indigo-600">
              {dateActivities.filter(a => a.clientId).length}
            </p>
            <p className="text-[10px] font-bold text-slate-400 uppercase">Client Dihubungi</p>
          </div>
        </div>
      </div>

      {/* ═══ ACTIVITY LIST (Spreadsheet-style) ═══ */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-4 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2">
            <i className="fa-solid fa-table-list text-indigo-500"></i>
            Log Aktivitas
          </h3>
          <span className="text-[10px] text-slate-400 font-medium bg-white px-2 py-1 rounded-lg border border-slate-100">
            {dateActivities.length} entries
          </span>
        </div>

        {dateActivities.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <i className="fa-solid fa-inbox text-slate-300 text-2xl"></i>
            </div>
            <p className="text-slate-400 font-medium text-sm">
              {isToday ? 'Belum ada aktivitas hari ini' : 'Tidak ada aktivitas di tanggal ini'}
            </p>
            {isToday && (
              <p className="text-slate-300 text-xs mt-1">Gunakan form di atas untuk input</p>
            )}
          </div>
        ) : (
          <>
            {/* Desktop: Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-10">#</th>
                    <th className="text-left px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Badan Usaha</th>
                    <th className="text-left px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Keterangan</th>
                    <th className="text-left px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-20">Tipe</th>
                    <th className="text-left px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-20">Jam</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {dateActivities.map((activity, idx) => {
                    const at = ACTIVITY_TYPE_LABELS[activity.type];
                    const client = activity.clientId ? clients.find(c => c.id === activity.clientId) : null;
                    return (
                      <tr key={activity.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-4 py-3 text-slate-300 text-xs font-mono">{dateActivities.length - idx}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${at.color}`}>
                              <i className={`${at.icon} text-[10px]`}></i>
                            </div>
                            <span className="font-semibold text-slate-800 truncate max-w-[200px]">
                              {client?.name || '—'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600 max-w-md">
                          <p className="line-clamp-2 leading-relaxed">{activity.description}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold ${at.color}`}>{at.label}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-xs font-mono">{activity.startTime}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile: Card View */}
            <div className="md:hidden divide-y divide-slate-50">
              {dateActivities.map((activity, idx) => {
                const at = ACTIVITY_TYPE_LABELS[activity.type];
                const client = activity.clientId ? clients.find(c => c.id === activity.clientId) : null;
                return (
                  <div key={activity.id} className="p-4 hover:bg-slate-50/50 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${at.color}`}>
                        <i className={`${at.icon} text-sm`}></i>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <p className="font-bold text-sm text-slate-800 truncate">
                            {client?.name || '— General —'}
                          </p>
                          <span className="text-[10px] text-slate-400 font-mono flex-shrink-0">{activity.startTime}</span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed line-clamp-3">{activity.description}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold ${at.color}`}>{at.label}</span>
                          {client && client.estimatedValue > 0 && (
                            <span className="text-[10px] text-emerald-600 font-semibold">
                              Rp {formatCurrency(client.estimatedValue)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Not today hint */}
      {!isToday && (
        <div className="text-center py-4">
          <button
            onClick={() => setViewDate(today)}
            className="text-sm text-indigo-600 font-semibold hover:text-indigo-700 flex items-center gap-2 mx-auto"
          >
            <i className="fa-solid fa-arrow-left text-xs"></i>
            Kembali ke Hari Ini untuk Input
          </button>
        </div>
      )}
    </div>
  );
};

export default QuickLog;
