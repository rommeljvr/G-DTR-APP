import { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft, Save, Loader2, CheckCircle2, AlertCircle,
  User as UserIcon, Users, RefreshCw, Search, ChevronDown,
} from 'lucide-react';
import { User, ApproverSettings as ApproverSettingsType, WorkflowType } from '../types';
import { getAllApproverSettings, saveApproverSettings, getEmployees, EmployeeRecord } from '../utils/sheets';

interface Props {
  user: User;
  onBack: () => void;
}

const WORKFLOW_OPTIONS: { value: WorkflowType; label: string; desc: string }[] = [
  { value: 'DIRECT',   label: 'Direct Approval',   desc: 'Goes straight to Approver' },
  { value: 'TWO_STEP', label: 'Two-Step Approval',  desc: 'Team Lead → then Approver' },
];

function EmployeeSelect({
  label, value, employees, onChange, required, subtitle,
}: {
  label: string;
  value: string;
  employees: EmployeeRecord[];
  onChange: (email: string, name: string) => void;
  required?: boolean;
  subtitle?: string;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen]   = useState(false);

  const selected = employees.find((e) => e.email.toLowerCase() === value.toLowerCase());
  const filtered = query.trim()
    ? employees.filter((e) =>
        e.name.toLowerCase().includes(query.toLowerCase()) ||
        e.email.toLowerCase().includes(query.toLowerCase())
      )
    : employees;

  return (
    <div className="relative">
      <label className="text-white/40 text-[11px] uppercase tracking-wide block mb-1">
        {label}{required && ' *'}{subtitle && <span className="normal-case ml-1 text-white/25">({subtitle})</span>}
      </label>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center gap-2 bg-white/5 border rounded-xl px-3 py-2.5 text-sm text-left transition-colors ${open ? 'border-blue-400/50' : 'border-white/10'}`}
      >
        <div className="flex-1 min-w-0">
          {selected ? (
            <>
              <p className="text-white font-medium truncate leading-tight">{selected.name}</p>
              <p className="text-white/40 text-[11px] truncate">{selected.email}</p>
            </>
          ) : (
            <p className="text-white/30">— Select employee —</p>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-white/40 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-10 mt-1 w-full bg-slate-800 border border-white/10 rounded-xl shadow-xl overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10">
            <Search className="w-3.5 h-3.5 text-white/40 shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e: { target: { value: string } }) => setQuery(e.target.value)}
              placeholder="Search name or email…"
              className="flex-1 bg-transparent text-white text-sm placeholder-white/30 focus:outline-none"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {!value && (
              <button
                onClick={() => { onChange('', ''); setOpen(false); setQuery(''); }}
                className="w-full text-left px-4 py-2.5 text-white/40 text-sm hover:bg-white/5"
              >
                — None —
              </button>
            )}
            {filtered.length === 0 && (
              <p className="px-4 py-3 text-white/30 text-sm">No employees found</p>
            )}
            {filtered.map((emp) => (
              <button
                key={emp.email}
                onClick={() => { onChange(emp.email, emp.name); setOpen(false); setQuery(''); }}
                className={`w-full text-left px-4 py-2.5 hover:bg-white/8 transition-colors ${emp.email.toLowerCase() === value.toLowerCase() ? 'bg-blue-500/15' : ''}`}
              >
                <p className="text-white text-sm font-medium truncate">{emp.name}</p>
                <p className="text-white/40 text-[11px] truncate">{emp.email}</p>
                {emp.department && <p className="text-blue-300/50 text-[10px]">{emp.department}</p>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ApproverSettings({ user, onBack }: Props) {
  const [allSettings, setAllSettings]   = useState<ApproverSettingsType[]>([]);
  const [employees, setEmployees]       = useState<EmployeeRecord[]>([]);
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
    const [settingsData, empData] = await Promise.all([
      getAllApproverSettings(user.email),
      getEmployees(),
    ]);
    setAllSettings(settingsData);
    setEmployees(empData.employees.filter((e) => e.active !== false));
    setLoading(false);
  }, [user.email]);

  useEffect(() => { load(); }, [load]);

  const notify = (msg: string, isError = false) => {
    if (isError) setError(msg); else setSuccess(msg);
    setTimeout(() => { setError(''); setSuccess(''); }, 3500);
  };

  const openEdit = (s: ApproverSettingsType) => { setSelected(s); setForm({ ...s }); };
  const openNew  = () => {
    setSelected({ employeeEmail: '__new__', employeeName: '', teamLeadEmail: '', approverEmail: '', workflowType: 'DIRECT' });
    setForm({ employeeEmail: '', employeeName: '', teamLeadEmail: '', approverEmail: '', workflowType: 'DIRECT' });
  };

  const handleSave = async () => {
    if (!form.employeeEmail.trim()) { notify('Employee is required.', true); return; }
    if (!form.approverEmail.trim()) { notify('Approver is required.', true); return; }
    setSaving(true);
    const res = await saveApproverSettings(form);
    setSaving(false);
    if (res.success) { notify(res.message || 'Saved.'); setSelected(null); load(); }
    else notify(res.message || 'Save failed.', true);
  };

  const setField = (field: keyof ApproverSettingsType, value: string) =>
    setForm((prev: ApproverSettingsType) => ({ ...prev, [field]: value }));

  const nameFor = (email: string) =>
    employees.find((e) => e.email.toLowerCase() === email.toLowerCase())?.name || email;

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
            <p className="text-white/30 text-sm">Loading employees…</p>
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
                <p className="text-white font-semibold text-sm truncate">{s.employeeName || nameFor(s.employeeEmail)}</p>
                <p className="text-white/40 text-[11px] truncate">{s.employeeEmail}</p>
              </div>
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${s.workflowType === 'TWO_STEP' ? 'bg-violet-400/15 text-violet-300 border-violet-400/30' : 'bg-blue-400/15 text-blue-300 border-blue-400/30'}`}>
                {s.workflowType === 'TWO_STEP' ? '2-Step' : 'Direct'}
              </span>
            </div>
            <div className="space-y-0.5 text-[11px] text-white/40">
              {s.teamLeadEmail && <p><span className="text-white/25">TL:</span> {nameFor(s.teamLeadEmail)}</p>}
              <p><span className="text-white/25">Approver:</span> {s.approverEmail ? nameFor(s.approverEmail) : '—'}</p>
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
              {/* Employee picker */}
              <EmployeeSelect
                label="Employee"
                value={form.employeeEmail}
                employees={employees}
                required
                onChange={(email, name) => setForm((prev: ApproverSettingsType) => ({ ...prev, employeeEmail: email, employeeName: name }))}
              />

              {/* Workflow type */}
              <div>
                <label className="text-white/40 text-[11px] uppercase tracking-wide block mb-2">Workflow Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {WORKFLOW_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setField('workflowType', opt.value)}
                      className={`rounded-xl p-3 text-left border transition-colors active:scale-95 ${form.workflowType === opt.value ? 'bg-blue-500/20 border-blue-400/40 text-blue-300' : 'bg-white/5 border-white/10 text-white/60'}`}
                    >
                      <p className="text-sm font-semibold">{opt.label}</p>
                      <p className="text-[10px] opacity-60 mt-0.5">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Team Lead picker (two-step only) */}
              {form.workflowType === 'TWO_STEP' && (
                <EmployeeSelect
                  label="Team Lead"
                  value={form.teamLeadEmail}
                  employees={employees}
                  subtitle="acknowledges first"
                  onChange={(email) => setField('teamLeadEmail', email)}
                />
              )}

              {/* Approver picker */}
              <EmployeeSelect
                label="Approver"
                value={form.approverEmail}
                employees={employees}
                required
                subtitle={form.workflowType === 'TWO_STEP' ? 'final decision' : undefined}
                onChange={(email) => setField('approverEmail', email)}
              />

              {/* Save */}
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
