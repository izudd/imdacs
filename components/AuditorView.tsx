
import React, { useState, useMemo, useCallback } from 'react';
import { User, Client, ClientStatus, AuditChecklistItem } from '../types';
import { STATUS_COLORS, AUDITOR_TEAM_MEMBERS } from '../constants';
import * as api from '../services/apiService';

interface AuditorViewProps {
  user: User;
  clients: Client[];
  users: User[];
  onEditClient: (client: Partial<Client> & { id: string }) => Promise<void>;
  onRefresh: () => void;
}

const AuditorView: React.FC<AuditorViewProps> = ({ user, clients, users, onEditClient, onRefresh }) => {
  const [activeView, setActiveView] = useState<'team' | 'unassigned'>('team');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [checklist, setChecklist] = useState<AuditChecklistItem[]>([]);
  const [checklistLoading, setChecklistLoading] = useState(false);
  const [assignLoading, setAssignLoading] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

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

  // Checklist completion tracking (stored per client from loaded checklists)
  const [checklistCache, setChecklistCache] = useState<Record<string, AuditChecklistItem[]>>({});

  const getMarketingName = useCallback((marketingId: string) => {
    const u = users.find(u => u.id === marketingId);
    return u?.name || marketingId;
  }, [users]);

  const [notifStatus, setNotifStatus] = useState<{ type: 'success' | 'warning' | 'error'; message: string } | null>(null);

  const handleAssign = async (clientId: string, assignee: string) => {
    setAssignLoading(clientId);
    setNotifStatus(null);
    try {
      const client = auditClients.find(c => c.id === clientId);
      await onEditClient({ id: clientId, auditorAssignee: assignee } as Partial<Client> & { id: string });

      // Send WA + Email notification
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
          const wa = result.notifications?.wa;
          const email = result.notifications?.email;
          const waSent = wa?.sent;
          const emailSent = email?.sent;
          if (waSent && emailSent) {
            setNotifStatus({ type: 'success', message: `✅ ${assignee} dinotifikasi via WhatsApp & Email` });
          } else if (waSent) {
            setNotifStatus({ type: 'success', message: `✅ ${assignee} dinotifikasi via WhatsApp` });
          } else if (emailSent) {
            setNotifStatus({ type: 'success', message: `✅ ${assignee} dinotifikasi via Email` });
          } else {
            setNotifStatus({ type: 'warning', message: `⚠️ Client diassign, tapi notifikasi belum dikonfigurasi` });
          }
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

  const openClientDetail = async (client: Client) => {
    setSelectedClient(client);
    setChecklistLoading(true);
    try {
      const items = await api.getAuditChecklist(client.id);
      setChecklist(items);
      setChecklistCache(prev => ({ ...prev, [client.id]: items }));
    } catch {
      console.error('Failed to load checklist');
      setChecklist([]);
    } finally {
      setChecklistLoading(false);
    }
  };

  const toggleChecklistItem = async (item: AuditChecklistItem) => {
    const newChecked = !item.isChecked;
    // Optimistic update
    setChecklist(prev => prev.map(i => i.id === item.id ? { ...i, isChecked: newChecked, checkedAt: newChecked ? new Date().toISOString() : null } : i));
    try {
      await api.updateAuditChecklistItem(item.id, newChecked);
      // Update cache
      if (selectedClient) {
        setChecklistCache(prev => ({
          ...prev,
          [selectedClient.id]: (prev[selectedClient.id] || []).map(i => i.id === item.id ? { ...i, isChecked: newChecked } : i)
        }));
      }
    } catch {
      // Revert on failure
      setChecklist(prev => prev.map(i => i.id === item.id ? { ...i, isChecked: !newChecked } : i));
    }
  };

  const getChecklistProgress = (clientId: string): { checked: number; total: number } => {
    const items = checklistCache[clientId];
    if (!items || items.length === 0) return { checked: 0, total: 7 };
    return { checked: items.filter(i => i.isChecked).length, total: items.length };
  };

  // Pre-load checklists for assigned clients
  const loadChecklistsForGroup = useCallback(async (groupClients: Client[]) => {
    for (const c of groupClients) {
      if (!checklistCache[c.id]) {
        try {
          const items = await api.getAuditChecklist(c.id);
          setChecklistCache(prev => ({ ...prev, [c.id]: items }));
        } catch { /* skip */ }
      }
    }
  }, [checklistCache]);

  // Load checklists when team view is active
  React.useEffect(() => {
    if (activeView === 'team' && assignedClients.length > 0) {
      loadChecklistsForGroup(assignedClients);
    }
  }, [activeView, assignedClients.length]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const totalCompleted = (Object.values(checklistCache) as AuditChecklistItem[][]).filter(items => items.length > 0 && items.every(i => i.isChecked)).length;

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

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
              <i className="fa-solid fa-circle-check text-green-600 text-sm"></i>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Selesai</p>
              <p className="text-xl font-black text-slate-800">{totalCompleted}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex items-center gap-2 bg-slate-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => setActiveView('team')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
            activeView === 'team'
              ? 'bg-white text-slate-800 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <i className="fa-solid fa-users-gear mr-2 text-xs"></i>
          Tim Board
        </button>
        <button
          onClick={() => setActiveView('unassigned')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
            activeView === 'unassigned'
              ? 'bg-white text-slate-800 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <i className="fa-solid fa-inbox mr-2 text-xs"></i>
          Belum Diassign
          {totalUnassigned > 0 && (
            <span className="ml-2 bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{totalUnassigned}</span>
          )}
        </button>
      </div>

      {/* Team Board View */}
      {activeView === 'team' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {AUDITOR_TEAM_MEMBERS.map(member => {
            const memberClients = teamGroups[member] || [];
            return (
              <div key={member} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                {/* Member Header */}
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

                {/* Client List */}
                <div className="divide-y divide-slate-50">
                  {memberClients.length === 0 ? (
                    <div className="p-6 text-center">
                      <i className="fa-solid fa-inbox text-slate-300 text-2xl mb-2"></i>
                      <p className="text-slate-400 text-xs">Belum ada klien</p>
                    </div>
                  ) : (
                    memberClients.map(client => {
                      const progress = getChecklistProgress(client.id);
                      const progressPct = progress.total > 0 ? Math.round((progress.checked / progress.total) * 100) : 0;
                      const isComplete = progress.checked === progress.total && progress.total > 0;
                      return (
                        <div
                          key={client.id}
                          onClick={() => openClientDetail(client)}
                          className="p-3 hover:bg-slate-50 cursor-pointer transition-colors"
                        >
                          <div className="flex items-start justify-between gap-2 mb-1.5">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-bold text-slate-800 truncate">{client.name}</p>
                              <p className="text-[11px] text-slate-400 truncate">{client.industry} - {getMarketingName(client.marketingId)}</p>
                            </div>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_COLORS[client.status]}`}>
                              {client.status}
                            </span>
                          </div>
                          {/* Notes */}
                          {client.notes && (
                            <p className="text-[10px] text-slate-500 mb-2 truncate"><i className="fa-solid fa-sticky-note mr-1"></i>{client.notes}</p>
                          )}
                          {/* Checklist Progress */}
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${isComplete ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                                style={{ width: `${progressPct}%` }}
                              />
                            </div>
                            <span className={`text-[10px] font-bold ${isComplete ? 'text-emerald-600' : 'text-slate-400'}`}>
                              {progress.checked}/{progress.total}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Unassigned View */}
      {activeView === 'unassigned' && (
        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <i className="fa-solid fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Cari klien..."
              className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 outline-none"
            />
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

                  {/* Notes */}
                  {client.notes && (
                    <p className="text-[11px] text-slate-500 mb-3 line-clamp-2"><i className="fa-solid fa-sticky-note mr-1 text-slate-400"></i>{client.notes}</p>
                  )}

                  {/* Assign Buttons */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 font-semibold">Assign ke:</span>
                    {AUDITOR_TEAM_MEMBERS.map(member => (
                      <button
                        key={member}
                        onClick={() => handleAssign(client.id, member)}
                        disabled={assignLoading === client.id}
                        className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg text-[11px] font-bold transition-colors disabled:opacity-50"
                      >
                        {assignLoading === client.id ? (
                          <i className="fa-solid fa-spinner fa-spin"></i>
                        ) : (
                          member
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Client Detail Modal */}
      {selectedClient && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={() => setSelectedClient(null)} />
          <div className="relative bg-white rounded-3xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden animate-slide-up flex flex-col">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-black text-slate-800 truncate">{selectedClient.name}</h3>
                <p className="text-xs text-slate-400">{selectedClient.industry}</p>
              </div>
              <button
                onClick={() => setSelectedClient(null)}
                className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors flex-shrink-0 ml-2"
              >
                <i className="fa-solid fa-xmark text-slate-500 text-sm"></i>
              </button>
            </div>

            {/* Modal Body - Scrollable */}
            <div className="overflow-y-auto flex-1 p-6 space-y-5">
              {/* Client Info */}
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

              {/* Additional Info */}
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

              {/* Assignment */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Assign Tim</h4>
                <div className="flex items-center gap-2 flex-wrap">
                  {AUDITOR_TEAM_MEMBERS.map(member => (
                    <button
                      key={member}
                      onClick={() => handleAssign(selectedClient.id, member)}
                      disabled={assignLoading === selectedClient.id}
                      className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                        selectedClient.auditorAssignee === member
                          ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {member}
                    </button>
                  ))}
                  {selectedClient.auditorAssignee && (
                    <button
                      onClick={() => handleUnassign(selectedClient.id)}
                      disabled={assignLoading === selectedClient.id}
                      className="px-4 py-2 rounded-xl text-sm font-bold bg-red-50 text-red-500 hover:bg-red-100 transition-all"
                    >
                      <i className="fa-solid fa-xmark mr-1"></i>Unassign
                    </button>
                  )}
                </div>
              </div>

              {/* Checklist */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Checklist Audit</h4>
                  {!checklistLoading && checklist.length > 0 && (
                    <span className="text-[11px] font-bold text-indigo-600">
                      {checklist.filter(i => i.isChecked).length}/{checklist.length} selesai
                    </span>
                  )}
                </div>

                {checklistLoading ? (
                  <div className="space-y-2">
                    {[1,2,3,4].map(i => (
                      <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse shimmer-bg" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {checklist.map((item, idx) => (
                      <button
                        key={item.id}
                        onClick={() => toggleChecklistItem(item)}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                          item.isChecked
                            ? 'bg-emerald-50 border-emerald-200'
                            : 'bg-white border-slate-100 hover:border-slate-200'
                        }`}
                      >
                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 transition-all ${
                          item.isChecked
                            ? 'bg-emerald-500 text-white'
                            : 'bg-slate-100 text-slate-300'
                        }`}>
                          {item.isChecked ? (
                            <i className="fa-solid fa-check text-[10px]"></i>
                          ) : (
                            <span className="text-[10px] font-bold">{idx + 1}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-semibold ${item.isChecked ? 'text-emerald-700 line-through' : 'text-slate-700'}`}>
                            {item.label}
                          </p>
                          {item.isChecked && item.checkedAt && (
                            <p className="text-[10px] text-emerald-500 mt-0.5">
                              <i className="fa-solid fa-check mr-1"></i>
                              {new Date(item.checkedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper sub-component for info items
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
