
const MONITRA_BASE = 'https://monitra.assetsmanagement.shop/api';
const MONITRA_HEADERS = { 'X-User-Id': '1' };

async function monitraRequest<T>(url: string): Promise<T> {
  const res = await fetch(`${MONITRA_BASE}${url}`, { headers: MONITRA_HEADERS });
  if (!res.ok) throw new Error(`MONITRA API error: ${res.status}`);
  return res.json();
}

// Types
export interface SpvReport {
  id: number;
  user_id: number;
  tanggal: string;
  judul: string;
  isi: string;
  kegiatan: string;
  kendala: string;
  rencana: string;
  created_at: string;
  updated_at: string;
  author_name: string;
  author_role: 'Supervisor' | 'Manager';
}

export interface AuditorReport {
  id: number;
  assignment_id: number;
  tanggal: string;
  jam_mulai: string;
  jam_selesai: string;
  area_diaudit: string;
  deskripsi_pekerjaan: string;
  temuan: string;
  progress: number;
  kendala: string;
  status: 'Ongoing' | 'Completed';
  approval_status: 'Pending' | 'Approved' | 'Rejected';
  approved_by: number | null;
  approved_at: string | null;
  supervisor_notes: string | null;
  created_at: string;
  nama_pt: string;
  auditor_name: string;
  auditor_id: number;
}

export interface MonitaUser {
  id: number;
  username: string;
  full_name: string;
  role: 'Admin' | 'Auditor' | 'Supervisor' | 'Manager';
  is_active: boolean;
  email: string;
  supervisor_id: number | null;
  supervisor_name: string | null;
}

// API calls
export const getSpvReports = () => monitraRequest<SpvReport[]>('/spv-reports');
export const getAuditorReports = () => monitraRequest<AuditorReport[]>('/reports');
export const getMonitaUsers = () => monitraRequest<MonitaUser[]>('/users');
