
import React from 'react';
import { ClientStatus, ActivityType, ReportStatus } from './types';

export const STATUS_COLORS: Record<ClientStatus, string> = {
  [ClientStatus.NEW]: 'bg-blue-100 text-blue-700 border-blue-200',
  [ClientStatus.FOLLOW_UP]: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  [ClientStatus.VISIT]: 'bg-purple-100 text-purple-700 border-purple-200',
  [ClientStatus.PRESENTASI]: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  [ClientStatus.PENAWARAN]: 'bg-orange-100 text-orange-700 border-orange-200',
  [ClientStatus.NEGOSIASI]: 'bg-pink-100 text-pink-700 border-pink-200',
  [ClientStatus.DEAL]: 'bg-green-100 text-green-700 border-green-200',
  [ClientStatus.LOST]: 'bg-red-100 text-red-700 border-red-200',
  [ClientStatus.MAINTENANCE]: 'bg-slate-100 text-slate-700 border-slate-200',
};

export const ACTIVITY_ICONS: Record<ActivityType, React.ReactNode> = {
  [ActivityType.CHAT_DM]: <i className="fa-brands fa-whatsapp"></i>,
  [ActivityType.CALL]: <i className="fa-solid fa-phone"></i>,
  [ActivityType.VISIT]: <i className="fa-solid fa-location-dot"></i>,
  [ActivityType.MEETING]: <i className="fa-solid fa-users"></i>,
  [ActivityType.POSTING]: <i className="fa-solid fa-share-nodes"></i>,
};

export const REPORT_STATUS_BADGE: Record<ReportStatus, string> = {
  [ReportStatus.DRAFT]: 'bg-slate-100 text-slate-600',
  [ReportStatus.SUBMITTED]: 'bg-blue-100 text-blue-600',
  [ReportStatus.APPROVED]: 'bg-green-100 text-green-600',
  [ReportStatus.REVISION]: 'bg-red-100 text-red-600',
};

export const AUDITOR_TEAM_MEMBERS = ['Weni', 'Latifah', 'Nando'] as const;

export const AUDIT_CHECKLIST_ITEMS: Record<string, string> = {
  DOKUMEN_LENGKAP: 'Kelengkapan Dokumen',
  VERIFIKASI_DP: 'Verifikasi DP / Pembayaran',
  INPUT_PEMBUKUAN: 'Input ke Pembukuan',
  SURAT_PENUGASAN: 'Surat Penugasan Diterbitkan',
  PROSES_PENGERJAAN: 'Proses Pengerjaan Dimulai',
  REVIEW_HASIL: 'Review Hasil Pekerjaan',
  SELESAI: 'Selesai / Delivered',
};
