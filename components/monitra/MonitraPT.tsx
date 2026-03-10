import React, { useState, useEffect, useMemo } from 'react';
import * as monitra from '../../services/monitraService';
import type { MonitraPT as PT } from '../../services/monitraService';

const MonitraPT: React.FC = () => {
  const [pts, setPts] = useState<PT[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingPT, setEditingPT] = useState<PT | null>(null);
  const [formData, setFormData] = useState({ nama_pt: '', alamat: '', PIC: '', periode_start: '', periode_end: '' });
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState<number | null>(null);

  const fetchPTs = async () => {
    try {
      const data = await monitra.getPTs();
      setPts(data);
    } catch (e) {
      console.error('Failed to load PTs', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPTs(); }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return pts;
    const q = search.toLowerCase();
    return pts.filter(p =>
      p.nama_pt.toLowerCase().includes(q) ||
      p.PIC.toLowerCase().includes(q) ||
      p.alamat.toLowerCase().includes(q)
    );
  }, [pts, search]);

  const handleSave = async () => {
    if (!formData.nama_pt.trim() || !formData.PIC.trim()) return;
    setSaving(true);
    try {
      if (editingPT) {
        await monitra.updatePT(editingPT.id, formData as unknown as Partial<PT>);
      } else {
        await monitra.createPT(formData);
      }
      setShowForm(false);
      setEditingPT(null);
      setFormData({ nama_pt: '', alamat: '', PIC: '', periode_start: '', periode_end: '' });
      setLoading(true);
      fetchPTs();
    } catch (e) {
      alert('Gagal menyimpan: ' + (e instanceof Error ? e.message : 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (id: number) => {
    setArchiving(id);
    try {
      await monitra.archivePT(id);
      setLoading(true);
      fetchPTs();
    } catch (e) {
      alert('Gagal arsip PT');
    } finally {
      setArchiving(null);
    }
  };

  const openEdit = (pt: PT) => {
    setEditingPT(pt);
    setFormData({
      nama_pt: pt.nama_pt,
      alamat: pt.alamat || '',
      PIC: pt.PIC || '',
      periode_start: pt.periode_start || '',
      periode_end: pt.periode_end || '',
    });
    setShowForm(true);
  };

  const openCreate = () => {
    setEditingPT(null);
    setFormData({ nama_pt: '', alamat: '', PIC: '', periode_start: '', periode_end: '' });
    setShowForm(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <i className="fa-solid fa-spinner fa-spin text-indigo-500 text-2xl mr-3"></i>
        <span className="text-slate-500 font-medium">Memuat data PT...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <i className="fa-solid fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari PT, PIC, alamat..."
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 outline-none" />
        </div>
        <button onClick={openCreate}
          className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-colors flex-shrink-0 shadow-lg shadow-indigo-500/25">
          <i className="fa-solid fa-plus mr-1.5"></i>Tambah PT
        </button>
      </div>

      {/* PT List */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
          <i className="fa-solid fa-building text-slate-200 text-4xl mb-3"></i>
          <p className="text-slate-400 font-bold">Belum ada PT</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map(pt => (
            <div key={pt.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <i className="fa-solid fa-building text-indigo-600 text-xs"></i>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate">{pt.nama_pt}</p>
                      <p className="text-[10px] text-slate-400">PIC: {pt.PIC}</p>
                    </div>
                  </div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${
                  pt.status === 'Active' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'
                }`}>{pt.status}</span>
              </div>

              {pt.alamat && (
                <p className="text-[11px] text-slate-500 mb-2 line-clamp-1">
                  <i className="fa-solid fa-location-dot mr-1 text-slate-400"></i>{pt.alamat}
                </p>
              )}

              {(pt.periode_start || pt.periode_end) && (
                <p className="text-[10px] text-slate-400 mb-3">
                  <i className="fa-solid fa-calendar mr-1"></i>
                  {pt.periode_start ? formatDate(pt.periode_start) : '?'} - {pt.periode_end ? formatDate(pt.periode_end) : 'Sekarang'}
                </p>
              )}

              <div className="flex items-center gap-2 pt-2 border-t border-slate-50">
                <button onClick={() => openEdit(pt)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[10px] font-bold transition-colors">
                  <i className="fa-solid fa-pen mr-1"></i>Edit
                </button>
                <button onClick={() => handleArchive(pt.id)} disabled={archiving === pt.id}
                  className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-600 rounded-lg text-[10px] font-bold transition-colors disabled:opacity-50">
                  {archiving === pt.id ? <i className="fa-solid fa-spinner fa-spin"></i> : <><i className="fa-solid fa-box-archive mr-1"></i>Arsipkan</>}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={() => setShowForm(false)} />
          <div className="relative bg-white rounded-3xl shadow-2xl max-w-md w-full animate-slide-up">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-800">{editingPT ? 'Edit PT' : 'Tambah PT Baru'}</h3>
              <button onClick={() => setShowForm(false)} className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors">
                <i className="fa-solid fa-xmark text-slate-500 text-sm"></i>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nama PT *</label>
                <input type="text" value={formData.nama_pt} onChange={e => setFormData({ ...formData, nama_pt: e.target.value })}
                  className="w-full mt-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 outline-none"
                  placeholder="PT Contoh Indonesia" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Alamat</label>
                <input type="text" value={formData.alamat} onChange={e => setFormData({ ...formData, alamat: e.target.value })}
                  className="w-full mt-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 outline-none"
                  placeholder="Jl. Contoh No. 123" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">PIC (Person in Charge) *</label>
                <input type="text" value={formData.PIC} onChange={e => setFormData({ ...formData, PIC: e.target.value })}
                  className="w-full mt-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 outline-none"
                  placeholder="Nama PIC" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Periode Mulai</label>
                  <input type="date" value={formData.periode_start} onChange={e => setFormData({ ...formData, periode_start: e.target.value })}
                    className="w-full mt-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 outline-none" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Periode Selesai</label>
                  <input type="date" value={formData.periode_end} onChange={e => setFormData({ ...formData, periode_end: e.target.value })}
                    className="w-full mt-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 outline-none" />
                </div>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <button onClick={() => setShowForm(false)}
                  className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200 transition-colors">
                  Batal
                </button>
                <button onClick={handleSave} disabled={saving || !formData.nama_pt.trim() || !formData.PIC.trim()}
                  className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50 shadow-lg shadow-indigo-500/25">
                  {saving ? <i className="fa-solid fa-spinner fa-spin"></i> : editingPT ? 'Simpan' : 'Tambah'}
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

export default MonitraPT;
