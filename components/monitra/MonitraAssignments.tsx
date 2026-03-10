import React, { useState, useEffect, useMemo } from 'react';
import * as monitra from '../../services/monitraService';
import type { MonitraAssignment, MonitraPT } from '../../services/monitraService';

const MonitraAssignments: React.FC = () => {
  const [assignments, setAssignments] = useState<MonitraAssignment[]>([]);
  const [pts, setPts] = useState<MonitraPT[]>([]);
  const [auditors, setAuditors] = useState<Array<{ id: number; full_name: string; supervisor_id: number | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ pt_id: 0, auditor_id: 0, start_date: '', end_date: '' });
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    try {
      const [a, p, aud] = await Promise.all([
        monitra.getAssignments(),
        monitra.getPTs(),
        monitra.getAuditors(),
      ]);
      setAssignments(a);
      setPts(p);
      setAuditors(aud);
    } catch (e) {
      console.error('Failed to load assignments', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return assignments;
    const q = search.toLowerCase();
    return assignments.filter(a =>
      a.nama_pt.toLowerCase().includes(q) ||
      a.auditor_name.toLowerCase().includes(q)
    );
  }, [assignments, search]);

  // Group by PT
  const groupedByPT = useMemo(() => {
    const map = new Map<string, MonitraAssignment[]>();
    filtered.forEach(a => {
      const key = a.nama_pt;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    });
    return Array.from(map.entries());
  }, [filtered]);

  const handleSave = async () => {
    if (!formData.pt_id || !formData.auditor_id) return;
    setSaving(true);
    try {
      await monitra.createAssignment(formData);
      setShowForm(false);
      setFormData({ pt_id: 0, auditor_id: 0, start_date: '', end_date: '' });
      setLoading(true);
      fetchData();
    } catch (e) {
      alert('Gagal membuat assignment: ' + (e instanceof Error ? e.message : 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  // PTs that don't have assignments yet
  const unassignedPTs = useMemo(() => {
    const assignedPtIds = new Set(assignments.map(a => a.pt_id));
    return pts.filter(p => !assignedPtIds.has(p.id));
  }, [pts, assignments]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <i className="fa-solid fa-spinner fa-spin text-indigo-500 text-2xl mr-3"></i>
        <span className="text-slate-500 font-medium">Memuat data assignment...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
              <i className="fa-solid fa-link text-indigo-600 text-sm"></i>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Assignment</p>
              <p className="text-xl font-black text-slate-800">{assignments.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
              <i className="fa-solid fa-building text-emerald-600 text-sm"></i>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">PT Terassign</p>
              <p className="text-xl font-black text-slate-800">{new Set(assignments.map(a => a.pt_id)).size}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
              <i className="fa-solid fa-building-circle-exclamation text-amber-600 text-sm"></i>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Belum Diassign</p>
              <p className="text-xl font-black text-slate-800">{unassignedPTs.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Header bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <i className="fa-solid fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari PT atau auditor..."
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 outline-none" />
        </div>
        <button onClick={() => { setFormData({ pt_id: 0, auditor_id: 0, start_date: '', end_date: '' }); setShowForm(true); }}
          className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-colors flex-shrink-0 shadow-lg shadow-indigo-500/25">
          <i className="fa-solid fa-plus mr-1.5"></i>Tambah Assignment
        </button>
      </div>

      {/* Assignment List grouped by PT */}
      {groupedByPT.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
          <i className="fa-solid fa-link-slash text-slate-200 text-4xl mb-3"></i>
          <p className="text-slate-400 font-bold">Belum ada assignment</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groupedByPT.map(([ptName, items]) => (
            <div key={ptName} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
                    <i className="fa-solid fa-building text-indigo-600 text-xs"></i>
                  </div>
                  <span className="font-bold text-slate-700 text-sm">{ptName}</span>
                </div>
                <span className="bg-indigo-50 text-indigo-600 text-[10px] font-bold px-2 py-1 rounded-full">
                  {items.length} auditor
                </span>
              </div>
              <div className="divide-y divide-slate-50">
                {items.map(a => (
                  <div key={a.id} className="px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                        <span className="text-emerald-600 font-black text-xs">{a.auditor_name?.[0]}</span>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-700">{a.auditor_name}</p>
                        <p className="text-[10px] text-slate-400">
                          {a.start_date ? formatDate(a.start_date) : '?'} - {a.end_date ? formatDate(a.end_date) : 'Sekarang'}
                        </p>
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      a.status === 'Active' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'
                    }`}>{a.status}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showForm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={() => setShowForm(false)} />
          <div className="relative bg-white rounded-3xl shadow-2xl max-w-md w-full animate-slide-up">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-800">Tambah Assignment</h3>
              <button onClick={() => setShowForm(false)} className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors">
                <i className="fa-solid fa-xmark text-slate-500 text-sm"></i>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pilih PT *</label>
                <select value={formData.pt_id} onChange={e => setFormData({ ...formData, pt_id: Number(e.target.value) })}
                  className="w-full mt-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 outline-none">
                  <option value={0}>-- Pilih PT --</option>
                  {pts.map(p => (
                    <option key={p.id} value={p.id}>{p.nama_pt}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pilih Auditor *</label>
                <select value={formData.auditor_id} onChange={e => setFormData({ ...formData, auditor_id: Number(e.target.value) })}
                  className="w-full mt-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 outline-none">
                  <option value={0}>-- Pilih Auditor --</option>
                  {auditors.map(a => (
                    <option key={a.id} value={a.id}>{a.full_name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Mulai</label>
                  <input type="date" value={formData.start_date} onChange={e => setFormData({ ...formData, start_date: e.target.value })}
                    className="w-full mt-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 outline-none" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Selesai</label>
                  <input type="date" value={formData.end_date} onChange={e => setFormData({ ...formData, end_date: e.target.value })}
                    className="w-full mt-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 outline-none" />
                </div>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <button onClick={() => setShowForm(false)}
                  className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200 transition-colors">
                  Batal
                </button>
                <button onClick={handleSave} disabled={saving || !formData.pt_id || !formData.auditor_id}
                  className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50 shadow-lg shadow-indigo-500/25">
                  {saving ? <i className="fa-solid fa-spinner fa-spin"></i> : 'Assign'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const formatDate = (d: string) => new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

export default MonitraAssignments;
