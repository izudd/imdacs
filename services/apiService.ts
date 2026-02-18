
import { User, Client, Activity, EODReport, ReportStatus, AuditChecklistItem } from '../types';

const API_BASE = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ============ Auth ============
export const login = (username: string, password: string) =>
  request<User>('/auth/login.php', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });

export const checkSession = () =>
  request<{ authenticated: boolean; user?: User }>('/auth/session.php');

export const logout = () =>
  request<{ success: boolean }>('/auth/logout.php', { method: 'POST' });

// ============ Clients ============
export const getClients = (params?: { search?: string; status?: string; marketing_id?: string }) => {
  const qs = params ? new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([_, v]) => v))
  ).toString() : '';
  return request<Client[]>(`/clients.php${qs ? '?' + qs : ''}`);
};

export const addClient = (client: Partial<Client>) =>
  request<Client>('/clients.php', {
    method: 'POST',
    body: JSON.stringify(client),
  });

export const updateClient = (client: Partial<Client> & { id: string }) =>
  request<Client>('/clients.php', {
    method: 'PUT',
    body: JSON.stringify(client),
  });

export const quickAddClient = (name: string, estimatedValue?: number) =>
  addClient({ name, industry: '-', picName: '-', estimatedValue: estimatedValue || 0 });

export interface ImportResult {
  imported: Client[];
  skipped: { row: number; name?: string; reason: string }[];
  totalImported: number;
  totalSkipped: number;
}

export const importClients = (clients: Partial<Client>[]) =>
  request<ImportResult>('/clients.php', {
    method: 'PATCH',
    body: JSON.stringify({ clients }),
  });

// ============ Activities ============
export const getActivities = (params?: { date?: string; marketing_id?: string }) => {
  const qs = params ? new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([_, v]) => v))
  ).toString() : '';
  return request<Activity[]>(`/activities.php${qs ? '?' + qs : ''}`);
};

export const addActivity = (activity: Partial<Activity>) =>
  request<Activity>('/activities.php', {
    method: 'POST',
    body: JSON.stringify(activity),
  });

// ============ Check-in (multipart) ============
export const checkIn = (formData: FormData) =>
  fetch(`${API_BASE}/activities/checkin.php`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  }).then(async (r) => {
    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(err.error || `HTTP ${r.status}`);
    }
    return r.json() as Promise<Activity>;
  });

// ============ Upload ============
export const uploadPhoto = (formData: FormData) =>
  fetch(`${API_BASE}/upload.php`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  }).then(async (r) => {
    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(err.error || `HTTP ${r.status}`);
    }
    return r.json() as Promise<{ url: string }>;
  });

// ============ Reports ============
export const getReports = (params?: { date?: string; marketing_id?: string }) => {
  const qs = params ? new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([_, v]) => v))
  ).toString() : '';
  return request<EODReport[]>(`/reports.php${qs ? '?' + qs : ''}`);
};

export const submitReport = (report: Partial<EODReport>) =>
  request<EODReport>('/reports.php', {
    method: 'POST',
    body: JSON.stringify(report),
  });

export const updateReportStatus = (id: string, status: ReportStatus) =>
  request<EODReport>('/reports.php', {
    method: 'PUT',
    body: JSON.stringify({ id, status }),
  });

// ============ Users ============
export const getUsers = () => request<User[]>('/users.php');

export const createUser = (data: { name: string; username: string; password: string; role: string; supervisorId?: string | null }) =>
  request<User>('/users.php', { method: 'POST', body: JSON.stringify(data) });

export const updateUser = (data: { id: string; name?: string; role?: string; supervisorId?: string | null; isActive?: boolean; password?: string }) =>
  request<User>('/users.php', { method: 'PUT', body: JSON.stringify(data) });

// ============ Dashboard ============
export interface DashboardStats {
  totalClients: number;
  todayActivities: number;
  dealsThisMonth: number;
  eodStatus: string;
  dealValueThisMonth: number;
}

export const getDashboardStats = () => request<DashboardStats>('/dashboard.php');

// ============ Analytics ============
export interface MarketingMeta {
  id: string;
  name: string;
  shortName: string;
}

export interface DailyActivityData {
  date: string;
  label: string;
  total: number;
  [marketingId: string]: string | number;
}

export interface MonthlyActivityData {
  month: string;
  label: string;
  total: number;
  [marketingId: string]: string | number;
}

export interface EODComplianceData {
  date: string;
  label: string;
  submitted: number;
  missing: number;
  rate: number;
}

export const getDailyActivities = (period: 'week' | 'month' = 'month') =>
  request<{ data: DailyActivityData[]; marketing: MarketingMeta[]; period: string }>
    (`/analytics.php?type=daily_activities&period=${period}`);

export const getMonthlyActivities = () =>
  request<{ data: MonthlyActivityData[]; marketing: MarketingMeta[] }>
    ('/analytics.php?type=monthly_activities');

export const getEODCompliance = (period: 'week' | 'month' = 'month') =>
  request<{ data: EODComplianceData[]; totalMarketing: number; period: string }>
    (`/analytics.php?type=eod_compliance&period=${period}`);

// ============ Team (Supervisor) ============
export const getTeamActivities = (params?: { date?: string }) => {
  const base: Record<string, string> = { scope: 'team' };
  if (params?.date) base.date = params.date;
  const qs = new URLSearchParams(base).toString();
  return request<Activity[]>(`/activities.php?${qs}`);
};

export const getTeamClients = () =>
  request<Client[]>('/clients.php?scope=team');

export const getTeamReports = (params?: { date?: string }) => {
  const base: Record<string, string> = { scope: 'team' };
  if (params?.date) base.date = params.date;
  const qs = new URLSearchParams(base).toString();
  return request<EODReport[]>(`/reports.php?${qs}`);
};

// ============ Audit Checklist ============
export const getAuditChecklist = (clientId: string) =>
  request<AuditChecklistItem[]>(`/audit_checklist.php?client_id=${clientId}`);

export const updateAuditChecklistItem = (id: number, isChecked: boolean) =>
  request<{ success: boolean }>('/audit_checklist.php', {
    method: 'PUT',
    body: JSON.stringify({ id, isChecked }),
  });

// ============ Notifications ============
export const sendAssignNotification = (data: {
  assignee: string;
  clientName: string;
  clientIndustry: string;
  clientPic: string;
  clientDpp: number;
  clientDpPaid: number;
  clientStatus: string;
  marketingName: string;
}) =>
  request<{ success: boolean; notifications: { wa: any; email: any } }>('/notify.php', {
    method: 'POST',
    body: JSON.stringify(data),
  });
