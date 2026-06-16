import { useState, useEffect, useMemo, useRef } from 'react';
import {
  ChevronLeft, Search, X, RefreshCw, Loader2, Plus, Edit2,
  UserX, UserCheck, AlertCircle, Check, ChevronDown, User as UserIcon,
  Camera, Upload, Briefcase, Building2, DollarSign, Mail, ShieldCheck, Trash2,
} from 'lucide-react';
import {
  getEmployees, createEmployee, updateEmployee, deactivateEmployee,
  getDepartments, getDesignations, uploadEmployeePhoto, EmployeeRecord,
} from '../utils/sheets';
import CameraCapture from './CameraCapture';

interface Props {
  onBack: () => void;
}

type DrawerMode = 'create' | 'edit' | null;
type PhotoStep = 'idle' | 'camera' | 'uploading';

const ROLES = ['Admin', 'Level 1', 'Level 2'];

const STATUS_STYLE: Record<string, string> = {
  true:  'bg-emerald-400/15 text-emerald-300 border-emerald-400/30',
  false: 'bg-white/10 text-white/40 border-white/20',
};

function initials(name: string): string {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

function Avatar({ image, name, size = 'md' }: { image?: string; name: string; size?: 'sm' | 'md' | 'lg' }) {
  const [err, setErr] = useState(false);
  useEffect(() => { setErr(false); }, [image]);
  const dim = size === 'lg' ? 'w-16 h-16 text-lg' : size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm';
  if (image && !err) {
    return <img src={image} alt={name} onError={() => setErr(true)} className={`${dim} rounded-full object-cover shrink-0`} />;
  }
  return (
    <div className={`${dim} rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shrink-0 font-bold text-white`}>
      {initials(name) || <UserIcon className="w-4 h-4" />}
    </div>
  );
}

interface FormState {
  email: string;
  name: string;
  wage: string;
  role: string;
  department: string;
  designation: string;
  imageUrl: string;
}

const EMPTY_FORM: FormState = { email: '', name: '', wage: '', role: 'Level 1', department: '', designation: '', imageUrl: '' };

function CreatableSelect({ label, value, onChange, options, placeholder }: {
  label: string; value: string; onChange: (v: string) => void;
  options: string[]; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = options.filter(o => o.toLowerCase().includes(q.toLowerCase()));

  const select = (v: string) => { onChange(v); setQ(''); setOpen(false); };

  return (
    <div ref={ref} className="relative">
      <label className="text-white/50 text-[11px] font-semibold uppercase tracking-wider mb-1.5 block">{label}</label>
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setQ(''); }}
        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-left flex items-center justify-between focus:outline-none focus:border-blue-400/50"
      >
        <span className={value ? 'text-white' : 'text-white/30'}>{value || placeholder || `Select ${label}`}</span>
        <ChevronDown className="w-4 h-4 text-white/30" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-slate-800 border border-white/10 rounded-xl shadow-xl overflow-hidden">
          <div className="p-2">
            <input
              autoFocus
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search or create…"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-white/30 focus:outline-none"
            />
          </div>
          <div className="max-h-40 overflow-y-auto">
            {filtered.map(o => (
              <button key={o} type="button" onClick={() => select(o)}
                className="w-full text-left px-4 py-2.5 text-sm text-white/80 hover:bg-white/10 flex items-center gap-2">
                {o === value && <Check className="w-3 h-3 text-blue-400" />}
                <span className={o === value ? 'ml-0' : 'ml-5'}>{o}</span>
              </button>
            ))}
            {q && !filtered.includes(q) && (
              <button type="button" onClick={() => select(q)}
                className="w-full text-left px-4 py-2.5 text-sm text-blue-400 hover:bg-white/10 flex items-center gap-2">
                <Plus className="w-3 h-3" />
                Create "{q}"
              </button>
            )}
            {filtered.length === 0 && !q && (
              <p className="px-4 py-3 text-white/30 text-sm">No options</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function EmployeeMaintenance({ onBack }: Props) {
  const [employees, setEmployees]       = useState<EmployeeRecord[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');
  const [search, setSearch]             = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('active');
  const [drawerMode, setDrawerMode]     = useState<DrawerMode>(null);
  const [selected, setSelected]         = useState<EmployeeRecord | null>(null);
  const [form, setForm]                 = useState<FormState>(EMPTY_FORM);
  const [formErrors, setFormErrors]     = useState<Record<string, string>>({});
  const [saving, setSaving]             = useState(false);
  const [saveResult, setSaveResult]     = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [deactivating, setDeactivating] = useState<string | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<EmployeeRecord | null>(null);
  const [departments, setDepartments]   = useState<string[]>([]);
  const [designations, setDesignations] = useState<string[]>([]);
  const [photoStep, setPhotoStep]       = useState<PhotoStep>('idle');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoError, setPhotoError]     = useState('');
  const [photoDebugId, setPhotoDebugId] = useState(''); // DEBUG: Drive file ID
  const fileInputRef = useRef<HTMLInputElement>(null); // kept for programmatic reset only

  const load = async () => {
    setLoading(true);
    setError('');
    const [empRes, deptRes, desgRes] = await Promise.all([
      getEmployees(),
      getDepartments(),
      getDesignations(),
    ]);
    if (empRes.success) setEmployees(empRes.employees);
    else setError(empRes.message);
    if (deptRes.success) setDepartments(deptRes.departments);
    if (desgRes.success) setDesignations(desgRes.designations);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let r = employees;
    if (filterStatus === 'active')   r = r.filter(e => e.active);
    if (filterStatus === 'inactive') r = r.filter(e => !e.active);
    const q = search.toLowerCase();
    if (q) r = r.filter(e =>
      e.name.toLowerCase().includes(q) ||
      e.email.toLowerCase().includes(q) ||
      (e.department || '').toLowerCase().includes(q) ||
      (e.designation || '').toLowerCase().includes(q)
    );
    return r;
  }, [employees, search, filterStatus]);

  const resetPhotoState = () => { setPhotoStep('idle'); setPhotoPreview(null); setPhotoError(''); };

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormErrors({});
    setSaveResult(null);
    setSelected(null);
    resetPhotoState();
    setDrawerMode('create');
  };

  const openEdit = (emp: EmployeeRecord) => {
    setForm({
      email:       emp.email,
      name:        emp.name,
      wage:        String(emp.wage ?? ''),
      role:        emp.role || 'Level 1',
      department:  emp.department || '',
      designation: emp.designation || '',
      imageUrl:    emp.image || '',
    });
    setFormErrors({});
    setSaveResult(null);
    setSelected(emp);
    setPhotoPreview(emp.image || null);
    setPhotoStep('idle');
    setPhotoError('');
    setDrawerMode('edit');
  };

  const closeDrawer = () => { setDrawerMode(null); setSelected(null); setSaveResult(null); resetPhotoState(); };

  const handlePhotoCapture = async (dataUrl: string) => {
    setPhotoStep('uploading');
    setPhotoError('');
    setPhotoDebugId('');
    const emailTarget = form.email.trim().toLowerCase() || 'employee';
    const res = await uploadEmployeePhoto(emailTarget, dataUrl);
    setPhotoDebugId(res.id || '');
    if (res.success && res.url) {
      setPhotoPreview(res.url);
      setField('imageUrl', res.url);
      setPhotoStep('idle');
    } else {
      setPhotoError(res.message || 'Upload failed');
      setPhotoStep('idle');
    }
  };

  const handleFileSelect = (e: { target: HTMLInputElement & EventTarget }) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      await handlePhotoCapture(dataUrl);
    };
    reader.readAsDataURL(file);
    // reset so same file can be re-selected
    setTimeout(() => { if (fileInputRef.current) fileInputRef.current.value = ''; }, 200);
  };

  const validateForm = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.email.trim()) e.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = 'Invalid email address';
    else if (drawerMode === 'create' && employees.some(emp => emp.email.toLowerCase() === form.email.trim().toLowerCase()))
      e.email = 'This email is already registered';
    if (!form.name.trim()) e.name = 'Employee name is required';
    if (form.wage && isNaN(Number(form.wage))) e.wage = 'Hourly wage must be a number';
    if (!form.role) e.role = 'Role is required';
    setFormErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    setSaving(true);
    setSaveResult(null);

    const payload = {
      email:         form.email.trim().toLowerCase(),
      employee_name: form.name.trim(),
      hourly_wage:   form.wage ? Number(form.wage) : 0,
      role:          form.role,
      department:    form.department.trim(),
      designation:   form.designation.trim(),
      image:         form.imageUrl.trim(),
    };

    const res = drawerMode === 'create'
      ? await createEmployee(payload)
      : await updateEmployee(payload);

    setSaving(false);

    if (res.success) {
      setSaveResult({ type: 'success', message: drawerMode === 'create' ? 'Employee created successfully.' : 'Employee updated successfully.' });
      await load();
      if (drawerMode === 'create') {
        if (!departments.includes(payload.department) && payload.department) setDepartments(d => [...d, payload.department]);
        if (!designations.includes(payload.designation) && payload.designation) setDesignations(d => [...d, payload.designation]);
      }
    } else {
      setSaveResult({ type: 'error', message: res.message });
    }
  };

  const handleDeactivate = async (emp: EmployeeRecord) => {
    setDeactivating(emp.email);
    const res = await deactivateEmployee(emp.email, !emp.active);
    setDeactivating(null);
    setConfirmDeactivate(null);
    if (res.success) {
      setEmployees(prev => prev.map(e => e.email === emp.email ? { ...e, active: !emp.active } : e));
    }
  };

  const setField = (k: keyof FormState, v: string) => {
    setForm(f => ({ ...f, [k]: v }));
    if (formErrors[k]) setFormErrors(e => { const c = { ...e }; delete c[k]; return c; });
  };

  return (
    <div className="min-h-dvh flex flex-col bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">

      {/* Deactivate confirmation dialog */}
      {confirmDeactivate && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center px-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-sm">
            <div className="text-center mb-5">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 ${confirmDeactivate.active ? 'bg-red-500/15' : 'bg-emerald-500/15'}`}>
                {confirmDeactivate.active ? <UserX className="w-6 h-6 text-red-400" /> : <UserCheck className="w-6 h-6 text-emerald-400" />}
              </div>
              <h3 className="text-white font-bold text-base mb-1">
                {confirmDeactivate.active ? 'Deactivate Employee?' : 'Reactivate Employee?'}
              </h3>
              <p className="text-white/50 text-sm">
                <span className="text-white/80 font-medium">{confirmDeactivate.name}</span> will be marked as{' '}
                {confirmDeactivate.active ? 'inactive and cannot log in.' : 'active again.'}
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeactivate(null)} disabled={!!deactivating}
                className="flex-1 py-3 rounded-xl bg-white/10 text-white/70 text-sm font-semibold active:scale-95 transition-transform disabled:opacity-40">
                Cancel
              </button>
              <button onClick={() => handleDeactivate(confirmDeactivate)} disabled={!!deactivating}
                className={`flex-1 py-3 rounded-xl text-white text-sm font-semibold active:scale-95 transition-transform disabled:opacity-50 flex items-center justify-center gap-2 ${confirmDeactivate.active ? 'bg-red-500' : 'bg-emerald-500'}`}>
                {deactivating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {deactivating ? 'Processing…' : confirmDeactivate.active ? 'Deactivate' : 'Reactivate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Drawer (Create / Edit) ───────────────────── */}
      {drawerMode && (
        <>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" onClick={closeDrawer} />
          <div className="fixed top-0 right-0 h-full w-full max-w-md z-50 flex flex-col bg-slate-900 border-l border-white/10 shadow-2xl slide-up overflow-auto">
            {/* Drawer header */}
            <div className="sticky top-0 bg-slate-900/95 backdrop-blur-xl border-b border-white/10 px-5 py-4 flex items-center justify-between z-10">
              <div>
                <p className="text-white/50 text-[10px] font-semibold uppercase tracking-widest">
                  {drawerMode === 'create' ? 'New Employee' : 'Edit Employee'}
                </p>
                <p className="text-white font-bold text-sm">{drawerMode === 'edit' ? selected?.name : 'Add to roster'}</p>
              </div>
              <button onClick={closeDrawer} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/10 active:scale-90 transition-transform">
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            {/* Camera capture overlay */}
            {photoStep === 'camera' && (
              <div className="fixed inset-0 z-[70]">
                <CameraCapture
                  onCapture={handlePhotoCapture}
                  onCancel={() => setPhotoStep('idle')}
                />
              </div>
            )}

            {/* Avatar + photo controls */}
            <div className="flex flex-col items-center pt-6 pb-2 gap-3">
              <div className="relative">
                <Avatar image={photoPreview || form.imageUrl || undefined} name={form.name || '?'} size="lg" />
                {photoStep === 'uploading' && (
                  <div className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 text-white animate-spin" />
                  </div>
                )}
              </div>

              {/* Photo upload area — same pattern as LeaveApplication document upload */}
              {photoPreview || form.imageUrl ? (
                /* Photo already set — show name + actions */
                <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 w-full max-w-xs">
                  <Upload className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span className="text-white/70 text-xs truncate flex-1">Photo uploaded ✓</span>
                  <label className="cursor-pointer text-blue-400 hover:text-blue-300 transition-colors text-xs font-semibold shrink-0">
                    Change
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileSelect}
                    />
                  </label>
                  <span className="text-white/20">·</span>
                  <button
                    type="button"
                    onClick={() => setPhotoStep('camera')}
                    className="text-white/40 hover:text-blue-300 transition-colors text-xs shrink-0"
                  >
                    Camera
                  </button>
                  <span className="text-white/20">·</span>
                  <button
                    type="button"
                    onClick={() => { setPhotoPreview(null); setField('imageUrl', ''); }}
                    className="text-red-400/60 hover:text-red-400 transition-colors shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                /* No photo yet — dashed tap area (primary) + camera link */
                <div className="flex flex-col items-center gap-2 w-full max-w-xs">
                  <label className={`flex items-center gap-2 bg-white/5 border border-dashed border-white/20 rounded-xl px-4 py-3 w-full cursor-pointer hover:bg-white/8 transition-colors ${
                    photoStep === 'uploading' ? 'pointer-events-none opacity-40' : ''
                  }`}>
                    <Upload className="w-4 h-4 text-blue-400/60 shrink-0" />
                    <span className="text-white/40 text-sm">Tap to upload a photo</span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileSelect}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setPhotoStep('camera')}
                    disabled={photoStep === 'uploading'}
                    className="flex items-center gap-1.5 text-white/35 hover:text-blue-300 text-xs transition-colors disabled:opacity-40"
                  >
                    <Camera className="w-3 h-3" />
                    or use camera
                  </button>
                </div>
              )}
              {photoError && <p className="text-red-400 text-xs text-center">{photoError}</p>}
              {/* DEBUG: show Drive file ID after upload */}
              {photoDebugId && (
                <p className="text-yellow-400/70 text-[10px] text-center font-mono break-all max-w-xs">
                  [DEBUG] fileId: {photoDebugId}
                </p>
              )}
            </div>

            {/* Form */}
            <div className="p-5 space-y-4 flex-1">

              {/* Email */}
              <div>
                <label className="text-white/50 text-[11px] font-semibold uppercase tracking-wider mb-1.5 block">Email *</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setField('email', e.target.value)}
                    disabled={drawerMode === 'edit'}
                    placeholder="employee@example.com"
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-white text-sm placeholder-white/25 focus:outline-none focus:border-blue-400/50 disabled:opacity-50"
                  />
                </div>
                {formErrors.email && <p className="text-red-400 text-xs mt-1">{formErrors.email}</p>}
              </div>

              {/* Name */}
              <div>
                <label className="text-white/50 text-[11px] font-semibold uppercase tracking-wider mb-1.5 block">Employee Name *</label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => setField('name', e.target.value)}
                    placeholder="Full name"
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-white text-sm placeholder-white/25 focus:outline-none focus:border-blue-400/50"
                  />
                </div>
                {formErrors.name && <p className="text-red-400 text-xs mt-1">{formErrors.name}</p>}
              </div>

              {/* Hourly Wage */}
              <div>
                <label className="text-white/50 text-[11px] font-semibold uppercase tracking-wider mb-1.5 block">Hourly Wage</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
                  <input
                    type="number"
                    min="0"
                    value={form.wage}
                    onChange={e => setField('wage', e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-white text-sm placeholder-white/25 focus:outline-none focus:border-blue-400/50"
                  />
                </div>
                {formErrors.wage && <p className="text-red-400 text-xs mt-1">{formErrors.wage}</p>}
              </div>

              {/* Role */}
              <div>
                <label className="text-white/50 text-[11px] font-semibold uppercase tracking-wider mb-1.5 block">Role *</label>
                <div className="relative">
                  <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
                  <select
                    value={form.role}
                    onChange={e => setField('role', e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-400/50 appearance-none"
                  >
                    {ROLES.map(r => <option key={r} value={r} className="bg-slate-800">{r}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
                </div>
                {formErrors.role && <p className="text-red-400 text-xs mt-1">{formErrors.role}</p>}
              </div>

              {/* Department */}
              <CreatableSelect label="Department" value={form.department} onChange={v => setField('department', v)} options={departments} />

              {/* Designation */}
              <CreatableSelect label="Designation" value={form.designation} onChange={v => setField('designation', v)} options={designations} />

              {/* imageUrl hidden — managed by camera upload */}

              {/* Result */}
              {saveResult && (
                <div className={`flex items-start gap-2 px-4 py-3 rounded-xl border text-sm ${
                  saveResult.type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-400/20 text-emerald-300'
                    : 'bg-red-500/10 border-red-400/20 text-red-300'
                }`}>
                  {saveResult.type === 'success' ? <Check className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                  {saveResult.message}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 pb-8 pt-2 border-t border-white/10 space-y-2">
              <button onClick={handleSave} disabled={saving}
                className="w-full bg-gradient-to-r from-blue-500 to-blue-700 text-white font-semibold py-3 rounded-xl active:scale-95 transition-transform disabled:opacity-50 flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {saving ? 'Saving…' : drawerMode === 'create' ? 'Create Employee' : 'Save Changes'}
              </button>
              <button onClick={closeDrawer} className="w-full py-3 rounded-xl bg-white/5 text-white/60 text-sm font-medium active:scale-95 transition-transform">
                Cancel
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Header ───────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-xl border-b border-white/10">
        <div className="flex items-center gap-3 px-4 py-3 max-w-2xl mx-auto">
          <button onClick={onBack} className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/10 active:scale-90 transition-transform">
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>
          <div className="flex-1">
            <h1 className="text-white font-bold text-base">Employee Maintenance</h1>
            <p className="text-white/40 text-[11px]">{filtered.length} employee{filtered.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={load} disabled={loading}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/10 active:scale-90 transition-transform disabled:opacity-40">
            <RefreshCw className={`w-4 h-4 text-white ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={openCreate}
            className="flex items-center gap-1.5 bg-blue-500 text-white text-sm font-semibold px-3 py-2 rounded-xl active:scale-95 transition-transform">
            <Plus className="w-4 h-4" />
            Add
          </button>
        </div>

        {/* Search + status filter */}
        <div className="px-4 pb-3 max-w-2xl mx-auto flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name, email, department…"
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-3 py-2 text-white text-xs placeholder-white/25 focus:outline-none focus:border-blue-400/50"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                <X className="w-3.5 h-3.5 text-white/40" />
              </button>
            )}
          </div>
          <div className="flex bg-white/5 border border-white/10 rounded-xl overflow-hidden">
            {(['all', 'active', 'inactive'] as const).map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`px-3 py-2 text-xs font-medium capitalize transition-colors ${filterStatus === s ? 'bg-blue-500/30 text-blue-300' : 'text-white/40 hover:text-white/60'}`}>
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Content ──────────────────────────────────── */}
      <div className="flex-1 px-4 py-4 max-w-2xl mx-auto w-full">

        {loading && (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-white/5 rounded-2xl p-4 animate-pulse flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/10 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-white/10 rounded w-1/2" />
                  <div className="h-2.5 bg-white/10 rounded w-1/3" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="flex items-center gap-2 text-red-300 bg-red-500/10 border border-red-400/20 rounded-2xl px-4 py-3 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="text-center py-16">
            <UserIcon className="w-12 h-12 text-white/20 mx-auto mb-3" />
            <p className="text-white/40 text-sm">No employees found</p>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="space-y-2">
            {filtered.map(emp => (
              <div key={emp.email} className="bg-white/5 border border-white/8 rounded-2xl p-4 flex items-start gap-3">
                <Avatar image={emp.image} name={emp.name} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-white font-semibold text-sm truncate">{emp.name}</p>
                      <p className="text-white/40 text-xs truncate">{emp.email}</p>
                    </div>
                    <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLE[String(emp.active)]}`}>
                      {emp.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                    {emp.department && (
                      <span className="flex items-center gap-1 text-white/50 text-[11px]">
                        <Building2 className="w-3 h-3" />{emp.department}
                      </span>
                    )}
                    {emp.designation && (
                      <span className="flex items-center gap-1 text-white/50 text-[11px]">
                        <Briefcase className="w-3 h-3" />{emp.designation}
                      </span>
                    )}
                    {emp.role && (
                      <span className="flex items-center gap-1 text-blue-400/70 text-[11px]">
                        <ShieldCheck className="w-3 h-3" />{emp.role}
                      </span>
                    )}
                    {emp.wage != null && emp.wage > 0 && (
                      <span className="flex items-center gap-1 text-white/50 text-[11px]">
                        <DollarSign className="w-3 h-3" />₱{emp.wage}/hr
                      </span>
                    )}
                  </div>
                </div>
                {/* Actions */}
                <div className="flex flex-col gap-1.5 shrink-0">
                  <button onClick={() => openEdit(emp)}
                    className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/10 active:scale-90 transition-transform">
                    <Edit2 className="w-3.5 h-3.5 text-white/70" />
                  </button>
                  <button onClick={() => setConfirmDeactivate(emp)} disabled={deactivating === emp.email}
                    className={`w-8 h-8 flex items-center justify-center rounded-xl active:scale-90 transition-transform ${emp.active ? 'bg-red-500/10' : 'bg-emerald-500/10'}`}>
                    {deactivating === emp.email
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin text-white/40" />
                      : emp.active
                        ? <UserX className="w-3.5 h-3.5 text-red-400" />
                        : <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                    }
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
