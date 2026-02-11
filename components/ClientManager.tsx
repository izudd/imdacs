
import React, { useState, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Client, ClientStatus, User, UserRole, Activity } from '../types';
import { STATUS_COLORS } from '../constants';
import { ImportResult } from '../services/apiService';

interface ClientManagerProps {
  user: User;
  clients: Client[];
  users: User[];
  activities: Activity[];
  onAddClient: (client: Partial<Client>) => Promise<void>;
  onEditClient: (client: Partial<Client> & { id: string }) => Promise<void>;
  onImportClients: (clients: Partial<Client>[]) => Promise<ImportResult>;
}

const emptyForm = {
  name: '',
  industry: '',
  picName: '',
  phone: '',
  email: '',
  address: '',
  status: ClientStatus.NEW as ClientStatus,
  estimatedValue: 0,
};

function formatCurrency(value: number): string {
  if (value >= 1_000_000_000) return `Rp ${(value / 1_000_000_000).toFixed(1)}M`;
  if (value >= 1_000_000) return `Rp ${(value / 1_000_000).toFixed(0)}jt`;
  if (value >= 1_000) return `Rp ${(value / 1_000).toFixed(0)}rb`;
  return `Rp ${value.toLocaleString('id-ID')}`;
}

function getStagnantDays(lastUpdate: string): number {
  if (!lastUpdate) return 999;
  return Math.floor((new Date().getTime() - new Date(lastUpdate).getTime()) / (1000 * 60 * 60 * 24));
}

interface ImportRow {
  name: string;
  industry: string;
  picName: string;
  phone: string;
  email: string;
  address: string;
  status: string;
  estimatedValue: number;
}

const ClientManager: React.FC<ClientManagerProps> = ({ user, clients, users, activities, onAddClient, onEditClient, onImportClients }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [detailClient, setDetailClient] = useState<Client | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [marketingFilter, setMarketingFilter] = useState<string>('all');
  const [formData, setFormData] = useState(emptyForm);
  const [editFormData, setEditFormData] = useState(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');

  // Import states
  const [showImport, setShowImport] = useState(false);
  const [importStep, setImportStep] = useState<'upload' | 'preview' | 'result'>('upload');
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importFileName, setImportFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isManager = user.role === UserRole.MANAGER;
  const marketingUsers = useMemo(() => users.filter(u => u.role === UserRole.MARKETING), [users]);

  // Scoped clients
  const myClients = useMemo(() =>
    isManager ? clients : clients.filter(c => c.marketingId === user.id),
    [clients, user, isManager]
  );

  // Filtered
  const filteredClients = useMemo(() => {
    return myClients.filter(c => {
      const matchSearch = !searchTerm.trim() ||
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.picName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.industry.toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = statusFilter === 'all' || c.status === statusFilter;
      const matchMarketing = marketingFilter === 'all' || c.marketingId === marketingFilter;
      return matchSearch && matchStatus && matchMarketing;
    });
  }, [myClients, searchTerm, statusFilter, marketingFilter]);

  // Stats
  const stats = useMemo(() => {
    const target = marketingFilter === 'all' ? myClients : myClients.filter(c => c.marketingId === marketingFilter);
    const pipeline = target.filter(c => c.status !== ClientStatus.DEAL && c.status !== ClientStatus.LOST);
    const deals = target.filter(c => c.status === ClientStatus.DEAL);
    const stagnant = target.filter(c =>
      c.status !== ClientStatus.DEAL && c.status !== ClientStatus.LOST && getStagnantDays(c.lastUpdate) > 7
    );
    return {
      total: target.length,
      pipelineValue: pipeline.reduce((s, c) => s + (c.estimatedValue || 0), 0),
      dealValue: deals.reduce((s, c) => s + (c.estimatedValue || 0), 0),
      deals: deals.length,
      stagnant: stagnant.length,
    };
  }, [myClients, marketingFilter]);

  // Per-marketing client count
  const marketingClientCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    myClients.forEach(c => { counts[c.marketingId] = (counts[c.marketingId] || 0) + 1; });
    return counts;
  }, [myClients]);

  const statusCounts = useMemo(() =>
    Object.values(ClientStatus).map(s => ({
      status: s, count: myClients.filter(c => c.status === s && (marketingFilter === 'all' || c.marketingId === marketingFilter)).length,
    })).filter(s => s.count > 0),
    [myClients, marketingFilter]
  );

  // Client activities for detail
  const clientActivities = useMemo(() => {
    if (!detailClient) return [];
    return activities
      .filter(a => a.clientId === detailClient.id)
      .sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime))
      .slice(0, 20);
  }, [detailClient, activities]);

  const getMarketingName = (marketingId: string): string => {
    return marketingUsers.find(m => m.id === marketingId)?.name || '-';
  };

  const getMarketingAvatar = (marketingId: string): string | undefined => {
    return users.find(m => m.id === marketingId)?.avatar;
  };

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.industry.trim() || !formData.picName.trim()) {
      alert('Nama Perusahaan, Bidang Usaha, dan PIC wajib diisi'); return;
    }
    setIsSaving(true);
    try { await onAddClient(formData); setFormData(emptyForm); setIsAdding(false); }
    catch {} finally { setIsSaving(false); }
  };

  const openEdit = (client: Client) => {
    setEditingClient(client);
    setEditFormData({
      name: client.name, industry: client.industry, picName: client.picName,
      phone: client.phone || '', email: client.email || '', address: client.address || '',
      status: client.status, estimatedValue: client.estimatedValue || 0,
    });
  };

  const handleEditSave = async () => {
    if (!editingClient) return;
    if (!editFormData.name.trim() || !editFormData.industry.trim() || !editFormData.picName.trim()) {
      alert('Nama Perusahaan, Bidang Usaha, dan PIC wajib diisi'); return;
    }
    setIsSaving(true);
    try { await onEditClient({ id: editingClient.id, ...editFormData }); setEditingClient(null); }
    catch {} finally { setIsSaving(false); }
  };

  // ═══ IMPORT FUNCTIONS ═══

  const downloadTemplate = () => {
    const templateData = [
      {
        'NAMA PERUSAHAAN': 'PT Contoh Saja',
        'BIDANG USAHA': 'Logistik',
        'NAMA PIC': 'Budi Santoso',
        'NO TELEPON': '081234567890',
        'EMAIL': 'budi@contoh.com',
        'ALAMAT': 'Jl. Sudirman No. 123, Jakarta',
        'STATUS': 'NEW',
        'ESTIMASI NILAI': 50000000
      },
      {
        'NAMA PERUSAHAAN': 'CV Maju Bersama',
        'BIDANG USAHA': 'Manufaktur',
        'NAMA PIC': 'Sari Dewi',
        'NO TELEPON': '087654321000',
        'EMAIL': 'sari@maju.co.id',
        'ALAMAT': 'Jl. Gatot Subroto No. 45, Bandung',
        'STATUS': 'FOLLOW_UP',
        'ESTIMASI NILAI': 120000000
      }
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);

    // Set column widths
    ws['!cols'] = [
      { wch: 28 }, // NAMA PERUSAHAAN
      { wch: 18 }, // BIDANG USAHA
      { wch: 20 }, // NAMA PIC
      { wch: 16 }, // NO TELEPON
      { wch: 25 }, // EMAIL
      { wch: 35 }, // ALAMAT
      { wch: 14 }, // STATUS
      { wch: 18 }, // ESTIMASI NILAI
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template Import Client');

    // Add info sheet
    const infoData = [
      { 'Kolom': 'NAMA PERUSAHAAN', 'Keterangan': 'Wajib diisi. Nama perusahaan/badan usaha.' },
      { 'Kolom': 'BIDANG USAHA', 'Keterangan': 'Opsional. Bidang usaha perusahaan.' },
      { 'Kolom': 'NAMA PIC', 'Keterangan': 'Opsional. Nama contact person.' },
      { 'Kolom': 'NO TELEPON', 'Keterangan': 'Opsional. Nomor telepon.' },
      { 'Kolom': 'EMAIL', 'Keterangan': 'Opsional. Alamat email.' },
      { 'Kolom': 'ALAMAT', 'Keterangan': 'Opsional. Alamat lengkap.' },
      { 'Kolom': 'STATUS', 'Keterangan': 'Opsional. Pilihan: NEW, FOLLOW_UP, VISIT, PRESENTASI, PENAWARAN, NEGOSIASI, DEAL, LOST, MAINTENANCE. Default: NEW' },
      { 'Kolom': 'ESTIMASI NILAI', 'Keterangan': 'Opsional. Estimasi nilai proyek dalam Rupiah (angka saja, tanpa titik/koma).' },
    ];
    const wsInfo = XLSX.utils.json_to_sheet(infoData);
    wsInfo['!cols'] = [{ wch: 20 }, { wch: 80 }];
    XLSX.utils.book_append_sheet(wb, wsInfo, 'Petunjuk');

    XLSX.writeFile(wb, 'Template_Import_Client_IMDACS.xlsx');
  };

  const validStatuses = Object.values(ClientStatus) as string[];

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);

        if (jsonData.length === 0) {
          alert('File Excel kosong atau format tidak sesuai');
          return;
        }

        // Map columns - support both template and common variations
        const rows: ImportRow[] = jsonData.map((row) => {
          const get = (keys: string[]): string => {
            for (const k of keys) {
              const val = row[k] ?? row[k.toUpperCase()] ?? row[k.toLowerCase()];
              if (val !== undefined && val !== null) return String(val).trim();
            }
            return '';
          };
          const getNum = (keys: string[]): number => {
            const v = get(keys);
            return parseFloat(v.replace(/[^0-9.-]/g, '')) || 0;
          };

          let status = get(['STATUS', 'Status', 'status']).toUpperCase().replace(/\s+/g, '_');
          if (!validStatuses.includes(status)) status = 'NEW';

          return {
            name: get(['NAMA PERUSAHAAN', 'NAMA_PERUSAHAAN', 'PERUSAHAAN', 'Nama Perusahaan', 'Nama', 'NAME', 'BADAN USAHA', 'Company']),
            industry: get(['BIDANG USAHA', 'BIDANG_USAHA', 'BIDANG', 'Bidang Usaha', 'Bidang', 'INDUSTRY', 'Industry']),
            picName: get(['NAMA PIC', 'NAMA_PIC', 'PIC', 'Nama PIC', 'Contact Person', 'PIC_NAME', 'picName']),
            phone: get(['NO TELEPON', 'NO_TELEPON', 'TELEPON', 'PHONE', 'No Telepon', 'Telepon', 'HP', 'No HP']),
            email: get(['EMAIL', 'Email', 'E-MAIL', 'E-mail']),
            address: get(['ALAMAT', 'Alamat', 'ADDRESS', 'Address']),
            status,
            estimatedValue: getNum(['ESTIMASI NILAI', 'ESTIMASI_NILAI', 'ESTIMASI', 'Estimasi Nilai', 'NILAI', 'Nilai', 'ESTIMATED_VALUE', 'Value']),
          };
        }).filter(r => r.name.length > 0);

        if (rows.length === 0) {
          alert('Tidak ada data valid ditemukan. Pastikan kolom "NAMA PERUSAHAAN" terisi.');
          return;
        }

        setImportRows(rows);
        setImportStep('preview');
      } catch {
        alert('Gagal membaca file Excel. Pastikan format file benar (.xlsx / .xls)');
      }
    };
    reader.readAsArrayBuffer(file);

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveImportRow = (idx: number) => {
    setImportRows(prev => prev.filter((_, i) => i !== idx));
  };

  const handleImport = async () => {
    if (importRows.length === 0) return;
    setIsImporting(true);
    try {
      const result = await onImportClients(importRows.map(r => ({
        name: r.name,
        industry: r.industry || '-',
        picName: r.picName || '-',
        phone: r.phone,
        email: r.email,
        address: r.address,
        status: r.status as ClientStatus,
        estimatedValue: r.estimatedValue,
      })));
      setImportResult(result);
      setImportStep('result');
    } catch (err: unknown) {
      alert('Gagal import: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setIsImporting(false);
    }
  };

  const closeImport = () => {
    setShowImport(false);
    setImportStep('upload');
    setImportRows([]);
    setImportResult(null);
    setImportFileName('');
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Client Management</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {isManager ? 'Monitor seluruh portofolio client tim marketing' : 'Track your portfolio and business progress'}
          </p>
        </div>
        {!isManager && (
          <div className="flex items-center gap-2">
            <button onClick={() => setShowImport(true)}
              className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all text-sm font-semibold active:scale-[0.98] shadow-sm">
              <i className="fa-solid fa-file-import text-emerald-500"></i>
              <span className="hidden sm:inline">Import Excel</span><span className="sm:hidden">Import</span>
            </button>
            <button onClick={() => setIsAdding(true)}
              className="bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-indigo-500/20 text-sm font-semibold active:scale-[0.98]">
              <i className="fa-solid fa-plus"></i>
              <span className="hidden sm:inline">New Client</span><span className="sm:hidden">Add</span>
            </button>
          </div>
        )}
      </div>

      {/* ═══ Manager KPI Cards ═══ */}
      {isManager && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 card-hover">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Client</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{stats.total}</p>
          </div>
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 card-hover">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Deal</p>
            <p className="text-2xl font-bold text-green-600 mt-1">{stats.deals}</p>
          </div>
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 card-hover">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pipeline Value</p>
            <p className="text-lg font-bold text-indigo-600 mt-1">{formatCurrency(stats.pipelineValue)}</p>
          </div>
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 card-hover">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Deal Value</p>
            <p className="text-lg font-bold text-emerald-600 mt-1">{formatCurrency(stats.dealValue)}</p>
          </div>
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 card-hover">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Stagnant ({'>'}7d)</p>
            <p className={`text-2xl font-bold mt-1 ${stats.stagnant > 0 ? 'text-red-500' : 'text-green-500'}`}>{stats.stagnant}</p>
          </div>
        </div>
      )}

      {/* ═══ Marketing Filter (Manager only) ═══ */}
      {isManager && marketingUsers.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">
            <i className="fa-solid fa-user-group mr-1.5"></i>Filter by Marketing
          </p>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setMarketingFilter('all')}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                marketingFilter === 'all'
                  ? 'bg-slate-800 text-white shadow-lg'
                  : 'bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-200'
              }`}>
              <i className="fa-solid fa-users text-[10px]"></i>
              Semua Tim ({myClients.length})
            </button>
            {marketingUsers.map(m => (
              <button key={m.id} onClick={() => setMarketingFilter(marketingFilter === m.id ? 'all' : m.id)}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                  marketingFilter === m.id
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}>
                {m.avatar && <img src={m.avatar} className="w-5 h-5 rounded-full object-cover border border-white" alt="" />}
                {m.name.split(' ')[0]}
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  marketingFilter === m.id ? 'bg-white/20' : 'bg-slate-200 text-slate-500'
                }`}>{marketingClientCounts[m.id] || 0}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Status chips */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        <button onClick={() => setStatusFilter('all')}
          className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${statusFilter === 'all' ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 border border-slate-200'}`}>
          All ({filteredClients.length})
        </button>
        {statusCounts.map(s => (
          <button key={s.status} onClick={() => setStatusFilter(statusFilter === s.status ? 'all' : s.status)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${statusFilter === s.status ? 'bg-slate-800 text-white' : `border ${STATUS_COLORS[s.status]}`}`}>
            {s.status.replace('_', ' ')} ({s.count})
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-3 lg:p-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
            <input type="text" placeholder="Cari nama perusahaan, PIC, atau bidang usaha..."
              className="pl-10 pr-4 py-2.5 w-full bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 outline-none text-sm"
              value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <div className="hidden sm:flex items-center bg-slate-100 rounded-lg p-0.5">
            <button onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === 'table' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>
              <i className="fa-solid fa-table-list mr-1"></i> Table
            </button>
            <button onClick={() => setViewMode('card')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === 'card' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>
              <i className="fa-solid fa-grid-2 mr-1"></i> Cards
            </button>
          </div>
        </div>
      </div>

      {/* ═══ TABLE VIEW ═══ */}
      {viewMode === 'table' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50/80 text-slate-500 uppercase text-[10px] font-bold tracking-wider">
                <tr>
                  <th className="px-4 py-3.5">Perusahaan</th>
                  {isManager && <th className="px-4 py-3.5">Marketing</th>}
                  <th className="px-4 py-3.5">Bidang</th>
                  <th className="px-4 py-3.5">PIC</th>
                  <th className="px-4 py-3.5">Kontak</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5 text-right">Estimasi</th>
                  <th className="px-4 py-3.5 text-center">Update</th>
                  <th className="px-4 py-3.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredClients.map(client => {
                  const days = getStagnantDays(client.lastUpdate);
                  const isStagnant = days > 7 && client.status !== ClientStatus.DEAL && client.status !== ClientStatus.LOST;
                  return (
                    <tr key={client.id} className={`hover:bg-slate-50/50 transition-colors group ${isStagnant ? 'bg-red-50/30' : ''}`}>
                      <td className="px-4 py-3.5">
                        <button onClick={() => setDetailClient(client)} className="text-left">
                          <div className="font-semibold text-slate-800 text-sm hover:text-indigo-600 transition-colors">{client.name}</div>
                          {client.address && client.address !== '-' && (
                            <div className="text-[10px] text-slate-400 truncate max-w-[200px]">{client.address}</div>
                          )}
                        </button>
                      </td>
                      {isManager && (
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            {getMarketingAvatar(client.marketingId) && (
                              <img src={getMarketingAvatar(client.marketingId)} className="w-6 h-6 rounded-full object-cover border border-slate-200" alt="" />
                            )}
                            <span className="text-xs font-medium text-slate-700">{getMarketingName(client.marketingId)}</span>
                          </div>
                        </td>
                      )}
                      <td className="px-4 py-3.5 text-xs text-slate-600">{client.industry !== '-' ? client.industry : <span className="text-slate-300">—</span>}</td>
                      <td className="px-4 py-3.5 text-xs font-medium text-slate-700">{client.picName !== '-' ? client.picName : <span className="text-slate-300">—</span>}</td>
                      <td className="px-4 py-3.5">
                        {(client.phone || client.email) ? (
                          <div>
                            {client.phone && client.phone !== '-' && <div className="text-xs text-slate-600">{client.phone}</div>}
                            {client.email && client.email !== '-' && <div className="text-[10px] text-indigo-500 truncate max-w-[160px]">{client.email}</div>}
                          </div>
                        ) : <span className="text-xs text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border ${STATUS_COLORS[client.status]}`}>
                          {client.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        {client.estimatedValue > 0 ? (
                          <span className="text-xs font-semibold text-emerald-600">{formatCurrency(client.estimatedValue)}</span>
                        ) : <span className="text-xs text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <div className="flex flex-col items-center">
                          <span className="text-[10px] text-slate-400">
                            {client.lastUpdate ? new Date(client.lastUpdate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : '-'}
                          </span>
                          {isStagnant && (
                            <span className="text-[9px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full mt-0.5">
                              {days}d ago
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setDetailClient(client)}
                            className="w-7 h-7 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 flex items-center justify-center transition-all"
                            title="Detail">
                            <i className="fa-solid fa-eye text-xs"></i>
                          </button>
                          <button onClick={() => openEdit(client)}
                            className="w-7 h-7 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 flex items-center justify-center transition-all"
                            title="Edit">
                            <i className="fa-solid fa-pen-to-square text-xs"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredClients.length === 0 && (
                  <tr><td colSpan={isManager ? 9 : 8} className="px-6 py-16 text-center text-slate-400 text-sm">Tidak ada client ditemukan</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {/* Table footer with count */}
          <div className="px-4 py-3 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between">
            <span className="text-[11px] text-slate-400">Menampilkan {filteredClients.length} dari {myClients.length} client</span>
            {isManager && marketingFilter !== 'all' && (
              <button onClick={() => setMarketingFilter('all')} className="text-[11px] text-indigo-600 font-semibold hover:text-indigo-700">
                <i className="fa-solid fa-xmark mr-1"></i>Reset filter
              </button>
            )}
          </div>
        </div>
      )}

      {/* ═══ CARD VIEW ═══ */}
      {viewMode === 'card' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-4">
          {filteredClients.map(client => {
            const days = getStagnantDays(client.lastUpdate);
            const isStagnant = days > 7 && client.status !== ClientStatus.DEAL && client.status !== ClientStatus.LOST;
            return (
              <div key={client.id} className={`bg-white rounded-2xl shadow-sm border card-hover group ${isStagnant ? 'border-red-200' : 'border-slate-100'}`}>
                {/* Card header */}
                <div className="p-4 pb-0">
                  <div className="flex items-start justify-between mb-3">
                    <button onClick={() => setDetailClient(client)} className="flex items-center gap-3 min-w-0 text-left">
                      <div className="w-10 h-10 bg-gradient-to-br from-slate-100 to-slate-50 rounded-xl flex items-center justify-center text-slate-400 border border-slate-100 flex-shrink-0">
                        <i className="fa-solid fa-building"></i>
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-slate-800 text-sm truncate hover:text-indigo-600 transition-colors">{client.name}</h4>
                        <p className="text-[11px] text-slate-400">{client.industry !== '-' ? client.industry : '—'}</p>
                      </div>
                    </button>
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border flex-shrink-0 ${STATUS_COLORS[client.status]}`}>
                      {client.status.replace('_', ' ')}
                    </span>
                  </div>

                  {/* Marketing badge (Manager) */}
                  {isManager && (
                    <div className="flex items-center gap-2 mb-3 bg-indigo-50/50 px-3 py-2 rounded-lg border border-indigo-100/50">
                      {getMarketingAvatar(client.marketingId) && (
                        <img src={getMarketingAvatar(client.marketingId)} className="w-5 h-5 rounded-full object-cover" alt="" />
                      )}
                      <span className="text-[11px] font-semibold text-indigo-700">{getMarketingName(client.marketingId)}</span>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <i className="fa-solid fa-user-tie text-slate-300 w-4 text-center"></i>
                      <span className="truncate">{client.picName !== '-' ? client.picName : '—'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <i className="fa-solid fa-phone text-slate-300 w-4 text-center"></i>
                      <span>{(client.phone && client.phone !== '-') ? client.phone : '—'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <i className="fa-solid fa-envelope text-slate-300 w-4 text-center"></i>
                      <span className="truncate text-indigo-500">{(client.email && client.email !== '-') ? client.email : '—'}</span>
                    </div>
                    {client.estimatedValue > 0 && (
                      <div className="flex items-center gap-2 text-xs font-semibold text-green-600">
                        <i className="fa-solid fa-coins text-green-400 w-4 text-center"></i>
                        <span>{formatCurrency(client.estimatedValue)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card footer */}
                <div className="flex items-center justify-between p-4 pt-3 mt-2 border-t border-slate-50">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400">
                      <i className="fa-regular fa-clock mr-1"></i>
                      {client.lastUpdate ? new Date(client.lastUpdate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : '-'}
                    </span>
                    {isStagnant && (
                      <span className="text-[9px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full">{days}d</span>
                    )}
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => setDetailClient(client)} className="w-7 h-7 rounded-lg bg-slate-50 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 flex items-center justify-center transition-all">
                      <i className="fa-solid fa-eye text-xs"></i>
                    </button>
                    <button onClick={() => openEdit(client)} className="w-7 h-7 rounded-lg bg-slate-50 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 flex items-center justify-center transition-all">
                      <i className="fa-solid fa-pen-to-square text-xs"></i>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {filteredClients.length === 0 && (
            <div className="col-span-full py-16 text-center">
              <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <i className="fa-solid fa-building text-slate-300 text-2xl"></i>
              </div>
              <p className="text-slate-400 font-medium text-sm">Tidak ada client ditemukan</p>
              <p className="text-slate-300 text-xs mt-1">Coba ubah filter atau kata kunci</p>
            </div>
          )}
        </div>
      )}

      {/* ═══ DETAIL MODAL ═══ */}
      {detailClient && (
        <div className="fixed inset-0 bg-black/40 glass z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl overflow-hidden animate-slide-up max-h-[90vh]">
            {/* Header */}
            <div className="bg-gradient-to-r from-slate-800 to-slate-900 p-5 text-white">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center">
                    <i className="fa-solid fa-building text-lg"></i>
                  </div>
                  <div>
                    <h2 className="text-lg font-bold">{detailClient.name}</h2>
                    <p className="text-slate-400 text-xs">{detailClient.industry !== '-' ? detailClient.industry : '—'}</p>
                  </div>
                </div>
                <button onClick={() => setDetailClient(null)} className="w-8 h-8 rounded-lg bg-white/10 text-white/70 hover:text-white flex items-center justify-center">
                  <i className="fa-solid fa-xmark text-sm"></i>
                </button>
              </div>
            </div>

            <div className="p-5 space-y-5 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 200px)' }}>
              {/* Info grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="bg-slate-50 p-3 rounded-xl">
                  <p className="text-[9px] font-bold text-slate-400 uppercase">Status</p>
                  <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${STATUS_COLORS[detailClient.status]}`}>
                    {detailClient.status.replace('_', ' ')}
                  </span>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl">
                  <p className="text-[9px] font-bold text-slate-400 uppercase">Estimasi</p>
                  <p className="font-bold text-sm text-emerald-600 mt-1">
                    {detailClient.estimatedValue > 0 ? formatCurrency(detailClient.estimatedValue) : '—'}
                  </p>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl">
                  <p className="text-[9px] font-bold text-slate-400 uppercase">Marketing</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    {getMarketingAvatar(detailClient.marketingId) && (
                      <img src={getMarketingAvatar(detailClient.marketingId)} className="w-5 h-5 rounded-full object-cover" alt="" />
                    )}
                    <span className="font-semibold text-xs text-slate-700">{getMarketingName(detailClient.marketingId)}</span>
                  </div>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl">
                  <p className="text-[9px] font-bold text-slate-400 uppercase">PIC Client</p>
                  <p className="font-semibold text-xs mt-1">{detailClient.picName !== '-' ? detailClient.picName : '—'}</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl">
                  <p className="text-[9px] font-bold text-slate-400 uppercase">Telepon</p>
                  <p className="text-xs mt-1">{(detailClient.phone && detailClient.phone !== '-') ? detailClient.phone : '—'}</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl">
                  <p className="text-[9px] font-bold text-slate-400 uppercase">Email</p>
                  <p className="text-xs text-indigo-500 mt-1 truncate">{(detailClient.email && detailClient.email !== '-') ? detailClient.email : '—'}</p>
                </div>
              </div>

              {detailClient.address && detailClient.address !== '-' && (
                <div className="bg-slate-50 p-3 rounded-xl">
                  <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Alamat</p>
                  <p className="text-xs text-slate-700">{detailClient.address}</p>
                </div>
              )}

              {/* Activity history */}
              <div>
                <h3 className="font-bold text-sm text-slate-800 mb-3 flex items-center gap-2">
                  <i className="fa-solid fa-timeline text-indigo-500"></i>
                  Riwayat Aktivitas
                  <span className="text-[10px] text-slate-400 font-medium bg-slate-100 px-2 py-0.5 rounded-lg">{clientActivities.length}</span>
                </h3>
                {clientActivities.length > 0 ? (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {clientActivities.map(a => (
                      <div key={a.id} className="bg-slate-50 p-3 rounded-xl flex items-start gap-3">
                        <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center flex-shrink-0 border border-slate-100">
                          <i className={`text-xs ${
                            a.type === 'VISIT' ? 'fa-solid fa-location-dot text-purple-500' :
                            a.type === 'CALL' ? 'fa-solid fa-phone text-blue-500' :
                            a.type === 'MEETING' ? 'fa-solid fa-users text-indigo-500' :
                            a.type === 'POSTING' ? 'fa-solid fa-share-nodes text-orange-500' :
                            'fa-brands fa-whatsapp text-green-500'
                          }`}></i>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-bold text-slate-400">{a.date} · {a.startTime}</span>
                            {isManager && <span className="text-[9px] text-indigo-500 font-medium">{getMarketingName(a.marketingId)}</span>}
                          </div>
                          <p className="text-xs text-slate-700 mt-0.5 leading-relaxed">{a.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 text-center text-slate-300">
                    <i className="fa-solid fa-inbox text-xl mb-2"></i>
                    <p className="text-xs">Belum ada aktivitas</p>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
              <button onClick={() => setDetailClient(null)} className="px-4 py-2 text-slate-600 font-medium rounded-xl hover:bg-slate-100 text-sm">Tutup</button>
              <button onClick={() => { openEdit(detailClient); setDetailClient(null); }}
                className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-500 flex items-center gap-1.5">
                <i className="fa-solid fa-pen-to-square text-xs"></i>Edit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ ADD CLIENT MODAL ═══ */}
      {isAdding && (
        <div className="fixed inset-0 bg-black/40 glass z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg overflow-hidden animate-slide-up max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Add New Client</h2>
                <p className="text-xs text-slate-400">Isi data perusahaan baru</p>
              </div>
              <button onClick={() => { setIsAdding(false); setFormData(emptyForm); }}
                className="w-8 h-8 rounded-lg bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center">
                <i className="fa-solid fa-xmark text-sm"></i>
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 140px)' }}>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Nama Perusahaan *</label>
                <input type="text" className="w-full border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 outline-none text-sm" placeholder="PT Contoh Saja"
                  value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Bidang Usaha *</label>
                  <input type="text" className="w-full border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 outline-none text-sm" placeholder="Logistik"
                    value={formData.industry} onChange={(e) => setFormData({...formData, industry: e.target.value})} />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Status Awal</label>
                  <select className="w-full border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 outline-none text-sm"
                    value={formData.status} onChange={(e) => setFormData({...formData, status: e.target.value as ClientStatus})}>
                    <option value="NEW">NEW</option>
                    <option value="FOLLOW_UP">FOLLOW UP</option>
                    <option value="PRESENTASI">PRESENTASI</option>
                    <option value="PENAWARAN">PENAWARAN</option>
                    <option value="NEGOSIASI">NEGOSIASI</option>
                    <option value="DEAL">DEAL</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Estimasi Nilai Proyek (Rp)</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">Rp</span>
                  <input type="number" className="w-full border border-slate-200 p-3 pl-10 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 outline-none text-sm" placeholder="0"
                    value={formData.estimatedValue || ''} onChange={(e) => setFormData({...formData, estimatedValue: parseFloat(e.target.value) || 0})} />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Nama PIC *</label>
                <input type="text" className="w-full border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 outline-none text-sm" placeholder="Contact person"
                  value={formData.picName} onChange={(e) => setFormData({...formData, picName: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">No. Telepon</label>
                  <input type="tel" className="w-full border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 outline-none text-sm" placeholder="08xxx"
                    value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Email</label>
                  <input type="email" className="w-full border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 outline-none text-sm" placeholder="email@co.com"
                    value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Alamat</label>
                <textarea className="w-full border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 outline-none text-sm h-20 resize-none" placeholder="Alamat lengkap"
                  value={formData.address} onChange={(e) => setFormData({...formData, address: e.target.value})} />
              </div>
            </div>
            <div className="p-5 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 sticky bottom-0">
              <button onClick={() => { setIsAdding(false); setFormData(emptyForm); }} className="px-5 py-2.5 text-slate-600 font-medium rounded-xl hover:bg-slate-100 text-sm">Batal</button>
              <button onClick={handleSave} disabled={isSaving}
                className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-500 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20 flex items-center gap-2 text-sm active:scale-[0.98]">
                {isSaving ? <><i className="fa-solid fa-spinner fa-spin"></i>Saving...</> : <><i className="fa-solid fa-check"></i>Save Client</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ EDIT CLIENT MODAL ═══ */}
      {editingClient && (
        <div className="fixed inset-0 bg-black/40 glass z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg overflow-hidden animate-slide-up max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Edit Client</h2>
                <p className="text-xs text-slate-400">Perbarui data {editingClient.name}</p>
              </div>
              <button onClick={() => setEditingClient(null)}
                className="w-8 h-8 rounded-lg bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center">
                <i className="fa-solid fa-xmark text-sm"></i>
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 140px)' }}>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Nama Perusahaan *</label>
                <input type="text" className="w-full border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 outline-none text-sm"
                  value={editFormData.name} onChange={(e) => setEditFormData({...editFormData, name: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Bidang Usaha *</label>
                  <input type="text" className="w-full border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 outline-none text-sm"
                    value={editFormData.industry} onChange={(e) => setEditFormData({...editFormData, industry: e.target.value})} />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Status</label>
                  <select className="w-full border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 outline-none text-sm"
                    value={editFormData.status} onChange={(e) => setEditFormData({...editFormData, status: e.target.value as ClientStatus})}>
                    {Object.values(ClientStatus).map(s => (
                      <option key={s} value={s}>{s.replace('_', ' ')}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Estimasi Nilai Proyek (Rp)</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">Rp</span>
                  <input type="number" className="w-full border border-slate-200 p-3 pl-10 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 outline-none text-sm" placeholder="0"
                    value={editFormData.estimatedValue || ''} onChange={(e) => setEditFormData({...editFormData, estimatedValue: parseFloat(e.target.value) || 0})} />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Nama PIC *</label>
                <input type="text" className="w-full border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 outline-none text-sm"
                  value={editFormData.picName} onChange={(e) => setEditFormData({...editFormData, picName: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">No. Telepon</label>
                  <input type="tel" className="w-full border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 outline-none text-sm" placeholder="08xxx"
                    value={editFormData.phone} onChange={(e) => setEditFormData({...editFormData, phone: e.target.value})} />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Email</label>
                  <input type="email" className="w-full border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 outline-none text-sm" placeholder="email@co.com"
                    value={editFormData.email} onChange={(e) => setEditFormData({...editFormData, email: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Alamat</label>
                <textarea className="w-full border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 outline-none text-sm h-20 resize-none" placeholder="Alamat lengkap"
                  value={editFormData.address} onChange={(e) => setEditFormData({...editFormData, address: e.target.value})} />
              </div>
            </div>
            <div className="p-5 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 sticky bottom-0">
              <button onClick={() => setEditingClient(null)} className="px-5 py-2.5 text-slate-600 font-medium rounded-xl hover:bg-slate-100 text-sm">Batal</button>
              <button onClick={handleEditSave} disabled={isSaving}
                className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-500 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20 flex items-center gap-2 text-sm active:scale-[0.98]">
                {isSaving ? <><i className="fa-solid fa-spinner fa-spin"></i>Saving...</> : <><i className="fa-solid fa-check"></i>Update Client</>}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ═══ IMPORT MODAL ═══ */}
      {showImport && (
        <div className="fixed inset-0 bg-black/40 glass z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-3xl overflow-hidden animate-slide-up max-h-[90vh]">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
              <div>
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <i className="fa-solid fa-file-import text-emerald-500"></i>
                  Import Client dari Excel
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {importStep === 'upload' && 'Upload file Excel untuk import data client secara massal'}
                  {importStep === 'preview' && `${importRows.length} data siap diimport — periksa dulu sebelum proses`}
                  {importStep === 'result' && 'Hasil import selesai'}
                </p>
              </div>
              <button onClick={closeImport}
                className="w-8 h-8 rounded-lg bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center">
                <i className="fa-solid fa-xmark text-sm"></i>
              </button>
            </div>

            <div className="overflow-y-auto" style={{ maxHeight: 'calc(90vh - 160px)' }}>

              {/* ─── Step 1: Upload ─── */}
              {importStep === 'upload' && (
                <div className="p-5 space-y-5">
                  {/* Download Template */}
                  <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-100 rounded-2xl p-5">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
                        <i className="fa-solid fa-file-excel text-emerald-600 text-xl"></i>
                      </div>
                      <div className="flex-1">
                        <h3 className="font-bold text-slate-800 text-sm">1. Download Template</h3>
                        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                          Download template Excel yang sudah diformat. Isi data client di sheet pertama, lalu upload kembali.
                        </p>
                        <button onClick={downloadTemplate}
                          className="mt-3 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all active:scale-[0.98] shadow-lg shadow-emerald-500/20">
                          <i className="fa-solid fa-download"></i>
                          Download Template Excel
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Upload Area */}
                  <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center hover:border-indigo-300 hover:bg-indigo-50/30 transition-all cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}>
                    <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileUpload} />
                    <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm border border-slate-100">
                      <i className="fa-solid fa-cloud-arrow-up text-indigo-400 text-2xl"></i>
                    </div>
                    <h3 className="font-bold text-slate-700 text-sm">2. Upload File Excel</h3>
                    <p className="text-xs text-slate-400 mt-1">Klik disini atau drag file ke area ini</p>
                    <p className="text-[10px] text-slate-300 mt-2">Format: .xlsx, .xls, .csv</p>
                  </div>

                  {/* Column Info */}
                  <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-4">
                    <p className="text-xs font-bold text-amber-700 flex items-center gap-1.5 mb-2">
                      <i className="fa-solid fa-circle-info"></i> Kolom yang didukung:
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                      {['NAMA PERUSAHAAN *', 'BIDANG USAHA', 'NAMA PIC', 'NO TELEPON', 'EMAIL', 'ALAMAT', 'STATUS', 'ESTIMASI NILAI'].map(col => (
                        <span key={col} className={`text-[10px] px-2 py-1 rounded-lg ${col.includes('*') ? 'bg-red-50 text-red-600 font-bold border border-red-100' : 'bg-white text-slate-500 border border-slate-100'}`}>
                          {col}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ─── Step 2: Preview ─── */}
              {importStep === 'preview' && (
                <div className="p-5 space-y-4">
                  {/* File info */}
                  <div className="flex items-center gap-3 bg-indigo-50 p-3 rounded-xl border border-indigo-100">
                    <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                      <i className="fa-solid fa-file-excel text-indigo-600"></i>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate">{importFileName}</p>
                      <p className="text-[10px] text-indigo-600 font-medium">{importRows.length} baris data ditemukan</p>
                    </div>
                    <button onClick={() => { setImportStep('upload'); setImportRows([]); }}
                      className="text-xs text-slate-400 hover:text-red-500 font-medium flex items-center gap-1">
                      <i className="fa-solid fa-rotate-left text-[10px]"></i>Ganti file
                    </button>
                  </div>

                  {/* Preview table */}
                  <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead className="bg-slate-50 text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                          <tr>
                            <th className="px-3 py-2.5 w-8">#</th>
                            <th className="px-3 py-2.5">Perusahaan</th>
                            <th className="px-3 py-2.5">Bidang</th>
                            <th className="px-3 py-2.5">PIC</th>
                            <th className="px-3 py-2.5">Telepon</th>
                            <th className="px-3 py-2.5">Status</th>
                            <th className="px-3 py-2.5 text-right">Estimasi</th>
                            <th className="px-3 py-2.5 w-8"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {importRows.map((row, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/50 text-xs">
                              <td className="px-3 py-2.5 text-slate-300 text-[10px]">{idx + 1}</td>
                              <td className="px-3 py-2.5 font-semibold text-slate-800 max-w-[200px] truncate">{row.name}</td>
                              <td className="px-3 py-2.5 text-slate-500">{row.industry || <span className="text-slate-300">—</span>}</td>
                              <td className="px-3 py-2.5 text-slate-600">{row.picName || <span className="text-slate-300">—</span>}</td>
                              <td className="px-3 py-2.5 text-slate-500">{row.phone || <span className="text-slate-300">—</span>}</td>
                              <td className="px-3 py-2.5">
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border ${STATUS_COLORS[row.status as ClientStatus] || 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                                  {row.status}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-right text-slate-600">
                                {row.estimatedValue > 0 ? formatCurrency(row.estimatedValue) : <span className="text-slate-300">—</span>}
                              </td>
                              <td className="px-3 py-2.5">
                                <button onClick={() => handleRemoveImportRow(idx)}
                                  className="w-6 h-6 rounded-md text-slate-300 hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition-all"
                                  title="Hapus baris">
                                  <i className="fa-solid fa-xmark text-[10px]"></i>
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {importRows.length === 0 && (
                    <div className="text-center py-8 text-slate-400">
                      <i className="fa-solid fa-trash-can text-2xl mb-2"></i>
                      <p className="text-sm font-medium">Semua baris sudah dihapus</p>
                      <button onClick={() => { setImportStep('upload'); setImportRows([]); }}
                        className="mt-2 text-xs text-indigo-600 font-bold">Upload ulang</button>
                    </div>
                  )}
                </div>
              )}

              {/* ─── Step 3: Result ─── */}
              {importStep === 'result' && importResult && (
                <div className="p-5 space-y-4">
                  {/* Summary cards */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 text-center">
                      <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-2">
                        <i className="fa-solid fa-check text-emerald-600"></i>
                      </div>
                      <p className="text-2xl font-bold text-emerald-600">{importResult.totalImported}</p>
                      <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Berhasil Import</p>
                    </div>
                    <div className={`p-4 rounded-xl border text-center ${importResult.totalSkipped > 0 ? 'bg-amber-50 border-amber-100' : 'bg-slate-50 border-slate-100'}`}>
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2 ${importResult.totalSkipped > 0 ? 'bg-amber-100' : 'bg-slate-100'}`}>
                        <i className={`fa-solid fa-forward ${importResult.totalSkipped > 0 ? 'text-amber-600' : 'text-slate-400'}`}></i>
                      </div>
                      <p className={`text-2xl font-bold ${importResult.totalSkipped > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{importResult.totalSkipped}</p>
                      <p className={`text-[10px] font-bold uppercase tracking-wider ${importResult.totalSkipped > 0 ? 'text-amber-500' : 'text-slate-400'}`}>Dilewati</p>
                    </div>
                  </div>

                  {/* Imported list */}
                  {importResult.imported.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-emerald-700 mb-2 flex items-center gap-1.5">
                        <i className="fa-solid fa-circle-check"></i>Client berhasil diimport:
                      </p>
                      <div className="space-y-1.5 max-h-40 overflow-y-auto">
                        {importResult.imported.map(c => (
                          <div key={c.id} className="flex items-center gap-2 bg-emerald-50/50 px-3 py-2 rounded-lg border border-emerald-100/50">
                            <i className="fa-solid fa-building text-emerald-400 text-xs"></i>
                            <span className="text-xs font-medium text-slate-700">{c.name}</span>
                            <span className="text-[10px] text-slate-400 ml-auto">{c.industry}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Skipped list */}
                  {importResult.skipped.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-amber-700 mb-2 flex items-center gap-1.5">
                        <i className="fa-solid fa-triangle-exclamation"></i>Data yang dilewati:
                      </p>
                      <div className="space-y-1.5 max-h-40 overflow-y-auto">
                        {importResult.skipped.map((s, i) => (
                          <div key={i} className="flex items-center gap-2 bg-amber-50/50 px-3 py-2 rounded-lg border border-amber-100/50">
                            <i className="fa-solid fa-forward text-amber-400 text-xs"></i>
                            <span className="text-xs text-slate-600">
                              Baris {s.row}{s.name ? ` (${s.name})` : ''}: <span className="font-medium text-amber-700">{s.reason}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2 sticky bottom-0">
              {importStep === 'upload' && (
                <button onClick={closeImport} className="px-5 py-2.5 text-slate-600 font-medium rounded-xl hover:bg-slate-100 text-sm">Tutup</button>
              )}
              {importStep === 'preview' && (
                <>
                  <button onClick={() => { setImportStep('upload'); setImportRows([]); }}
                    className="px-4 py-2.5 text-slate-600 font-medium rounded-xl hover:bg-slate-100 text-sm">
                    <i className="fa-solid fa-arrow-left mr-1.5 text-xs"></i>Kembali
                  </button>
                  <button onClick={handleImport} disabled={isImporting || importRows.length === 0}
                    className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/20 flex items-center gap-2 text-sm active:scale-[0.98]">
                    {isImporting ? (
                      <><i className="fa-solid fa-spinner fa-spin"></i>Importing...</>
                    ) : (
                      <><i className="fa-solid fa-file-import"></i>Import {importRows.length} Client</>
                    )}
                  </button>
                </>
              )}
              {importStep === 'result' && (
                <button onClick={closeImport}
                  className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20 flex items-center gap-2 text-sm active:scale-[0.98]">
                  <i className="fa-solid fa-check mr-1"></i>Selesai
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default ClientManager;
