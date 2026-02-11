
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { User, Client, Activity, EODReport, UserRole, ClientStatus, ActivityType } from '../types';

// =============================================
// Helper functions
// =============================================

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
};

const formatDate = (date: Date): string => {
  return date.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
};

const formatDateShort = (date: Date): string => {
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const statusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    'NEW': 'New',
    'FOLLOW_UP': 'Follow Up',
    'VISIT': 'Visit',
    'PRESENTASI': 'Presentasi',
    'PENAWARAN': 'Penawaran',
    'NEGOSIASI': 'Negosiasi',
    'DEAL': 'Deal',
    'LOST': 'Lost',
    'MAINTENANCE': 'Maintenance',
  };
  return labels[status] || status;
};

const activityLabel = (type: string): string => {
  const labels: Record<string, string> = {
    'CHAT_DM': 'Chat/DM',
    'CALL': 'Call',
    'VISIT': 'Visit',
    'MEETING': 'Meeting',
    'POSTING': 'Posting',
  };
  return labels[type] || type;
};

// =============================================
// Shared data calculations
// =============================================

interface ExportData {
  user: User;
  users: User[];
  clients: Client[];
  activities: Activity[];
  reports: EODReport[];
}

function getMarketingUsers(users: User[]) {
  return users.filter(u => u.role === UserRole.MARKETING);
}

function getPerMarketingStats(data: ExportData) {
  const marketingUsers = getMarketingUsers(data.users);
  const today = new Date().toISOString().split('T')[0];

  return marketingUsers.map(m => {
    const mc = data.clients.filter(c => c.marketingId === m.id);
    const mAct = data.activities.filter(a => a.marketingId === m.id && a.date === today);
    const mDeals = mc.filter(c => c.status === ClientStatus.DEAL).length;
    const convRate = mc.length > 0 ? Math.round((mDeals / mc.length) * 100) : 0;
    const mPipelineVal = mc.filter(c => c.status !== ClientStatus.DEAL && c.status !== ClientStatus.LOST).reduce((s, c) => s + (c.estimatedValue || 0), 0);
    const mDealVal = mc.filter(c => c.status === ClientStatus.DEAL).reduce((s, c) => s + (c.estimatedValue || 0), 0);
    const weekActs = data.activities.filter(a => {
      if (a.marketingId !== m.id) return false;
      const diff = (new Date(today).getTime() - new Date(a.date).getTime()) / (1000 * 60 * 60 * 24);
      return diff >= 0 && diff < 7;
    }).length;
    const mReports = data.reports.filter(r => r.marketingId === m.id);
    const todayReport = mReports.find(r => r.date === today);

    return {
      user: m,
      totalClients: mc.length,
      todayActivities: mAct.length,
      weekActivities: weekActs,
      deals: mDeals,
      convRate,
      pipelineValue: mPipelineVal,
      dealValue: mDealVal,
      eodStatus: todayReport ? todayReport.status : 'MISSING',
      statusBreakdown: Object.values(ClientStatus).reduce((acc, st) => {
        acc[st] = mc.filter(c => c.status === st).length;
        return acc;
      }, {} as Record<string, number>),
    };
  });
}

function getPipelineSummary(clients: Client[]) {
  const pipelineValue = clients
    .filter(c => c.status !== ClientStatus.DEAL && c.status !== ClientStatus.LOST)
    .reduce((sum, c) => sum + (c.estimatedValue || 0), 0);
  const dealValue = clients
    .filter(c => c.status === ClientStatus.DEAL)
    .reduce((sum, c) => sum + (c.estimatedValue || 0), 0);
  return { pipelineValue, dealValue, totalValue: pipelineValue + dealValue };
}

function getStagnantClients(clients: Client[], users: User[]) {
  const marketingUsers = getMarketingUsers(users);
  return clients
    .filter(c => c.status !== ClientStatus.DEAL && c.status !== ClientStatus.LOST)
    .map(c => {
      const daysStagnant = c.lastUpdate
        ? Math.floor((new Date().getTime() - new Date(c.lastUpdate).getTime()) / (1000 * 60 * 60 * 24))
        : 999;
      const pic = marketingUsers.find(m => m.id === c.marketingId);
      return { ...c, daysStagnant, picName: pic?.name || 'N/A' };
    })
    .filter(c => c.daysStagnant > 7)
    .sort((a, b) => b.daysStagnant - a.daysStagnant);
}

// =============================================
// EXCEL EXPORT
// =============================================

export function exportExcel(data: ExportData) {
  const wb = XLSX.utils.book_new();
  const today = new Date();
  const marketingUsers = getMarketingUsers(data.users);
  const perMarketing = getPerMarketingStats(data);
  const pipeline = getPipelineSummary(data.clients);
  const stagnant = getStagnantClients(data.clients, data.users);
  const todayStr = today.toISOString().split('T')[0];

  // ===== Sheet 1: Executive Summary =====
  const summaryData = [
    ['IMDACS - Manager Report'],
    ['Internal Marketing Daily Activity & Client Progress System'],
    [''],
    ['Tanggal Report:', formatDate(today)],
    ['Generated by:', data.user.name],
    [''],
    ['═══════════════════════════════════════'],
    ['EXECUTIVE SUMMARY'],
    ['═══════════════════════════════════════'],
    [''],
    ['Total Clients:', data.clients.length],
    ['Total Deals:', data.clients.filter(c => c.status === ClientStatus.DEAL).length],
    ['Aktivitas Hari Ini:', data.activities.filter(a => a.date === todayStr).length],
    ['Tim Marketing:', marketingUsers.length],
    [''],
    ['Pipeline Value:', formatCurrency(pipeline.pipelineValue)],
    ['Deal Value:', formatCurrency(pipeline.dealValue)],
    ['Total Value:', formatCurrency(pipeline.totalValue)],
    [''],
    ['═══════════════════════════════════════'],
    ['PIPELINE BREAKDOWN'],
    ['═══════════════════════════════════════'],
    [''],
    ['Status', 'Jumlah Client', 'Estimasi Nilai'],
    ...Object.values(ClientStatus).map(st => {
      const cs = data.clients.filter(c => c.status === st);
      return [statusLabel(st), cs.length, formatCurrency(cs.reduce((s, c) => s + (c.estimatedValue || 0), 0))];
    }),
    [''],
    ['TOTAL', data.clients.length, formatCurrency(pipeline.totalValue)],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  wsSummary['!cols'] = [{ wch: 30 }, { wch: 20 }, { wch: 25 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Executive Summary');

  // ===== Sheet 2: Marketing Performance =====
  const perfHeaders = ['No', 'Nama Marketing', 'Total Client', 'Aktivitas Hari Ini', 'Aktivitas Minggu Ini', 'Total Deal', 'Conversion Rate', 'Pipeline Value', 'Deal Value', 'EOD Status'];
  const perfData = perMarketing.map((m, i) => [
    i + 1,
    m.user.name,
    m.totalClients,
    m.todayActivities,
    m.weekActivities,
    m.deals,
    `${m.convRate}%`,
    formatCurrency(m.pipelineValue),
    formatCurrency(m.dealValue),
    m.eodStatus === 'MISSING' ? 'Belum Submit' : m.eodStatus,
  ]);

  const perfSheetData = [
    ['MARKETING TEAM PERFORMANCE'],
    [`Tanggal: ${formatDate(today)}`],
    [''],
    perfHeaders,
    ...perfData,
    [''],
    ['TOTAL', '',
      perMarketing.reduce((s, m) => s + m.totalClients, 0),
      perMarketing.reduce((s, m) => s + m.todayActivities, 0),
      perMarketing.reduce((s, m) => s + m.weekActivities, 0),
      perMarketing.reduce((s, m) => s + m.deals, 0),
      '',
      formatCurrency(perMarketing.reduce((s, m) => s + m.pipelineValue, 0)),
      formatCurrency(perMarketing.reduce((s, m) => s + m.dealValue, 0)),
      ''
    ],
  ];
  const wsPerf = XLSX.utils.aoa_to_sheet(perfSheetData);
  wsPerf['!cols'] = [
    { wch: 5 }, { wch: 30 }, { wch: 14 }, { wch: 18 }, { wch: 20 },
    { wch: 12 }, { wch: 16 }, { wch: 22 }, { wch: 22 }, { wch: 14 }
  ];
  XLSX.utils.book_append_sheet(wb, wsPerf, 'Marketing Performance');

  // ===== Sheet 3: Pipeline Per Marketing =====
  const pipeHeaders = ['No', 'Nama Marketing', ...Object.values(ClientStatus).map(statusLabel), 'TOTAL'];
  const pipeData = perMarketing.map((m, i) => [
    i + 1,
    m.user.name,
    ...Object.values(ClientStatus).map(st => m.statusBreakdown[st] || 0),
    m.totalClients,
  ]);
  const pipeSheetData = [
    ['PIPELINE BREAKDOWN PER MARKETING'],
    [`Tanggal: ${formatDate(today)}`],
    [''],
    pipeHeaders,
    ...pipeData,
    [''],
    ['TOTAL', '',
      ...Object.values(ClientStatus).map(st => data.clients.filter(c => c.status === st).length),
      data.clients.length
    ],
  ];
  const wsPipe = XLSX.utils.aoa_to_sheet(pipeSheetData);
  wsPipe['!cols'] = [{ wch: 5 }, { wch: 25 }, ...Object.values(ClientStatus).map(() => ({ wch: 14 })), { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, wsPipe, 'Pipeline Breakdown');

  // ===== Sheet 4: All Clients =====
  const clientHeaders = ['No', 'Nama Client', 'Industri', 'PIC Client', 'Phone', 'Email', 'Marketing', 'Status', 'Estimasi Nilai', 'Last Update', 'Created'];
  const clientData = data.clients.map((c, i) => [
    i + 1,
    c.name,
    c.industry,
    c.picName,
    c.phone,
    c.email,
    marketingUsers.find(m => m.id === c.marketingId)?.name || c.marketingId,
    statusLabel(c.status),
    formatCurrency(c.estimatedValue || 0),
    c.lastUpdate || '-',
    c.createdAt ? c.createdAt.split('T')[0] : '-',
  ]);
  const clientSheetData = [
    ['DAFTAR SELURUH CLIENT'],
    [`Tanggal: ${formatDate(today)} | Total: ${data.clients.length} clients`],
    [''],
    clientHeaders,
    ...clientData,
  ];
  const wsClient = XLSX.utils.aoa_to_sheet(clientSheetData);
  wsClient['!cols'] = [
    { wch: 5 }, { wch: 30 }, { wch: 20 }, { wch: 20 }, { wch: 16 },
    { wch: 25 }, { wch: 22 }, { wch: 14 }, { wch: 22 }, { wch: 14 }, { wch: 14 }
  ];
  XLSX.utils.book_append_sheet(wb, wsClient, 'All Clients');

  // ===== Sheet 5: Activities Today =====
  const todayActs = data.activities.filter(a => a.date === todayStr);
  const actHeaders = ['No', 'Marketing', 'Tipe', 'Client', 'Deskripsi', 'Waktu Mulai', 'Waktu Selesai', 'Lokasi', 'Status'];
  const actData = todayActs.map((a, i) => [
    i + 1,
    marketingUsers.find(m => m.id === a.marketingId)?.name || a.marketingId,
    activityLabel(a.type),
    a.clientId ? (data.clients.find(c => c.id === a.clientId)?.name || a.clientId) : '-',
    a.description,
    a.startTime,
    a.endTime,
    a.location || '-',
    a.status,
  ]);
  const actSheetData = [
    ['AKTIVITAS HARI INI'],
    [`Tanggal: ${formatDate(today)} | Total: ${todayActs.length} aktivitas`],
    [''],
    actHeaders,
    ...actData.length > 0 ? actData : [['', '', '', '', 'Belum ada aktivitas hari ini', '', '', '', '']],
  ];
  const wsAct = XLSX.utils.aoa_to_sheet(actSheetData);
  wsAct['!cols'] = [
    { wch: 5 }, { wch: 22 }, { wch: 12 }, { wch: 25 }, { wch: 40 },
    { wch: 14 }, { wch: 14 }, { wch: 25 }, { wch: 10 }
  ];
  XLSX.utils.book_append_sheet(wb, wsAct, 'Activities Today');

  // ===== Sheet 6: Stagnant Clients =====
  const stagnHeaders = ['No', 'Nama Client', 'Industri', 'Marketing', 'Status', 'Days Stagnant', 'Last Update', 'Estimasi Nilai'];
  const stagnData = stagnant.map((c, i) => [
    i + 1,
    c.name,
    c.industry,
    c.picName,
    statusLabel(c.status),
    c.daysStagnant,
    c.lastUpdate || '-',
    formatCurrency(c.estimatedValue || 0),
  ]);
  const stagnSheetData = [
    ['STAGNANT CLIENTS (> 7 HARI)'],
    [`Tanggal: ${formatDate(today)} | Perlu Perhatian: ${stagnant.length} clients`],
    [''],
    stagnHeaders,
    ...stagnData.length > 0 ? stagnData : [['', '', '', '', 'Semua client aktif!', '', '', '']],
  ];
  const wsStag = XLSX.utils.aoa_to_sheet(stagnSheetData);
  wsStag['!cols'] = [
    { wch: 5 }, { wch: 30 }, { wch: 20 }, { wch: 22 }, { wch: 14 },
    { wch: 15 }, { wch: 14 }, { wch: 22 }
  ];
  XLSX.utils.book_append_sheet(wb, wsStag, 'Stagnant Clients');

  // ===== Sheet 7: EOD Reports =====
  const eodHeaders = ['No', 'Marketing', 'Tanggal', 'Status', 'Ringkasan', 'New Leads', 'Follow Ups', 'Deals', 'Kendala', 'Rencana Besok'];
  const eodData = data.reports.slice(0, 50).map((r, i) => [
    i + 1,
    marketingUsers.find(m => m.id === r.marketingId)?.name || r.marketingId,
    r.date,
    r.status,
    r.summary || '-',
    r.newLeads,
    r.followUps,
    r.dealsToday,
    r.constraints || '-',
    r.planTomorrow || '-',
  ]);
  const eodSheetData = [
    ['EOD REPORTS'],
    [`Tanggal: ${formatDate(today)} | Total: ${data.reports.length} reports`],
    [''],
    eodHeaders,
    ...eodData.length > 0 ? eodData : [['', '', '', '', 'Belum ada laporan', '', '', '', '', '']],
  ];
  const wsEod = XLSX.utils.aoa_to_sheet(eodSheetData);
  wsEod['!cols'] = [
    { wch: 5 }, { wch: 22 }, { wch: 14 }, { wch: 12 }, { wch: 40 },
    { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 35 }, { wch: 35 }
  ];
  XLSX.utils.book_append_sheet(wb, wsEod, 'EOD Reports');

  // Generate and download
  const filename = `IMDACS_Manager_Report_${todayStr}.xlsx`;
  XLSX.writeFile(wb, filename);
}

// =============================================
// PDF EXPORT
// =============================================

export function exportPDF(data: ExportData) {
  const doc = new jsPDF('p', 'mm', 'a4');
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const marketingUsers = getMarketingUsers(data.users);
  const perMarketing = getPerMarketingStats(data);
  const pipeline = getPipelineSummary(data.clients);
  const stagnant = getStagnantClients(data.clients, data.users);
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;

  // Colors
  const primaryColor: [number, number, number] = [99, 102, 241]; // indigo-500
  const darkColor: [number, number, number] = [30, 41, 59]; // slate-800
  const grayColor: [number, number, number] = [100, 116, 139]; // slate-500
  const greenColor: [number, number, number] = [34, 197, 94]; // green-500
  const amberColor: [number, number, number] = [245, 158, 11]; // amber-500

  let currentY = 0;

  // === Header / Cover ===
  const drawHeader = () => {
    // Top color bar
    doc.setFillColor(...primaryColor);
    doc.rect(0, 0, pageWidth, 50, 'F');

    // Title
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('IMDACS', margin, 22);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Internal Marketing Daily Activity & Client Progress System', margin, 30);

    // Date on right
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(formatDateShort(today), pageWidth - margin, 22, { align: 'right' });
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Manager Report', pageWidth - margin, 30, { align: 'right' });

    // Subtitle bar
    doc.setFillColor(241, 245, 249); // slate-100
    doc.rect(0, 50, pageWidth, 12, 'F');
    doc.setTextColor(...grayColor);
    doc.setFontSize(8);
    doc.text(`Generated by: ${data.user.name}  |  ${formatDate(today)}`, margin, 58);

    currentY = 72;
  };

  const drawSectionTitle = (title: string, icon?: string) => {
    if (currentY > 260) {
      doc.addPage();
      currentY = 20;
    }
    doc.setFillColor(...primaryColor);
    doc.roundedRect(margin, currentY, contentWidth, 9, 1.5, 1.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`  ${icon || '■'}  ${title}`, margin + 2, currentY + 6.5);
    currentY += 14;
  };

  const drawKeyValue = (label: string, value: string, x: number, y: number, labelW: number = 40) => {
    doc.setTextColor(...grayColor);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(label, x, y);
    doc.setTextColor(...darkColor);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(value, x + labelW, y);
  };

  // === Page 1: Executive Summary ===
  drawHeader();

  drawSectionTitle('EXECUTIVE SUMMARY', '◆');

  // KPI Cards row
  const cardW = (contentWidth - 6) / 4;
  const cards = [
    { label: 'Total Clients', value: data.clients.length.toString(), color: primaryColor },
    { label: 'Aktivitas Hari Ini', value: data.activities.filter(a => a.date === todayStr).length.toString(), color: amberColor },
    { label: 'Total Deals', value: data.clients.filter(c => c.status === ClientStatus.DEAL).length.toString(), color: greenColor },
    { label: 'Tim Marketing', value: marketingUsers.length.toString(), color: darkColor },
  ];

  cards.forEach((card, i) => {
    const x = margin + i * (cardW + 2);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x, currentY, cardW, 22, 2, 2, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, currentY, cardW, 22, 2, 2, 'S');

    // Color accent top
    doc.setFillColor(...card.color);
    doc.rect(x, currentY, cardW, 2.5, 'F');
    // fix round corners
    doc.setFillColor(248, 250, 252);
    doc.rect(x, currentY + 2, cardW, 1, 'F');
    doc.setFillColor(...card.color);
    doc.roundedRect(x, currentY, cardW, 2.5, 2, 2, 'F');

    doc.setTextColor(...card.color);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(card.value, x + cardW / 2, currentY + 13, { align: 'center' });
    doc.setTextColor(...grayColor);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(card.label, x + cardW / 2, currentY + 19, { align: 'center' });
  });
  currentY += 28;

  // Revenue Summary
  doc.setFillColor(240, 253, 244); // green-50
  doc.roundedRect(margin, currentY, contentWidth, 20, 2, 2, 'F');
  doc.setDrawColor(187, 247, 208); // green-200
  doc.roundedRect(margin, currentY, contentWidth, 20, 2, 2, 'S');

  const revColW = contentWidth / 3;
  const revItems = [
    { label: 'Pipeline Value', value: formatCurrency(pipeline.pipelineValue), color: greenColor },
    { label: 'Deal Value', value: formatCurrency(pipeline.dealValue), color: amberColor },
    { label: 'Total Value', value: formatCurrency(pipeline.totalValue), color: primaryColor },
  ];
  revItems.forEach((item, i) => {
    const x = margin + i * revColW;
    doc.setTextColor(...item.color);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(item.value, x + revColW / 2, currentY + 10, { align: 'center' });
    doc.setTextColor(...grayColor);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(item.label, x + revColW / 2, currentY + 16, { align: 'center' });
  });
  currentY += 26;

  // Pipeline Breakdown Table
  drawSectionTitle('PIPELINE BREAKDOWN', '◆');

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    head: [['Status', 'Jumlah Client', 'Estimasi Nilai', '% dari Total']],
    body: Object.values(ClientStatus).map(st => {
      const cs = data.clients.filter(c => c.status === st);
      const pct = data.clients.length > 0 ? Math.round((cs.length / data.clients.length) * 100) : 0;
      return [statusLabel(st), cs.length.toString(), formatCurrency(cs.reduce((s, c) => s + (c.estimatedValue || 0), 0)), `${pct}%`];
    }),
    foot: [['TOTAL', data.clients.length.toString(), formatCurrency(pipeline.totalValue), '100%']],
    theme: 'grid',
    headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8, halign: 'center' },
    bodyStyles: { fontSize: 8, textColor: darkColor, halign: 'center' },
    footStyles: { fillColor: [241, 245, 249], textColor: darkColor, fontStyle: 'bold', fontSize: 8, halign: 'center' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { halign: 'left', cellWidth: 35 },
      1: { cellWidth: 30 },
      2: { halign: 'right', cellWidth: 45 },
      3: { cellWidth: 30 },
    },
  });
  currentY = (doc as any).lastAutoTable.finalY + 8;

  // === Page 2: Marketing Performance ===
  doc.addPage();
  currentY = 20;
  drawSectionTitle('MARKETING TEAM PERFORMANCE', '◆');

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    head: [['No', 'Nama Marketing', 'Client', 'Akt. Hari Ini', 'Akt. Minggu', 'Deal', 'Conv.', 'Pipeline Value', 'Deal Value', 'EOD']],
    body: perMarketing.map((m, i) => [
      (i + 1).toString(),
      m.user.name,
      m.totalClients.toString(),
      m.todayActivities.toString(),
      m.weekActivities.toString(),
      m.deals.toString(),
      `${m.convRate}%`,
      formatCurrency(m.pipelineValue),
      formatCurrency(m.dealValue),
      m.eodStatus === 'MISSING' ? 'Belum' : m.eodStatus,
    ]),
    theme: 'grid',
    headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7, halign: 'center' },
    bodyStyles: { fontSize: 7, textColor: darkColor, halign: 'center' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 8 },
      1: { halign: 'left', cellWidth: 28 },
      7: { halign: 'right', cellWidth: 25 },
      8: { halign: 'right', cellWidth: 25 },
    },
  });
  currentY = (doc as any).lastAutoTable.finalY + 8;

  // Pipeline per marketing
  if (currentY > 200) {
    doc.addPage();
    currentY = 20;
  }
  drawSectionTitle('PIPELINE BREAKDOWN PER MARKETING', '◆');

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    head: [['Marketing', ...Object.values(ClientStatus).map(statusLabel), 'Total']],
    body: perMarketing.map(m => [
      m.user.name,
      ...Object.values(ClientStatus).map(st => (m.statusBreakdown[st] || 0).toString()),
      m.totalClients.toString(),
    ]),
    foot: [['TOTAL',
      ...Object.values(ClientStatus).map(st => data.clients.filter(c => c.status === st).length.toString()),
      data.clients.length.toString()
    ]],
    theme: 'grid',
    headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 6.5, halign: 'center' },
    bodyStyles: { fontSize: 7, textColor: darkColor, halign: 'center' },
    footStyles: { fillColor: [241, 245, 249], textColor: darkColor, fontStyle: 'bold', fontSize: 7, halign: 'center' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 0: { halign: 'left', cellWidth: 25 } },
  });
  currentY = (doc as any).lastAutoTable.finalY + 8;

  // === Page 3: All Clients ===
  doc.addPage();
  currentY = 20;
  drawSectionTitle(`DAFTAR SELURUH CLIENT (${data.clients.length})`, '◆');

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    head: [['No', 'Nama Client', 'Industri', 'Marketing', 'Status', 'Estimasi Nilai', 'Last Update']],
    body: data.clients.map((c, i) => [
      (i + 1).toString(),
      c.name,
      c.industry || '-',
      marketingUsers.find(m => m.id === c.marketingId)?.name || c.marketingId,
      statusLabel(c.status),
      formatCurrency(c.estimatedValue || 0),
      c.lastUpdate || '-',
    ]),
    theme: 'grid',
    headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7, halign: 'center' },
    bodyStyles: { fontSize: 7, textColor: darkColor },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 35 },
      2: { cellWidth: 25 },
      3: { cellWidth: 25 },
      4: { cellWidth: 20, halign: 'center' },
      5: { cellWidth: 28, halign: 'right' },
      6: { cellWidth: 20, halign: 'center' },
    },
    didParseCell: (hookData) => {
      // Color code status cells
      if (hookData.section === 'body' && hookData.column.index === 4) {
        const status = data.clients[hookData.row.index]?.status;
        if (status === 'DEAL') {
          hookData.cell.styles.textColor = [34, 197, 94];
          hookData.cell.styles.fontStyle = 'bold';
        } else if (status === 'LOST') {
          hookData.cell.styles.textColor = [239, 68, 68];
          hookData.cell.styles.fontStyle = 'bold';
        }
      }
    },
  });
  currentY = (doc as any).lastAutoTable.finalY + 8;

  // === Stagnant Clients ===
  if (stagnant.length > 0) {
    if (currentY > 220) {
      doc.addPage();
      currentY = 20;
    }
    drawSectionTitle(`STAGNANT CLIENTS - PERLU PERHATIAN (${stagnant.length})`, '⚠');

    autoTable(doc, {
      startY: currentY,
      margin: { left: margin, right: margin },
      head: [['No', 'Nama Client', 'Industri', 'Marketing', 'Status', 'Hari Stagnant', 'Estimasi Nilai']],
      body: stagnant.map((c, i) => [
        (i + 1).toString(),
        c.name,
        c.industry || '-',
        c.picName,
        statusLabel(c.status),
        `${c.daysStagnant} hari`,
        formatCurrency(c.estimatedValue || 0),
      ]),
      theme: 'grid',
      headStyles: { fillColor: [239, 68, 68], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7, halign: 'center' },
      bodyStyles: { fontSize: 7, textColor: darkColor },
      alternateRowStyles: { fillColor: [254, 242, 242] },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' },
        5: { halign: 'center', fontStyle: 'bold' },
        6: { halign: 'right' },
      },
    });
    currentY = (doc as any).lastAutoTable.finalY + 8;
  }

  // === Activities Today ===
  const todayActs = data.activities.filter(a => a.date === todayStr);
  if (todayActs.length > 0) {
    if (currentY > 220) {
      doc.addPage();
      currentY = 20;
    }
    drawSectionTitle(`AKTIVITAS HARI INI (${todayActs.length})`, '◆');

    autoTable(doc, {
      startY: currentY,
      margin: { left: margin, right: margin },
      head: [['No', 'Marketing', 'Tipe', 'Client', 'Deskripsi', 'Waktu', 'Status']],
      body: todayActs.map((a, i) => [
        (i + 1).toString(),
        marketingUsers.find(m => m.id === a.marketingId)?.name || a.marketingId,
        activityLabel(a.type),
        a.clientId ? (data.clients.find(c => c.id === a.clientId)?.name || '-') : '-',
        a.description?.substring(0, 50) + (a.description?.length > 50 ? '...' : ''),
        `${a.startTime} - ${a.endTime}`,
        a.status,
      ]),
      theme: 'grid',
      headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7, halign: 'center' },
      bodyStyles: { fontSize: 7, textColor: darkColor },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' },
        1: { cellWidth: 22 },
        4: { cellWidth: 45 },
      },
    });
    currentY = (doc as any).lastAutoTable.finalY + 8;
  }

  // === EOD Reports ===
  if (data.reports.length > 0) {
    doc.addPage();
    currentY = 20;
    drawSectionTitle(`EOD REPORTS (${data.reports.length})`, '◆');

    autoTable(doc, {
      startY: currentY,
      margin: { left: margin, right: margin },
      head: [['No', 'Marketing', 'Tanggal', 'Status', 'Ringkasan', 'Leads', 'Follow', 'Deal']],
      body: data.reports.slice(0, 30).map((r, i) => [
        (i + 1).toString(),
        marketingUsers.find(m => m.id === r.marketingId)?.name || r.marketingId,
        r.date,
        r.status,
        r.summary?.substring(0, 40) + (r.summary?.length > 40 ? '...' : '') || '-',
        r.newLeads.toString(),
        r.followUps.toString(),
        r.dealsToday.toString(),
      ]),
      theme: 'grid',
      headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7, halign: 'center' },
      bodyStyles: { fontSize: 7, textColor: darkColor },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' },
        1: { cellWidth: 22 },
        4: { cellWidth: 50 },
      },
      didParseCell: (hookData) => {
        if (hookData.section === 'body' && hookData.column.index === 3) {
          const status = hookData.cell.raw;
          if (status === 'APPROVED') {
            hookData.cell.styles.textColor = [34, 197, 94];
            hookData.cell.styles.fontStyle = 'bold';
          } else if (status === 'REVISION') {
            hookData.cell.styles.textColor = [239, 68, 68];
            hookData.cell.styles.fontStyle = 'bold';
          } else if (status === 'SUBMITTED') {
            hookData.cell.styles.textColor = [59, 130, 246];
          }
        }
      },
    });
  }

  // === Footer on all pages ===
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const pgHeight = doc.internal.pageSize.getHeight();
    // Footer line
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, pgHeight - 12, pageWidth - margin, pgHeight - 12);
    // Footer text
    doc.setTextColor(...grayColor);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text('IMDACS - Internal Marketing Daily Activity & Client Progress System', margin, pgHeight - 7);
    doc.text(`Halaman ${i} dari ${totalPages}`, pageWidth - margin, pgHeight - 7, { align: 'right' });
  }

  // Save
  const filename = `IMDACS_Manager_Report_${todayStr}.pdf`;
  doc.save(filename);
}
