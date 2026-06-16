import { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft, Save, Loader2, CheckCircle2, AlertCircle,
  User as UserIcon, Shield, Users, RefreshCw,
} from 'lucide-react';
import { User, ApproverSettings as ApproverSettingsType, WorkflowType } from '../types';
import { getAllApproverSettings, saveApproverSettings } from '../utils/sheets';

interface Props {
  user: User;
  onBack: () => void;
}

const WORKFLOW_OPTIONS: { value: WorkflowType; label: string; desc: string }[] = [
  { value: 'DIRECT',   label: 'Direct Approval',   desc: 'Goes straight to Approver' },
  { value: 'TWO_STEP', label: 'Two-Step Approval',  desc: 'Team Lead → then Approver' },
];

export default function ApproverSettings({ user, onBack }: Props) {
  const [allSettings, setAllSettings]   = useState<ApproverSettingsType[]>([]);
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState('');
  const [success, setSuccess]           = useState('');
  const [selected, setSelected]         = useState<ApproverSettingsType | null>(null);
  const [form, setForm]                 = useState<ApproverSettingsType>({
    employeeEmail: '', employeeName: '', teamLeadEmail: '', approverEmail: '', workflowType: 'DIRECT',
  });

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getAllApproverSettings(user.email);
    setAllSettings(data);
    setLoading(false);
  }, [user.email]);

  useEffect(() => { load(); }, [load]);

  const notify = (msg: string, isError = false) => {
    if (isError) setError(msg); else setSuccess(msg);
    setTimeout(() => { setError(''); setSuccess(''); }, 3500);
  };

  const openEdit = (s: ApproverSettingsType) => {
    setSelected(s);
    setForm({ ...s });
  };

  const openNew = () => {
    setSelected({ employeeEmail: '__new__', employeeName: '', teamLeadEmail: '', approverEmail: '', workflowType: 'DIRECT' });
    setForm({ employeeEmail: '', employeeName: '', teamLeadEmail: '', approverEmail: '', workflowType: 'DIRECT' });
  };

  const handleSave = async () => {
    if (!form.employeeEmail.trim()) { notify('Employee email is required.', true); return; }
    if (!form.approverEmail.trim()) { notify('Approver email is required.', true); return; }
    setSaving(true);
    const res = await saveApproverSettings(form);
    setSaving(false);
    if (res.success) {
      notify(res.message || 'Saved.');
      setSelected(null);
      load();
    } else {
      notify(res.message || 'Save failed.', true);
    }
  };

  const set = (field: keyof ApproverSettingsType, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="min-h-dvh flex flex-col bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
      {/* Header */}
      <div className="px-4 pt-10 pb-4 bg-slate-900/80 border-b border-white/10">
        <div className="flex items-center gap-3 mb-1">
          <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/8 active:scale-90 transition-transform">
            <ChevronLeft className="w-4 h-4 text-white/70" />
          </button>
          <div className="flex-1">
            <h1 className="text-white font-bold text-base leading-tight">Approver Settings</h1>
            <p className="text-blue-200/60 text-[11px]">Configure leave approval workflow per employee</p>
          </div>
          <button onClick={load} disabled={loading} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/8 active:scale-90">
            <RefreshCw className={`w-4 h-4 text-white/50 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Toast */}
      {(error || success) && (
        <div className={`mx-4 mt-3 rounded-xl px-4 py-3 flex items-center gap-2 text-sm ${error ? 'bg-red-500/10 text-red-300 border border-red-400/20' : 'bg-emerald-500/10 text-emerald-300 border border-emerald-400/20'}`}>
          {error ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
          {error || success}
        </div>
      )}

      {/* List */}
      <div className="flex-1 px-4 py-3 space-y-3 max-w-lg mx-auto w-full">
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
          </div>
        )}

        {!loading && (
          <button
            onClick={openNew}
            className="w-full bg-blue-500/10 border border-blue-500/30 border-dashed rounded-2xl py-4 text-blue-300 text-sm font-medium flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
          >
            <Users className="w-4 h-4" />
            Add Employee Approver Config
          </button>
        )}

        {!loading && allSettings.map((s) => (
          <button
            key={s.employeeEmail}
            onClick={() => openEdit(s)}
            className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-left active:scale-[0.98] transition-transform hover:bg-white/8"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
                <UserIcon className="w-4 h-4 text-blue-300" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-white font-semibold text-sm truncate">{s.employeeName || s.employeeEmail}</p>
                <p className="text-white/40 text-[11px] truncate">{s.employeeEmail}</p>
              </div>
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${s.workflowType === 'TWO_STEP' ? 'bg-violet-400/15 text-violet-300 border-violet-400/30' : 'bg-blue-400/15 text-blue-300 border-blue-400/30'}`}>
                {s.workflowType === 'TWO_STEP' ? '2-Step' : 'Direct'}
              </span>
            </div>
            <div className="space-y-0.5 text-[11px] text-white/40">
              {s.teamLeadEmail && <p><span className="text-white/25">TL:</span> {s.teamLeadEmail}</p>}
              <p><span className="text-white/25">Approver:</span> {s.approverEmail || '—'}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Edit / New Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center">
          <div className="bg-slate-900 border border-white/10 rounded-t-3xl sm:rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto slide-up">
            <div className="sticky top-0 bg-slate-900 border-b border-white/10 px-5 py-4 flex items-center justify-between">
              <h2 className="text-white font-bold">
                {selected.employeeEmail === '__new__' ? 'New Config' : 'Edit Config'}
              </h2>
              <button onClick={() => setSelected(null)} className="w-8 h-8 bg-white/8 rounded-full flex items-center justify-center text-white/50 active:scale-90">
                ✕
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Employee fields */}
              <div>
                <label className="text-white/40 text-[11px] uppercase tracking-wide block mb-1">Employee Email *</label>
                <input
                  value={form.employeeEmail}
                  onChange={(e: { target: { value: string } }) => set('employeeEmail', e.target.value)}
                  placeholder="employee@company.com"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/25 focus:outline-none focus:border-blue-400/50"
                />
              </div>
              <div>
                <label className="text-white/40 text-[11px] uppercase tracking-wide block mb-1">Employee Name</label>
                <input
                  value={form.employeeName}
                  onChange={(e: { target: { value: string } }) => set('employeeName', e.target.value)}
                  placeholder="Full name (optional)"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/25 focus:outline-none focus:border-blue-400/50"
                />
              </div>

              {/* Workflow type */}
              <div>
                <label className="text-white/40 text-[11px] uppercase tracking-wide block mb-2">Workflow Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {WORKFLOW_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => set('workflowType', opt.value)}
                      className={`rounded-xl p-3 text-left border transition-colors active:scale-95 ${form.workflowType === opt.value ? 'bg-blue-500/20 border-blue-400/40 text-blue-300' : 'bg-white/5 border-white/10 text-white/60'}`}
                    >
                      <p className="text-sm font-semibold">{opt.label}</p>
                      <p className="text-[10px] opacity-60 mt-0.5">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Team lead (only for two-step) */}
              {form.workflowType === 'TWO_STEP' && (
                <div>
                  <label className="text-white/40 text-[11px] uppercase tracking-wide block mb-1">Team Lead Email</label>
                  <input
                    value={form.teamLeadEmail}
                    onChange={(e: { target: { value: string } }) => set('teamLeadEmail', e.target.value)}
                    placeholder="teamlead@company.com"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/25 focus:outline-none focus:border-blue-400/50"
                  />
                </div>
              )}

              {/* Approver */}
              <div>
                <label className="text-white/40 text-[11px] uppercase tracking-wide block mb-1">
                  Approver Email * {form.workflowType === 'TWO_STEP' ? '(Department Head)' : ''}
                </label>
                <input
                  value={form.approverEmail}
                  onChange={(e: { target: { value: string } }) => set('approverEmail', e.target.value)}
                  placeholder="approver@company.com"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/25 focus:outline-none focus:border-blue-400/50"
                />
              </div>

              {/* Save button */}
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full bg-blue-600 text-white rounded-xl py-3 font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-transform disabled:opacity-60 mt-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
