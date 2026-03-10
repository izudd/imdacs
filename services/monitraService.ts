
const MONITRA_BASE = 'https://monitra.assetsmanagement.shop/api';
const MONITRA_HEADERS: Record<string, string> = { 'X-User-Id': '1', 'Content-Type': 'application/json' };

async function monitraRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${MONITRA_BASE}${url}`, {
    ...options,
    headers: { ...MONITRA_HEADERS, ...(options?.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`MONITRA API error ${res.status}: ${text}`);
  }
  return res.json();
}

async function monitraPost<T>(url: string, body: Record<string, unknown>): Promise<T> {
  return monitraRequest<T>(url, { method: 'POST', body: JSON.stringify(body) });
}

async function monitraPatch<T>(url: string, body?: Record<string, unknown>): Promise<T> {
  return monitraRequest<T>(url, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined });
}

// ═══════════════ TYPES ═══════════════

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
  kode_unik?: string;
  supervisor_id: number | null;
  supervisor_name: string | null;
  email_reminder?: boolean;
}

export interface MonitraPT {
  id: number;
  nama_pt: string;
  alamat: string;
  PIC: string;
  periode_start: string | null;
  periode_end: string | null;
  status: 'Active' | 'Archived';
  archived_at: string | null;
}

export interface MonitraAssignment {
  id: number;
  pt_id: number;
  auditor_id: number;
  start_date: string | null;
  end_date: string | null;
  status: string;
  nama_pt: string;
  auditor_name: string;
}

export interface MonitraVisitLog {
  id: number;
  assignment_id: number;
  auditor_id: number;
  pt_id: number;
  type: 'check_in' | 'check_out';
  photo: string;
  latitude: number | null;
  longitude: number | null;
  notes: string;
  approval_status: 'Pending' | 'Approved' | 'Rejected';
  supervisor_notes: string;
  approved_by: number | null;
  timestamp: string;
  created_at: string;
  nama_pt: string;
  auditor_name: string;
}

export interface MonitraStats {
  totalPT: number;
  totalAuditors: number | null;
  totalReports: number | null;
  pendingApprovals: number;
  totalFindings: number;
  ptProgress: Array<{
    pt_id: number;
    nama_pt: string;
    latest_progress: number;
  }>;
  isAuditor: boolean;
}

export interface MonitraProgress {
  pt_id: number;
  nama_pt: string;
  periode_start: string | null;
  periode_end: string | null;
  auditor_id: number;
  auditor_name: string;
  assignment_id: number;
  latest_progress: number;
  total_reports: number;
  approved_reports: number;
  pending_reports: number;
  rejected_reports: number;
  latest_report_date: string | null;
}

export interface MonitraArchivePT {
  id: number;
  nama_pt: string;
  status: string;
  archived_at: string | null;
  total_auditors: number;
  auditor_names: string;
  total_reports: number;
  approved_reports: number;
  total_findings: number;
  final_progress: number;
}

export interface MonitraNotification {
  id: number;
  user_id: number;
  type: string;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
}

// ═══════════════ API CALLS ═══════════════

// --- Users ---
export const getMonitaUsers = () => monitraRequest<MonitaUser[]>('/users');
export const getSupervisors = () => monitraRequest<Array<{ id: number; full_name: string }>>('/supervisors');
export const getAuditors = () => monitraRequest<Array<{ id: number; full_name: string; supervisor_id: number | null }>>('/auditors');

// --- PT Management ---
export const getPTs = () => monitraRequest<MonitraPT[]>('/pts');
export const createPT = (data: { nama_pt: string; alamat?: string; PIC: string; periode_start?: string; periode_end?: string }) =>
  monitraPost<{ id: number }>('/pts', data as Record<string, unknown>);
export const updatePT = (id: number, data: Partial<MonitraPT>) =>
  monitraPatch<{ success: boolean }>(`/pts/${id}`, data as Record<string, unknown>);
export const archivePT = (id: number) =>
  monitraPatch<{ success: boolean }>(`/pts/${id}/archive`);
export const restorePT = (id: number) =>
  monitraPatch<{ success: boolean }>(`/pts/${id}/restore`);

// --- Assignments ---
export const getAssignments = () => monitraRequest<MonitraAssignment[]>('/assignments');
export const createAssignment = (data: { pt_id: number; auditor_id: number; start_date?: string; end_date?: string }) =>
  monitraPost<{ id: number }>('/assignments', data as Record<string, unknown>);

// --- Daily Reports ---
export const getAuditorReports = () => monitraRequest<AuditorReport[]>('/reports');
export const approveReport = (id: number, status: 'Approved' | 'Rejected', supervisor_notes?: string) =>
  monitraPatch<{ success: boolean }>(`/reports/${id}/approve`, { status, supervisor_notes } as Record<string, unknown>);

// --- SPV Reports ---
export const getSpvReports = () => monitraRequest<SpvReport[]>('/spv-reports');

// --- Visit Logs ---
export const getVisitLogs = () => monitraRequest<MonitraVisitLog[]>('/visits');
export const approveVisit = (id: number, status: 'Approved' | 'Rejected', supervisor_notes?: string) =>
  monitraPatch<{ success: boolean }>(`/visits/${id}/status`, { status, supervisor_notes } as Record<string, unknown>);

// --- Stats & Progress ---
export const getStats = () => monitraRequest<MonitraStats>('/stats');
export const getProgress = () => monitraRequest<MonitraProgress[]>('/progress');

// --- Archive ---
export const getArchive = () => monitraRequest<MonitraArchivePT[]>('/archive');
export const getArchiveReports = (ptId: number) => monitraRequest<AuditorReport[]>(`/archive/reports/${ptId}`);

// --- Notifications ---
export const getNotifications = () => monitraRequest<MonitraNotification[]>('/notifications');
export const markAllRead = () => monitraPatch<{ success: boolean }>('/notifications/read-all');
