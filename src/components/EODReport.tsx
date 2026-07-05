import { useState, useRef } from 'react';
import { ArrowLeft, Loader2, CheckCircle2, AlertCircle, Paperclip, X, FileText, Upload } from 'lucide-react';
import { WFHRecord, WFHAttachment } from '../types';
import { submitWFHEOD } from '../utils/sheets';

interface Props {
  user: { email: string; name: string };
  wfhRecord: WFHRecord;
  onSuccess: (attachments: WFHAttachment[]) => void;
  onCancel: () => void;
}

interface PendingFile {
  fileName: string;
  fileData: string;
  mimeType: string;
  size: number;
}

const ACCEPTED = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp,.txt,.csv';

export default function EODReport({ user, wfhRecord, onSuccess, onCancel }: Props) {
  const [form, setForm] = useState({
    eodSummary: '',
    eodAccomplishments: '',
    eodIssues: '',
    eodDeliverables: '',
    eodNextDayPlan: '',
    eodRemarks: '',
  });
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const setField = (field: keyof typeof form, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    const MAX = 10 * 1024 * 1024;
    picked.forEach(file => {
      if (file.size > MAX) { showToast('error', `${file.name} exceeds 10 MB limit.`); return; }
      const reader = new FileReader();
      reader.onload = () => {
        setFiles(prev => [...prev, { fileName: file.name, fileData: reader.result as string, mimeType: file.type, size: file.size }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const removeFile = (idx: number) => setFiles(prev => prev.filter((_, i) => i !== idx));

  const formatSize = (bytes: number) => bytes < 1024 * 1024
    ? (bytes / 1024).toFixed(1) + ' KB'
    : (bytes / (1024 * 1024)).toFixed(1) + ' MB';

  const handleSubmit = async () => {
    if (!form.eodSummary.trim())        { showToast('error', 'Summary of Completed Work is required.'); return; }
    if (!form.eodAccomplishments.trim()){ showToast('error', 'Accomplishments is required.'); return; }
    if (!form.eodIssues.trim())         { showToast('error', 'Issues Encountered is required.'); return; }
    if (!form.eodDeliverables.trim())   { showToast('error', 'Deliverables Completed is required.'); return; }
    if (files.length === 0)             { showToast('error', 'At least one supporting attachment is required.'); return; }

    setSaving(true);
    const res = await submitWFHEOD({
      wfhId:              wfhRecord.id,
      email:              user.email,
      eodSummary:         form.eodSummary.trim(),
      eodAccomplishments: form.eodAccomplishments.trim(),
      eodIssues:          form.eodIssues.trim(),
      eodDeliverables:    form.eodDeliverables.trim(),
      eodNextDayPlan:     form.eodNextDayPlan.trim() || undefined,
      eodRemarks:         form.eodRemarks.trim() || undefined,
      attachments:        files.map(f => ({ fileName: f.fileName, fileData: f.fileData, mimeType: f.mimeType })),
    });
    setSaving(false);
    if (res.success) {
      showToast('success', 'End-of-Day Report submitted! You may now clock out.');
      setTimeout(() => onSuccess(res.attachments || []), 1500);
    } else {
      showToast('error', res.message || 'Submission failed. Please try again.');
    }
  };

  const Field = ({ label, field, placeholder, required, rows = 3 }: {
    label: string; field: keyof typeof form; placeholder: string; required?: boolean; rows?: number;
  }) => (
    <div>
      <label className="text-white/50 text-[11px] uppercase tracking-wider block mb-1.5">
        {label}{required && <span className="text-rose-400 ml-0.5">*</span>}
      </label>
      <textarea
        value={form[field]}
        onChange={e => setField(field, e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-emerald-400/50 resize-none"
      />
    </div>
  );

  return (
    <div className="min-h-dvh bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 flex flex-col pb-24">
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-xl flex items-center gap-2 text-sm font-medium w-[90vw] max-w-sm
          ${toast.type === 'success' ? 'bg-emerald-500/90 text-white' : 'bg-red-500/90 text-white'}`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="px-4 pt-10 pb-4 bg-slate-900/80 border-b border-white/10">
        <div className="flex items-center gap-3">
          <button onClick={onCancel} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/8 active:scale-90 transition-transform">
            <ArrowLeft className="w-4 h-4 text-white/70" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-400" />
              <h1 className="text-white font-bold text-base">End-of-Day Report</h1>
            </div>
            <p className="text-emerald-200/50 text-[11px] mt-0.5">Required before clocking out</p>
          </div>
        </div>
      </div>

      {/* Info bar */}
      <div className="mx-4 mt-4 bg-amber-500/10 border border-amber-400/20 rounded-xl px-4 py-3 text-[11px] text-amber-300/80">
        <p className="font-semibold text-amber-300 mb-0.5">WFH: {wfhRecord.attendanceDate}</p>
        <p className="text-amber-200/50 truncate">{wfhRecord.workDescription}</p>
      </div>

      {/* Form */}
      <div className="flex-1 px-4 pt-4 space-y-4">
        <Field label="Summary of Completed Work" field="eodSummary" placeholder="Summarise what you accomplished today…" required rows={3} />
        <Field label="Accomplishments" field="eodAccomplishments" placeholder="List your key accomplishments…" required rows={4} />
        <Field label="Issues Encountered" field="eodIssues" placeholder="Describe any issues or blockers encountered…" required rows={3} />
        <Field label="Deliverables Completed" field="eodDeliverables" placeholder="List the deliverables you completed…" required rows={3} />
        <Field label="Next-Day Plan" field="eodNextDayPlan" placeholder="What do you plan to do tomorrow? (optional)…" rows={2} />
        <Field label="Additional Remarks" field="eodRemarks" placeholder="Any additional remarks (optional)…" rows={2} />

        {/* Attachments */}
        <div>
          <label className="text-white/50 text-[11px] uppercase tracking-wider block mb-1.5">
            Supporting Attachments<span className="text-rose-400 ml-0.5">*</span>
          </label>
          <input ref={fileRef} type="file" multiple accept={ACCEPTED} onChange={handleFileChange} className="hidden" />
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full border border-dashed border-white/20 rounded-xl py-4 flex flex-col items-center gap-2 text-white/40 hover:bg-white/3 active:scale-[0.98] transition-transform"
          >
            <Upload className="w-5 h-5" />
            <span className="text-xs">Tap to attach files</span>
            <span className="text-[10px] text-white/20">PDF, Word, Excel, Images — max 10 MB each</span>
          </button>

          {files.length > 0 && (
            <div className="mt-2 space-y-2">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-2 bg-white/5 border border-white/8 rounded-xl px-3 py-2">
                  <Paperclip className="w-3.5 h-3.5 text-white/40 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-xs truncate">{f.fileName}</p>
                    <p className="text-white/30 text-[10px]">{formatSize(f.size)}</p>
                  </div>
                  <button onClick={() => removeFile(i)} className="w-6 h-6 flex items-center justify-center rounded-full bg-white/8 active:scale-90">
                    <X className="w-3 h-3 text-white/50" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={handleSubmit}
          disabled={saving}
          className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 active:scale-[0.97] transition-transform disabled:opacity-60 shadow-lg"
        >
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileText className="w-5 h-5" />}
          {saving ? 'Submitting EOD Report…' : 'Submit End-of-Day Report'}
        </button>
      </div>
    </div>
  );
}
