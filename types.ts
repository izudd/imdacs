
export enum UserRole {
  MARKETING = 'MARKETING',
  MANAGER = 'MANAGER',
  SUPERVISOR = 'SUPERVISOR'
}

export enum ClientStatus {
  NEW = 'NEW',
  FOLLOW_UP = 'FOLLOW_UP',
  VISIT = 'VISIT',
  PRESENTASI = 'PRESENTASI',
  PENAWARAN = 'PENAWARAN',
  NEGOSIASI = 'NEGOSIASI',
  DEAL = 'DEAL',
  LOST = 'LOST',
  MAINTENANCE = 'MAINTENANCE'
}

export enum ActivityType {
  CHAT_DM = 'CHAT_DM',
  CALL = 'CALL',
  VISIT = 'VISIT',
  MEETING = 'MEETING',
  POSTING = 'POSTING'
}

export enum ActivityStatus {
  DONE = 'DONE',
  PENDING = 'PENDING',
  CANCEL = 'CANCEL'
}

export enum ReportStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  REVISION = 'REVISION'
}

export interface User {
  id: string;
  name: string;
  role: UserRole;
  avatar?: string;
  supervisorId?: string;
}

export interface Client {
  id: string;
  name: string;
  industry: string;
  picName: string;
  phone: string;
  email: string;
  address: string;
  marketingId: string;
  status: ClientStatus;
  estimatedValue: number;
  yearWork?: number;
  yearBook?: number;
  serviceType: string;
  dpp: number;
  ppnType: 'INCLUDE' | 'EXCLUDE';
  dpPaid: number;
  lastUpdate: string;
  createdAt: string;
}

export interface Activity {
  id: string;
  date: string;
  marketingId: string;
  type: ActivityType;
  clientId?: string;
  description: string;
  startTime: string;
  endTime: string;
  location?: string;
  proofUrl?: string;
  status: ActivityStatus;
}

export interface ClientProgressUpdate {
  clientId: string;
  activity: string;
  prevStatus: ClientStatus;
  newStatus: ClientStatus;
  result: string;
}

export interface EODReport {
  id: string;
  date: string;
  marketingId: string;
  summary: string;
  progressUpdates: ClientProgressUpdate[];
  newLeads: number;
  followUps: number;
  dealsToday: number;
  dealValue?: number;
  constraints: string;
  supportNeeded: string;
  planTomorrow: string;
  status: ReportStatus;
  submittedAt?: string;
}
