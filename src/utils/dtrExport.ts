import { GeneratedDTR } from '../types';

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

// ── CSV Export ───────────────────────────────────────────────────────────────

function escapeCSV(val: string): string {
  if (!val) return '';
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export function exportDTRToCSV(dtr: GeneratedDTR): void {
  const headers = [
    'Date', 'Day', 'Time In', 'Time Out', 'Hours Worked',
    'Classification', 'Late (hrs)', 'Late (mins)', 'Remarks',
  ];

  const rows = dtr.days.map(day => [
    day.date,
    day.dayOfWeek,
    day.timeIn || '',
    day.timeOut || '',
    day.totalHoursWorked.toFixed(2),
    day.attendanceClassification,
    String(day.lateHours),
    String(day.lateMinutes),
    day.attendanceRemarks || '',
  ]);

  // Summary row
  rows.push([]);
  rows.push(['SUMMARY']);
  rows.push(['Present Days', String(dtr.summary.presentDays)]);
  rows.push(['Absent Days', String(dtr.summary.absentDays)]);
  rows.push(['Holidays', String(dtr.summary.holidays)]);
  rows.push(['Rest Days', String(dtr.summary.restDays)]);
  rows.push(['Leave Days', String(dtr.summary.leaveDays)]);
  rows.push(['Official Business', String(dtr.summary.officialBusinessDays)]);
  rows.push(['WFH Days', String(dtr.summary.wfhDays)]);
  rows.push(['Total Hours Worked', dtr.summary.totalHoursWorked.toFixed(2)]);
  rows.push(['Total Late', `${dtr.summary.totalLateHours}h ${dtr.summary.totalLateMinutes}m`]);
  rows.push(['Total Approved OT', dtr.summary.totalApprovedOT.toFixed(2)]);
  rows.push(['Meal Eligible Days', String(dtr.summary.mealEligibleDays)]);

  const csvContent = [
    // Header info
    [`DAILY TIME RECORD`],
    [`Employee: ${dtr.employeeName}`],
    [`Department: ${dtr.department} | Designation: ${dtr.designation}`],
    [`Period: ${MONTHS[dtr.month - 1]} ${dtr.year} (${dtr.cutOff} Cut-Off)`],
    [`Coverage: ${dtr.coverageStart} – ${dtr.coverageEnd}`],
    [`Status: ${dtr.status}`],
    [],
    headers,
    ...rows,
  ].map(row => row.map(escapeCSV).join(',')).join('\n');

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `DTR_${dtr.employeeName.replace(/\s+/g, '_')}_${MONTHS[dtr.month - 1]}_${dtr.year}_${dtr.cutOff}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Print/PDF Export ─────────────────────────────────────────────────────────

function fmtTime(val: string): string {
  if (!val) return '';
  const m = val.match(/T(\d{2}):(\d{2})/);
  if (m) {
    const h = parseInt(m[1], 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${m[2]} ${ampm}`;
  }
  return val;
}

export function exportDTRToPrint(dtr: GeneratedDTR): void {
  const period = `${MONTHS[dtr.month - 1]} ${dtr.year} (${dtr.cutOff} Cut-Off)`;

  const dayRows = dtr.days.map(day => `
    <tr>
      <td>${day.date}</td>
      <td>${day.dayOfWeek.substring(0, 3)}</td>
      <td>${day.timeIn ? fmtTime(day.originalRecord?.timeIn || day.timeIn) : ''}</td>
      <td>${day.timeOut ? fmtTime(day.originalRecord?.timeOut || day.timeOut) : ''}</td>
      <td class="num">${day.totalHoursWorked ? day.totalHoursWorked.toFixed(2) : ''}</td>
      <td><span class="cls cls-${day.attendanceClassification.toLowerCase().replace(/\s+/g, '-')}">${day.attendanceClassification}</span></td>
      <td class="num">${day.lateHours || day.lateMinutes ? `${day.lateHours}:${String(day.lateMinutes).padStart(2, '0')}` : ''}</td>
      <td>${day.attendanceRemarks || ''}</td>
    </tr>
  `).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>DTR - ${dtr.employeeName} - ${period}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1a1a1a; padding: 20px; background: #fff; }
    .header { text-align: center; margin-bottom: 16px; border-bottom: 2px solid #1a1a1a; padding-bottom: 12px; }
    .header h1 { font-size: 16px; font-weight: 700; margin-bottom: 2px; letter-spacing: 1px; }
    .header p { font-size: 11px; color: #444; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; margin-bottom: 16px; font-size: 11px; }
    .info-grid .label { color: #666; }
    .info-grid .value { font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 10px; }
    th { background: #2d3748; color: #fff; padding: 6px 4px; text-align: left; font-weight: 600; font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; }
    td { padding: 5px 4px; border-bottom: 1px solid #e2e8f0; }
    tr:nth-child(even) { background: #f7fafc; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .cls { display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 9px; font-weight: 600; }
    .cls-present { background: #c6f6d5; color: #22543d; }
    .cls-late { background: #fefcbf; color: #744210; }
    .cls-absent { background: #fed7d7; color: #742a2a; }
    .cls-holiday { background: #e9d8fd; color: #44337a; }
    .cls-rest-day { background: #e2e8f0; color: #4a5568; }
    .cls-approved-leave { background: #b2f5ea; color: #234e52; }
    .cls-official-business { background: #bee3f8; color: #2a4365; }
    .cls-work-from-home { background: #c3dafe; color: #3c366b; }
    .cls-half-day { background: #feebc8; color: #7b341e; }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 16px; }
    .summary-item { background: #f7fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px; text-align: center; }
    .summary-item .num { font-size: 16px; font-weight: 700; color: #2d3748; }
    .summary-item .lbl { font-size: 9px; color: #718096; text-transform: uppercase; letter-spacing: 0.3px; }
    .footer { margin-top: 24px; display: grid; grid-template-columns: 1fr 1fr; gap: 48px; }
    .sig-line { border-top: 1px solid #1a1a1a; padding-top: 4px; text-align: center; font-size: 10px; color: #666; margin-top: 40px; }
    @media print {
      body { padding: 0; }
      @page { margin: 12mm; size: A4; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>DAILY TIME RECORD</h1>
    <p>${period}</p>
  </div>

  <div class="info-grid">
    <div><span class="label">Employee:</span> <span class="value">${dtr.employeeName}</span></div>
    <div><span class="label">Department:</span> <span class="value">${dtr.department}</span></div>
    <div><span class="label">Designation:</span> <span class="value">${dtr.designation}</span></div>
    <div><span class="label">Coverage:</span> <span class="value">${dtr.coverageStart} – ${dtr.coverageEnd}</span></div>
    <div><span class="label">Status:</span> <span class="value">${dtr.status}</span></div>
    <div><span class="label">Generated:</span> <span class="value">${new Date(dtr.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span></div>
  </div>

  <div class="summary">
    <div class="summary-item"><div class="num">${dtr.summary.presentDays}</div><div class="lbl">Present</div></div>
    <div class="summary-item"><div class="num">${dtr.summary.absentDays}</div><div class="lbl">Absent</div></div>
    <div class="summary-item"><div class="num">${dtr.summary.totalHoursWorked.toFixed(1)}</div><div class="lbl">Hours</div></div>
    <div class="summary-item"><div class="num">${dtr.summary.totalLateHours}:${String(dtr.summary.totalLateMinutes).padStart(2, '0')}</div><div class="lbl">Late</div></div>
    <div class="summary-item"><div class="num">${dtr.summary.restDays}</div><div class="lbl">Rest Days</div></div>
    <div class="summary-item"><div class="num">${dtr.summary.leaveDays}</div><div class="lbl">Leave</div></div>
    <div class="summary-item"><div class="num">${dtr.summary.holidays}</div><div class="lbl">Holidays</div></div>
    <div class="summary-item"><div class="num">${dtr.summary.mealEligibleDays}</div><div class="lbl">Meal Days</div></div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Day</th>
        <th>Time In</th>
        <th>Time Out</th>
        <th>Hours</th>
        <th>Classification</th>
        <th>Late</th>
        <th>Remarks</th>
      </tr>
    </thead>
    <tbody>
      ${dayRows}
    </tbody>
  </table>

  <div class="footer">
    <div>
      <div class="sig-line">Employee Signature / Date</div>
    </div>
    <div>
      <div class="sig-line">Approved By / Date</div>
    </div>
  </div>
</body>
</html>`;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = () => {
      setTimeout(() => printWindow.print(), 300);
    };
  }
}
