import { useState } from 'react';
import { ArrowLeft, Loader2, CheckCircle2, AlertCircle, Home, FileText } from 'lucide-react';
import { User } from '../types';
import { submitWFH } from '../utils/sheets';

interface Props {
  user: User;
  attendanceId: string;
  attendanceDate: string;
  timeIn: string;
  onSuccess: () => void;
  onCancel: () => void;
}

// Defined outside component so its identity is stable — prevents textarea unmount on each keystroke
function WFHField({
  label, value, onChange, placeholder, required, rows = 3,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder: string; required?: boolean; rows?: number;
}) {
  return (
    <div>
      <label className="text-white/50 text-[11px] uppercase tracking-wider block mb-1.5">
        {label}{required && <span className="text-rose-400 ml-0.5">*</span>}
      </label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-blue-400/50 resize-none"
      />
    </div>
  );
}

export default function WFHRegistration({ user, attendanceId, attendanceDate, timeIn, onSuccess, onCancel }: Props) {
  const [form, setForm] = useState({
    workDescription: '',
    plannedTasks: '',
    expectedDeliverables: '',
    additionalNotes: '',
    remarks: '',
  });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const emp = user.employee;

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const setField = (field: keyof typeof form) => (value: string) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = async () => {
    if (!form.workDescription.trim()) { showToast('error', 'Work Description is required.'); return; }
    if (!form.plannedTasks.trim())    { showToast('error', 'Planned Tasks is required.'); return; }
    if (!form.expectedDeliverables.trim()) { showToast('error', 'Expected Deliverables is required.'); return; }
    setSaving(true);
    const res = await submitWFH({
      email:                user.email,
      name:                 user.name,
      department:           emp?.department || '',
      designation:          emp?.designation || '',
      attendanceId,
      attendanceDate,
      timeIn,
      workDescription:      form.workDescription.trim(),
      plannedTasks:         form.plannedTasks.trim(),
      expectedDeliverables: form.expectedDeliverables.trim(),
      additionalNotes:      form.additionalNotes.trim() || undefined,
      remarks:              form.remarks.trim() || undefined,
    });
    setSaving(false);
    if (res.success) {
      showToast('success', 'Work From Home registered! Your approver has been notified.');
      setTimeout(onSuccess, 1500);
    } else {
      showToast('error', res.message || 'Submission failed. Please try again.');
    }
  };

  return (
    // Use fixed viewport height with internal scroll so soft keyboard doesn't collapse the layout
    <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col overflow-hidden">
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-xl flex items-center gap-2 text-sm font-medium w-[90vw] max-w-sm
          ${toast.type === 'success' ? 'bg-emerald-500/90 text-white' : 'bg-red-500/90 text-white'}`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          {toast.msg}
        </div>
      )}

      {/* Header – fixed, never scrolls away */}
      <div className="px-4 pt-10 pb-4 bg-slate-900/80 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onCancel} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/8 active:scale-90 transition-transform">
            <ArrowLeft className="w-4 h-4 text-white/70" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Home className="w-4 h-4 text-sky-400" />
              <h1 className="text-white font-bold text-base">Work From Home</h1>
            </div>
            <p className="text-blue-200/50 text-[11px] mt-0.5">Register WFH for today's attendance</p>
          </div>
        </div>
      </div>

      {/* Scrollable body – keyboard pushes up, content scrolls, header stays */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 pt-4 pb-8 space-y-4">

          {/* Info bar */}
          <div className="bg-sky-500/10 border border-sky-400/20 rounded-xl px-4 py-3 flex items-start gap-3">
            <FileText className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            <div className="text-[11px] text-sky-300/80 space-y-0.5">
              <p><span className="text-white/50">Date:</span> {attendanceDate}</p>
              <p><span className="text-white/50">Time In:</span> {timeIn}</p>
              <p className="text-sky-300/50 mt-1">You must submit an End-of-Day Report before clocking out.</p>
            </div>
          </div>

          <WFHField
            label="Work Description"
            value={form.workDescription}
            onChange={setField('workDescription')}
            placeholder="Describe the work you'll be doing today…"
            required
            rows={3}
          />
          <WFHField
            label="Planned Tasks"
            value={form.plannedTasks}
            onChange={setField('plannedTasks')}
            placeholder="List the tasks you plan to accomplish…"
            required
            rows={4}
          />
          <WFHField
            label="Expected Deliverables"
            value={form.expectedDeliverables}
            onChange={setField('expectedDeliverables')}
            placeholder="What outputs or deliverables are expected…"
            required
            rows={3}
          />
          <WFHField
            label="Additional Notes"
            value={form.additionalNotes}
            onChange={setField('additionalNotes')}
            placeholder="Any additional context or notes (optional)…"
            rows={2}
          />
          <WFHField
            label="Remarks"
            value={form.remarks}
            onChange={setField('remarks')}
            placeholder="Remarks (optional)…"
            rows={2}
          />

          <button
            onClick={handleSubmit}
            disabled={saving}
            className="w-full bg-gradient-to-r from-sky-600 to-blue-600 text-white font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 active:scale-[0.97] transition-transform disabled:opacity-60 shadow-lg"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Home className="w-5 h-5" />}
            {saving ? 'Registering…' : 'Register Work From Home'}
          </button>

        </div>
      </div>
    </div>
  );
}
