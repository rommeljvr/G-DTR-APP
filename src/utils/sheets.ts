import { AttendanceRecord, Employee, ApproverSettings, LeaveApplication, AppNotification, DTRRecord, DTRIssueType } from '../types';
import { getConfig } from './config';

// ─── helpers ───────────────────────────────────────────────────────

export function getScriptUrl(): string {
  return getConfig().SCRIPT_URL;
}

export function getFolderId(): string {
  return getConfig().FOLDER_ID;
}

// ─── connection test ───────────────────────────────────────────────

export async function testConnection(): Promise<{ success: boolean; message: string }> {
  const url = getScriptUrl();
  if (!url) return { success: false, message: 'No script URL configured' };

  try {
    const res = await fetch(`${url}?action=test`, {
      method: 'GET',
      redirect: 'follow',
    });
    const json = await res.json();
    if (json.success) return { success: true, message: json.message || 'Connected!' };
    return { success: false, message: json.message || 'Unknown error' };
  } catch {
    return { success: false, message: 'Connection failed. Check your URL.' };
  }
}

// ─── validate employee ─────────────────────────────────────────────

export async function validateEmployee(
  email: string
): Promise<{ valid: boolean; employee?: Employee; message: string }> {
  const scriptUrl = getScriptUrl();

  if (!scriptUrl) {
    return { valid: false, message: 'No backend configured. Please set up Google Sheets.' };
  }

  try {
    const res = await fetch(
      `${scriptUrl}?action=validateEmployee&email=${encodeURIComponent(email.toLowerCase())}`,
      { method: 'GET', redirect: 'follow' }
    );
    const json = await res.json();

    if (json.success && json.valid) {
      return {
        valid: true,
        employee: json.employee,
        message: json.message || 'Employee validated',
      };
    }

    return {
      valid: false,
      message: json.message || 'Employee not found in the system',
    };
  } catch (err) {
    console.error('Validate employee error:', err);
    return { valid: false, message: 'Unable to validate. Check your connection.' };
  }
}

// ─── submit attendance ─────────────────────────────────────────────

export async function submitAttendance(
  record: Omit<AttendanceRecord, 'id'>
): Promise<{ success: boolean; message: string; imageUrl?: string; imageId?: string }> {
  const scriptUrl = getScriptUrl();

  // Always save locally first
  saveToLocalStorage(record);

  if (!scriptUrl) {
    console.log('No script URL configured, saving locally only');
    return { success: true, message: 'Attendance recorded locally!' };
  }

  try {
    const photoSize = record.photo ? record.photo.length : 0;
    const hasBase64Prefix = record.photo ? record.photo.includes('base64,') : false;
    console.log(`Submitting attendance. Photo size: ${photoSize} bytes, has base64 prefix: ${hasBase64Prefix}`);

    if (!record.photo || photoSize < 100) {
      console.warn('Photo data is missing or too small');
    }

    const payload = {
      action: 'submitAttendance',
      folderId: getFolderId(),
      data: {
        userId: record.userId,
        userName: record.userName,
        userEmail: record.userEmail,
        action: record.action,
        timestamp: record.timestamp,
        date: record.date,
        time: record.time,
        latitude: record.latitude,
        longitude: record.longitude,
        accuracy: record.accuracy,
        address: record.address,
        deviceInfo: record.deviceInfo,
        department: record.department || '',
        designation: record.designation || '',
        photo: record.photo,
      },
    };

    console.log('Sending to script:', scriptUrl);
    console.log('Payload data keys:', Object.keys(payload.data));
    console.log('Photo payload size:', payload.data.photo ? payload.data.photo.length : 0);

    const response = await fetch(scriptUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });

    console.log('Response status:', response.status, response.statusText);
    const responseText = await response.text();
    console.log('Raw response:', responseText.substring(0, 500));

    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseErr) {
      console.error('Failed to parse response as JSON:', parseErr);
      return {
        success: false,
        message: 'Server returned invalid JSON. Check console for details.',
      };
    }

    console.log('Script response:', result);

    if (result.imageId) {
      updateLocalRecordField(record.timestamp, 'imageId', result.imageId);
      console.log('Image saved to Drive, ID:', result.imageId);
    }
    if (result.imageUrl) {
      updateLocalRecordField(record.timestamp, 'imageUrl', result.imageUrl);
      console.log('Image URL:', result.imageUrl);
    }

    return {
      success: result.success !== false,
      message: result.message || 'Attendance recorded!',
      imageUrl: result.imageUrl,
      imageId: result.imageId,
    };
  } catch (err) {
    console.error('Submit error:', err);
    return { success: true, message: 'Saved locally. Cloud sync will retry.' };
  }
}

// ─── leave credits ────────────────────────────────────────────────

export async function getLeaveCredits(
  email: string
): Promise<{ success: boolean; credits?: import('../types').LeaveCredits; message: string }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: false, message: 'No script URL configured' };
  try {
    const res = await fetch(
      `${scriptUrl}?action=getLeaveCredits&email=${encodeURIComponent(email)}`,
      { method: 'GET', redirect: 'follow' }
    );
    const json = await res.json();
    if (json.success) {
      return { success: true, credits: json.credits, message: 'Credits loaded' };
    }
    return { success: false, message: json.message || 'Failed to fetch credits' };
  } catch (err) {
    console.error('getLeaveCredits error:', err);
    return { success: false, message: 'Unable to fetch leave credits' };
  }
}

export async function submitLeaveApplication(
  application: Omit<import('../types').LeaveApplication, 'id' | 'submittedAt'>,
  documentData?: string
): Promise<{ success: boolean; message: string; id?: string; docId?: string; docUrl?: string }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) {
    return { success: false, message: 'No script URL configured' };
  }
  try {
    const payload = {
      action: 'submitLeave',
      data: {
        ...application,
        documentData: documentData || '',
      },
    };
    const response = await fetch(scriptUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    return {
      success: result.success !== false,
      message: result.message || 'Leave application submitted',
      id: result.id,
      docId: result.docId,
      docUrl: result.docUrl,
    };
  } catch (err) {
    console.error('submitLeave error:', err);
    return { success: false, message: 'Submission failed. Please try again.' };
  }
}

// ─── cancel leave application ─────────────────────────────────────

export async function cancelLeave(
  id: string,
  email: string
): Promise<{ success: boolean; message: string; cancelledAt?: string }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: false, message: 'No script URL configured' };
  try {
    const res = await fetch(scriptUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'cancelLeave', id, email }),
    });
    const json = await res.json();
    return {
      success: json.success,
      message: json.message || (json.success ? 'Cancelled' : 'Failed to cancel'),
      cancelledAt: json.cancelledAt,
    };
  } catch (err) {
    console.error('cancelLeave error:', err);
    return { success: false, message: 'Unable to cancel leave application' };
  }
}

// ─── employee maintenance ─────────────────────────────────────────

export interface EmployeeRecord {
  email: string;
  name: string;
  wage: number;
  role: string;
  image: string;
  department: string;
  designation: string;
  active: boolean;
}

export interface EmployeePayload {
  email: string;
  employee_name: string;
  hourly_wage: number;
  role: string;
  department: string;
  designation: string;
  image?: string;
}

async function employeePost(body: object): Promise<{ success: boolean; message: string }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: false, message: 'No script URL configured' };
  try {
    const res = await fetch(scriptUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    return { success: !!json.success, message: json.message || (json.success ? 'OK' : 'Request failed') };
  } catch (err) {
    console.error('employeePost error:', err);
    return { success: false, message: 'Network error' };
  }
}

export async function getEmployees(): Promise<{ success: boolean; employees: EmployeeRecord[]; message: string }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: false, employees: [], message: 'No script URL configured' };
  try {
    const res = await fetch(`${scriptUrl}?action=getEmployees`, { method: 'GET', redirect: 'follow' });
    const json = await res.json();
    if (json.success) return { success: true, employees: json.employees || [], message: '' };
    return { success: false, employees: [], message: json.message || 'Failed to load employees' };
  } catch (err) {
    console.error('getEmployees error:', err);
    return { success: false, employees: [], message: 'Unable to fetch employees' };
  }
}

export async function getDepartments(): Promise<{ success: boolean; departments: string[] }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: false, departments: [] };
  try {
    const res = await fetch(`${scriptUrl}?action=getDepartments`, { method: 'GET', redirect: 'follow' });
    const json = await res.json();
    return { success: true, departments: json.departments || [] };
  } catch {
    return { success: false, departments: [] };
  }
}

export async function getDesignations(): Promise<{ success: boolean; designations: string[] }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: false, designations: [] };
  try {
    const res = await fetch(`${scriptUrl}?action=getDesignations`, { method: 'GET', redirect: 'follow' });
    const json = await res.json();
    return { success: true, designations: json.designations || [] };
  } catch {
    return { success: false, designations: [] };
  }
}

export async function createEmployee(payload: EmployeePayload): Promise<{ success: boolean; message: string }> {
  return employeePost({ action: 'createEmployee', ...payload });
}

export async function updateEmployee(payload: EmployeePayload): Promise<{ success: boolean; message: string }> {
  return employeePost({ action: 'updateEmployee', ...payload });
}

export async function deactivateEmployee(email: string, active: boolean): Promise<{ success: boolean; message: string }> {
  return employeePost({ action: 'deactivateEmployee', email, active });
}

export async function uploadEmployeePhoto(
  email: string,
  photoDataUrl: string
): Promise<{ success: boolean; url?: string; id?: string; message: string }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: false, message: 'No script URL configured' };
  try {
    const res = await fetch(scriptUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'uploadEmployeePhoto', email, photo: photoDataUrl }),
    });
    const json = await res.json();
    return { success: !!json.success, url: json.url, id: json.id, message: json.message || '' };
  } catch (err) {
    console.error('uploadEmployeePhoto error:', err);
    return { success: false, message: 'Network error during photo upload' };
  }
}

// ─── leave history ────────────────────────────────────────────────

export interface LeaveRecord {
  id: string;
  employeeName: string;
  email: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  mode: string;
  halfDayPeriod: string;
  entries: string;
  totalDays: number;
  paymentStatus: string;
  reason: string;
  docId: string;
  docUrl: string;
  status: string;
  submittedAt: string;
  rejectionReason: string;
  approvalHistory: { id: string; leaveId: string; approverEmail: string; approverName: string; action: string; reason: string; timestamp: string }[];
}

export async function getLeaveHistory(
  email: string
): Promise<{ success: boolean; records: LeaveRecord[]; message: string }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: false, records: [], message: 'No script URL configured' };
  try {
    const res = await fetch(
      `${scriptUrl}?action=getLeaveHistory&email=${encodeURIComponent(email)}`,
      { method: 'GET', redirect: 'follow' }
    );
    const json = await res.json();
    if (json.success) {
      return { success: true, records: json.records || [], message: json.message || 'OK' };
    }
    return { success: false, records: [], message: json.message || 'Failed to fetch history' };
  } catch (err) {
    console.error('getLeaveHistory error:', err);
    return { success: false, records: [], message: 'Unable to fetch leave history' };
  }
}

export async function getLeaveById(leaveId: string): Promise<import('../types').LeaveApplication | null> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return null;
  try {
    const res = await fetch(`${scriptUrl}?action=getLeaveById&leaveId=${encodeURIComponent(leaveId)}`, { method: 'GET', redirect: 'follow' });
    const json = await res.json();
    return json.success ? json.record : null;
  } catch { return null; }
}

export async function getTimeCorrectionById(tcId: string): Promise<import('../types').TimeCorrectionFiling | null> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return null;
  try {
    const res = await fetch(`${scriptUrl}?action=getTimeCorrectionById&tcId=${encodeURIComponent(tcId)}`, { method: 'GET', redirect: 'follow' });
    const json = await res.json();
    return json.success ? json.record : null;
  } catch { return null; }
}

// ─── fetch image as base64 from Google Drive ──────────────────────

const imageCache = new Map<string, string>();

export async function fetchImageBase64(imageId: string): Promise<string | null> {
  if (!imageId) return null;

  if (imageCache.has(imageId)) return imageCache.get(imageId)!;

  try {
    const cached = localStorage.getItem(`img_${imageId}`);
    if (cached) {
      imageCache.set(imageId, cached);
      return cached;
    }
  } catch { /* ignore */ }

  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return null;

  try {
    const res = await fetch(
      `${scriptUrl}?action=getImage&id=${encodeURIComponent(imageId)}`,
      { method: 'GET', redirect: 'follow' }
    );
    const json = await res.json();

    if (json.success && json.base64) {
      imageCache.set(imageId, json.base64);
      try {
        localStorage.setItem(`img_${imageId}`, json.base64);
      } catch { /* storage full */ }
      return json.base64;
    }
    return null;
  } catch {
    return null;
  }
}

// ─── fetch leave document as base64 from Google Drive ───────────────

const docCache = new Map<string, string>();

export async function fetchDocumentBase64(docId: string): Promise<{ base64: string | null; fileName?: string; viewUrl?: string }> {
  if (!docId) return { base64: null };

  if (docCache.has(docId)) return { base64: docCache.get(docId)! };

  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { base64: null };

  try {
    const res = await fetch(
      `${scriptUrl}?action=getDocument&id=${encodeURIComponent(docId)}`,
      { method: 'GET', redirect: 'follow' }
    );
    const json = await res.json();
    if (json.success && json.base64) {
      docCache.set(docId, json.base64);
      return { base64: json.base64, fileName: json.fileName, viewUrl: json.viewUrl };
    }
    return { base64: null };
  } catch {
    return { base64: null };
  }
}

// ─── local storage helpers ─────────────────────────────────────────

function saveToLocalStorage(record: Omit<AttendanceRecord, 'id'>): void {
  try {
    const records = getLocalRecords();
    const newRecord: AttendanceRecord = {
      ...record,
      id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };
    records.unshift(newRecord);
    const trimmed = records.slice(0, 200);
    localStorage.setItem('dtr_records', JSON.stringify(trimmed));
  } catch {
    try {
      const records = getLocalRecords();
      const newRecord: AttendanceRecord = {
        ...record,
        photo: '',
        id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      };
      records.unshift(newRecord);
      const trimmed = records.slice(0, 200);
      localStorage.setItem('dtr_records', JSON.stringify(trimmed));
    } catch { /* completely full */ }
  }
}

function updateLocalRecordField(
  timestamp: string,
  field: 'imageId' | 'imageUrl',
  value: string
): void {
  try {
    const records = getLocalRecords();
    const idx = records.findIndex((r) => r.timestamp === timestamp);
    if (idx !== -1) {
      records[idx][field] = value;
      localStorage.setItem('dtr_records', JSON.stringify(records));
    }
  } catch { /* ignore */ }
}

export function getLocalRecords(): AttendanceRecord[] {
  try {
    const data = localStorage.getItem('dtr_records');
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function getLastAction(userEmail: string): Promise<AttendanceRecord | null> {
  const scriptUrl = getScriptUrl();
  
  // Try server first
  if (scriptUrl) {
    try {
      const res = await fetch(
        `${scriptUrl}?action=getLastAction&email=${encodeURIComponent(userEmail)}`,
        { method: 'GET', redirect: 'follow' }
      );
      const json = await res.json();
      if (json.success && json.lastAction) {
        return json.lastAction;
      }
    } catch (err) {
      console.log('Server fetch failed, falling back to local:', err);
    }
  }
  
  // Fallback to local records
  const records = getLocalRecords();
  const userRecords = records.filter((r) => r.userEmail === userEmail);
  return userRecords.length > 0 ? userRecords[0] : null;
}

export async function getAttendanceHistory(userEmail: string): Promise<AttendanceRecord[]> {
  const scriptUrl = getScriptUrl();
  if (scriptUrl) {
    try {
      const res = await fetch(
        `${scriptUrl}?action=getHistory&email=${encodeURIComponent(userEmail)}`,
        { method: 'GET', redirect: 'follow' }
      );
      const json = await res.json();
      if (json.success && json.records && json.records.length > 0) {
        return json.records as AttendanceRecord[];
      }
    } catch (err) {
      console.log('getAttendanceHistory server fetch failed, falling back to local:', err);
    }
  }
  return getLocalRecords().filter((r) => r.userEmail === userEmail);
}

export async function getTodayRecords(userEmail: string): Promise<AttendanceRecord[]> {
  const scriptUrl = getScriptUrl();
  
  // Try server first
  if (scriptUrl) {
    try {
      const res = await fetch(
        `${scriptUrl}?action=getHistory&email=${encodeURIComponent(userEmail)}`,
        { method: 'GET', redirect: 'follow' }
      );
      const json = await res.json();
      if (json.success && json.records) {
        const today = new Date().toLocaleDateString('en-US');
        return json.records.filter((r: AttendanceRecord) => r.date === today);
      }
    } catch (err) {
      console.log('Server fetch failed, falling back to local:', err);
    }
  }
  
  // Fallback to local records
  const records = getLocalRecords();
  const today = new Date().toLocaleDateString('en-US');
  return records.filter((r) => r.userEmail === userEmail && r.date === today);
}

// ─── Attendance Monitor ──────────────────────────────────────────

export interface AttendanceMonitorRecord {
  email: string;
  name: string;
  department: string;
  designation: string;
  image: string;
  status: 'Active' | 'Completed' | 'On Leave' | 'Absent';
  timeIn?: string;
  timeInDate?: string;
  timeInTimestamp?: string;
  timeInLatitude?: number;
  timeInLongitude?: number;
  timeInAddress?: string;
  timeOut?: string;
  timeOutDate?: string;
  timeOutTimestamp?: string;
  timeOutLatitude?: number;
  timeOutLongitude?: number;
  timeOutAddress?: string;
  imageUrl?: string;
}

export async function getAttendanceMonitor(
  adminEmail: string
): Promise<{ success: boolean; date: string; records: AttendanceMonitorRecord[]; message: string }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: false, date: '', records: [], message: 'No script URL configured' };
  try {
    const res = await fetch(
      `${scriptUrl}?action=getAttendanceMonitor&email=${encodeURIComponent(adminEmail)}`,
      { method: 'GET', redirect: 'follow' }
    );
    const json = await res.json();
    if (json.success) return { success: true, date: json.date || '', records: json.records || [], message: '' };
    return { success: false, date: '', records: [], message: json.message || 'Failed to load monitor data' };
  } catch (err) {
    console.error('getAttendanceMonitor error:', err);
    return { success: false, date: '', records: [], message: 'Unable to fetch attendance monitor' };
  }
}

// ─── Approver Settings ───────────────────────────────────────────


export async function getApproverSettings(email: string): Promise<ApproverSettings | null> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return null;
  try {
    const res = await fetch(`${scriptUrl}?action=getApproverSettings&email=${encodeURIComponent(email)}`, { method: 'GET', redirect: 'follow' });
    const json = await res.json();
    return json.success ? json.settings : null;
  } catch { return null; }
}

export async function getAllApproverSettings(adminEmail: string): Promise<ApproverSettings[]> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return [];
  try {
    const res = await fetch(`${scriptUrl}?action=getAllApproverSettings&email=${encodeURIComponent(adminEmail)}`, { method: 'GET', redirect: 'follow' });
    const json = await res.json();
    return json.success ? (json.settings || []) : [];
  } catch { return []; }
}

export async function saveApproverSettings(settings: ApproverSettings): Promise<{ success: boolean; message: string }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: false, message: 'No script URL configured' };
  try {
    const res = await fetch(scriptUrl, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'saveApproverSettings', data: settings }),
    });
    return await res.json();
  } catch (err) {
    return { success: false, message: String(err) };
  }
}

// ─── Leave Approval Actions ───────────────────────────────────────

export async function getPendingApprovals(approverEmail: string): Promise<LeaveApplication[]> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return [];
  try {
    const res = await fetch(`${scriptUrl}?action=getPendingApprovals&email=${encodeURIComponent(approverEmail)}`, { method: 'GET', redirect: 'follow' });
    const json = await res.json();
    return json.success ? (json.records || []) : [];
  } catch { return []; }
}

export async function acknowledgeLeave(leaveId: string, approverEmail: string): Promise<{ success: boolean; message: string }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: false, message: 'No script URL configured' };
  try {
    const res = await fetch(scriptUrl, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'acknowledgeLeave', leaveId, email: approverEmail }),
    });
    return await res.json();
  } catch (err) { return { success: false, message: String(err) }; }
}

export async function approveLeave(leaveId: string, approverEmail: string): Promise<{ success: boolean; message: string }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: false, message: 'No script URL configured' };
  try {
    const res = await fetch(scriptUrl, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'approveLeave', leaveId, email: approverEmail }),
    });
    return await res.json();
  } catch (err) { return { success: false, message: String(err) }; }
}

export async function rejectLeave(leaveId: string, approverEmail: string, reason: string): Promise<{ success: boolean; message: string }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: false, message: 'No script URL configured' };
  try {
    const res = await fetch(scriptUrl, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'rejectLeave', leaveId, email: approverEmail, reason }),
    });
    return await res.json();
  } catch (err) { return { success: false, message: String(err) }; }
}

// ─── Notifications ────────────────────────────────────────────────

export async function getNotifications(email: string): Promise<AppNotification[]> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return [];
  try {
    const res = await fetch(`${scriptUrl}?action=getNotifications&email=${encodeURIComponent(email)}`, { method: 'GET', redirect: 'follow' });
    const json = await res.json();
    return json.success ? (json.notifications || []) : [];
  } catch { return []; }
}

export async function getUnreadCount(email: string): Promise<number> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return 0;
  try {
    const res = await fetch(`${scriptUrl}?action=getUnreadCount&email=${encodeURIComponent(email)}`, { method: 'GET', redirect: 'follow' });
    const json = await res.json();
    return json.success ? (json.count || 0) : 0;
  } catch { return 0; }
}

export async function markNotificationsRead(email: string, notificationId?: string): Promise<void> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return;
  try {
    await fetch(scriptUrl, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'markNotificationsRead', email, notificationId: notificationId || null }),
    });
  } catch { /* silent */ }
}

// ─── Time Correction Filing ────────────────────────────────────────

export async function submitTimeCorrection(
  data: Omit<import('../types').TimeCorrectionFiling, 'id' | 'submittedAt' | 'status' | 'approvalHistory'>,
  documentData?: string
): Promise<{ success: boolean; message: string; id?: string; docId?: string; docUrl?: string }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: false, message: 'No script URL configured' };
  try {
    const res = await fetch(scriptUrl, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'submitTimeCorrection', data, documentData: documentData || null }),
    });
    return await res.json();
  } catch (err) { return { success: false, message: String(err) }; }
}

export async function getTimeCorrectionHistory(
  email: string
): Promise<{ success: boolean; records: import('../types').TimeCorrectionFiling[]; message: string }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: false, records: [], message: 'No script URL configured' };
  try {
    const res = await fetch(
      `${scriptUrl}?action=getTimeCorrectionHistory&email=${encodeURIComponent(email)}`,
      { method: 'GET', redirect: 'follow' }
    );
    const json = await res.json();
    if (json.success) return { success: true, records: json.records || [], message: '' };
    return { success: false, records: [], message: json.message || 'Failed' };
  } catch (err) {
    return { success: false, records: [], message: String(err) };
  }
}

export async function getPendingTimeCorrectionApprovals(
  approverEmail: string
): Promise<{ success: boolean; records: import('../types').TimeCorrectionFiling[] }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: false, records: [] };
  try {
    const res = await fetch(
      `${scriptUrl}?action=getPendingTimeCorrectionApprovals&email=${encodeURIComponent(approverEmail)}`,
      { method: 'GET', redirect: 'follow' }
    );
    const json = await res.json();
    return { success: json.success, records: json.records || [] };
  } catch { return { success: false, records: [] }; }
}

export async function acknowledgeTimeCorrection(
  id: string, approverEmail: string
): Promise<{ success: boolean; message: string }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: false, message: 'No script URL configured' };
  try {
    const res = await fetch(scriptUrl, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'acknowledgeTimeCorrection', id, email: approverEmail }),
    });
    return await res.json();
  } catch (err) { return { success: false, message: String(err) }; }
}

export async function approveTimeCorrection(
  id: string, approverEmail: string
): Promise<{ success: boolean; message: string }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: false, message: 'No script URL configured' };
  try {
    const res = await fetch(scriptUrl, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'approveTimeCorrection', id, email: approverEmail }),
    });
    return await res.json();
  } catch (err) { return { success: false, message: String(err) }; }
}

export async function rejectTimeCorrection(
  id: string, approverEmail: string, reason: string
): Promise<{ success: boolean; message: string }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: false, message: 'No script URL configured' };
  try {
    const res = await fetch(scriptUrl, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'rejectTimeCorrection', id, email: approverEmail, reason }),
    });
    return await res.json();
  } catch (err) { return { success: false, message: String(err) }; }
}

export async function cancelTimeCorrection(
  id: string, email: string
): Promise<{ success: boolean; message: string }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: false, message: 'No script URL configured' };
  try {
    const res = await fetch(scriptUrl, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'cancelTimeCorrection', id, email }),
    });
    return await res.json();
  } catch (err) { return { success: false, message: String(err) }; }
}

// ─── DTR Management ──────────────────────────────────────────────

export async function generateDTR(params: {
  adminEmail: string; employeeEmail: string; employeeName?: string;
  month: number; year: number; cutOff: '1st' | '2nd';
}): Promise<{ success: boolean; message: string; dtrId?: string; alreadyExists?: boolean }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: false, message: 'No script URL configured' };
  try {
    const res = await fetch(scriptUrl, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'generateDTR', ...params }),
    });
    return await res.json();
  } catch (err) { return { success: false, message: String(err) }; }
}

export async function regenerateDTR(
  dtrId: string, adminEmail: string
): Promise<{ success: boolean; message: string; dtrId?: string }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: false, message: 'No script URL configured' };
  try {
    const res = await fetch(scriptUrl, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'regenerateDTR', dtrId, email: adminEmail }),
    });
    return await res.json();
  } catch (err) { return { success: false, message: String(err) }; }
}

export async function getDTRList(
  adminEmail: string
): Promise<{ success: boolean; records: DTRRecord[] }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: false, records: [] };
  try {
    const params = new URLSearchParams({ action: 'getDTRList', email: adminEmail });
    const res = await fetch(`${scriptUrl}?${params.toString()}`, { method: 'GET', redirect: 'follow' });
    const json = await res.json();
    return { success: json.success, records: json.records || [] };
  } catch { return { success: false, records: [] }; }
}

export async function getEmployeeDTRList(
  employeeEmail: string
): Promise<{ success: boolean; records: DTRRecord[] }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: false, records: [] };
  try {
    const params = new URLSearchParams({ action: 'getEmployeeDTRList', email: employeeEmail });
    const res = await fetch(`${scriptUrl}?${params.toString()}`, { method: 'GET', redirect: 'follow' });
    const json = await res.json();
    return { success: json.success, records: json.records || [] };
  } catch { return { success: false, records: [] }; }
}

export async function getDTRById(
  dtrId: string, requesterEmail: string
): Promise<{ success: boolean; record?: DTRRecord; message?: string }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: false, message: 'No script URL configured' };
  try {
    const res = await fetch(
      `${scriptUrl}?action=getDTRById&dtrId=${encodeURIComponent(dtrId)}&email=${encodeURIComponent(requesterEmail)}`,
      { method: 'GET', redirect: 'follow' }
    );
    return await res.json();
  } catch (err) { return { success: false, message: String(err) }; }
}

export async function acknowledgeDTR(
  dtrId: string, employeeEmail: string
): Promise<{ success: boolean; message: string; acknowledgedAt?: string; acknowledgedBy?: string; acknowledgedRole?: string }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: false, message: 'No script URL configured' };
  try {
    const res = await fetch(scriptUrl, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'acknowledgeDTR', dtrId, email: employeeEmail }),
    });
    return await res.json();
  } catch (err) { return { success: false, message: String(err) }; }
}

export async function reportDTRIssue(params: {
  dtrId: string; employeeEmail: string; issueType: DTRIssueType; comments: string;
}): Promise<{ success: boolean; message: string }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: false, message: 'No script URL configured' };
  try {
    const res = await fetch(scriptUrl, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'reportDTRIssue', ...params }),
    });
    return await res.json();
  } catch (err) { return { success: false, message: String(err) }; }
}

export async function resolveDTRIssue(
  issueId: string, adminEmail: string
): Promise<{ success: boolean; message: string }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: false, message: 'No script URL configured' };
  try {
    const res = await fetch(scriptUrl, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'resolveDTRIssue', issueId, email: adminEmail }),
    });
    return await res.json();
  } catch (err) { return { success: false, message: String(err) }; }
}

// ── Generated DTR Workflow API ───────────────────────────────────────────

export async function generateNewDTR(params: {
  adminEmail: string; employeeEmail: string; month: number; year: number; cutOff: string;
}): Promise<{ success: boolean; message: string; dtrId?: string }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: false, message: 'No script URL configured' };
  try {
    const res = await fetch(scriptUrl, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'generateNewDTR', data: params }),
    });
    return await res.json();
  } catch (err) { return { success: false, message: String(err) }; }
}

export async function getGeneratedDTR(
  dtrId: string, userEmail: string
): Promise<{ success: boolean; data?: import('../types').GeneratedDTR; message?: string }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: false, message: 'No script URL configured' };
  try {
    const params = new URLSearchParams({ action: 'getGeneratedDTR', dtrId, email: userEmail });
    const res = await fetch(`${scriptUrl}?${params.toString()}`, { method: 'GET', redirect: 'follow' });
    return await res.json();
  } catch (err) { return { success: false, message: String(err) }; }
}

export async function getGeneratedDTRList(
  userEmail: string
): Promise<{ success: boolean; records?: import('../types').GeneratedDTR[]; message?: string }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: false, message: 'No script URL configured' };
  try {
    const params = new URLSearchParams({ action: 'getGeneratedDTRList', email: userEmail });
    const res = await fetch(`${scriptUrl}?${params.toString()}`, { method: 'GET', redirect: 'follow' });
    return await res.json();
  } catch (err) { return { success: false, message: String(err) }; }
}

export async function updateDTRDay(params: {
  dtrId: string; date: string; userEmail: string;
  field: string; value: string; remarks?: string;
}): Promise<{ success: boolean; message: string; day?: import('../types').GeneratedDTRDay }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: false, message: 'No script URL configured' };
  try {
    const res = await fetch(scriptUrl, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'updateDTRDay', data: params }),
    });
    return await res.json();
  } catch (err) { return { success: false, message: String(err) }; }
}

export async function sendDTRForReview(
  dtrId: string, adminEmail: string
): Promise<{ success: boolean; message: string }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: false, message: 'No script URL configured' };
  try {
    const res = await fetch(scriptUrl, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'sendDTRForReview', dtrId, email: adminEmail }),
    });
    return await res.json();
  } catch (err) { return { success: false, message: String(err) }; }
}

export async function acknowledgeDTRNew(
  dtrId: string, employeeEmail: string
): Promise<{ success: boolean; message: string }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: false, message: 'No script URL configured' };
  try {
    const res = await fetch(scriptUrl, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'acknowledgeDTRNew', dtrId, email: employeeEmail }),
    });
    return await res.json();
  } catch (err) { return { success: false, message: String(err) }; }
}

export async function reopenDTR(
  dtrId: string, adminEmail: string, reason: string
): Promise<{ success: boolean; message: string }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: false, message: 'No script URL configured' };
  try {
    const res = await fetch(scriptUrl, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'reopenDTR', dtrId, email: adminEmail, reason }),
    });
    return await res.json();
  } catch (err) { return { success: false, message: String(err) }; }
}

// ── Overtime Filing API ───────────────────────────────────────────────────

export async function submitOT(
  params: Omit<import('../types').OTRequest, 'id' | 'status' | 'auditTrail' | 'createdAt'> & { isDraft?: boolean }
): Promise<{ success: boolean; message: string; otId?: string }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: false, message: 'No script URL configured' };
  try {
    const res = await fetch(scriptUrl, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'submitOT', data: params }),
    });
    return await res.json();
  } catch (err) { return { success: false, message: String(err) }; }
}

export async function updateOTDraft(
  params: { otId: string; email: string; submit?: boolean; remarks?: string;
    otDate?: string; otType?: string; preShiftStart?: string; preShiftEnd?: string;
    postShiftStart?: string; postShiftEnd?: string; reason?: string;
    attachmentUrl?: string; attachmentId?: string; }
): Promise<{ success: boolean; message: string }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: false, message: 'No script URL configured' };
  try {
    const res = await fetch(scriptUrl, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'updateOTDraft', data: params }),
    });
    return await res.json();
  } catch (err) { return { success: false, message: String(err) }; }
}

export async function approveOT(
  otId: string, email: string, approvedHours?: number
): Promise<{ success: boolean; message: string }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: false, message: 'No script URL configured' };
  try {
    const res = await fetch(scriptUrl, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'approveOT', otId, email, approvedHours }),
    });
    return await res.json();
  } catch (err) { return { success: false, message: String(err) }; }
}

export async function returnOT(
  otId: string, email: string, remarks: string
): Promise<{ success: boolean; message: string }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: false, message: 'No script URL configured' };
  try {
    const res = await fetch(scriptUrl, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'returnOT', otId, email, remarks }),
    });
    return await res.json();
  } catch (err) { return { success: false, message: String(err) }; }
}

export async function rejectOT(
  otId: string, email: string, reason: string
): Promise<{ success: boolean; message: string }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: false, message: 'No script URL configured' };
  try {
    const res = await fetch(scriptUrl, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'rejectOT', otId, email, reason }),
    });
    return await res.json();
  } catch (err) { return { success: false, message: String(err) }; }
}

export async function cancelOT(
  otId: string, email: string
): Promise<{ success: boolean; message: string }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: false, message: 'No script URL configured' };
  try {
    const res = await fetch(scriptUrl, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'cancelOT', otId, email }),
    });
    return await res.json();
  } catch (err) { return { success: false, message: String(err) }; }
}

export async function getOTList(
  email: string
): Promise<{ success: boolean; records?: import('../types').OTRequest[]; message?: string }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: false, message: 'No script URL configured' };
  try {
    const params = new URLSearchParams({ action: 'getOTList', email });
    const res = await fetch(`${scriptUrl}?${params.toString()}`, { method: 'GET', redirect: 'follow' });
    return await res.json();
  } catch (err) { return { success: false, message: String(err) }; }
}

export async function getOTById(
  otId: string, email: string
): Promise<{ success: boolean; data?: import('../types').OTRequest; message?: string }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: false, message: 'No script URL configured' };
  try {
    const params = new URLSearchParams({ action: 'getOTById', otId, email });
    const res = await fetch(`${scriptUrl}?${params.toString()}`, { method: 'GET', redirect: 'follow' });
    return await res.json();
  } catch (err) { return { success: false, message: String(err) }; }
}

export async function getMealAllowanceStatus(
  email: string
): Promise<{ success: boolean; attendanceId: string | null; timeInTimestamp: string | null; hoursWorked: number; submissions: import('../types').MealAllowanceRecord[]; config: import('../types').MealAllowanceConfig }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: false, attendanceId: null, timeInTimestamp: null, hoursWorked: 0, submissions: [], config: { enabled: true, secondEnabled: true, minHours1: 0, minHours2: 8, maxCount: 2 } };
  try {
    const res = await fetch(`${scriptUrl}?action=getMealAllowanceStatus&email=${encodeURIComponent(email)}`, { method: 'GET', redirect: 'follow' });
    return await res.json();
  } catch { return { success: false, attendanceId: null, timeInTimestamp: null, hoursWorked: 0, submissions: [], config: { enabled: true, secondEnabled: true, minHours1: 0, minHours2: 8, maxCount: 2 } }; }
}

export async function submitMealAllowance(data: {
  userEmail: string; userName: string; photo: string;
  latitude: number; longitude: number; accuracy: number;
  address: string; deviceInfo: string; remarks?: string;
}): Promise<{ success: boolean; message: string; id?: string; sequence?: number; imageId?: string; imageUrl?: string }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: false, message: 'No script URL configured' };
  try {
    const res = await fetch(scriptUrl, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'submitMealAllowance', folderId: getFolderId(), data }),
    });
    return await res.json();
  } catch (err) { return { success: false, message: String(err) }; }
}

export async function saveMealAllowanceSettings(
  data: import('../types').MealAllowanceConfig, adminEmail: string
): Promise<{ success: boolean; message: string; config?: import('../types').MealAllowanceConfig }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: false, message: 'No script URL configured' };
  try {
    const res = await fetch(scriptUrl, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'saveMealAllowanceSettings', email: adminEmail, data }),
    });
    return await res.json();
  } catch (err) { return { success: false, message: String(err) }; }
}

// ─── WFH Frontend API Wrappers ────────────────────────────────────

export async function getWFHStatus(email: string): Promise<import('../types').WFHStatusResult & { success: boolean }> {
  const scriptUrl = getScriptUrl();
  const fallback = { success: false, attendanceId: null, timeInTimestamp: null, wfhRecord: null, eodRequired: false, canTimeOut: true };
  if (!scriptUrl) return fallback;
  try {
    const res = await fetch(`${scriptUrl}?action=getWFHStatus&email=${encodeURIComponent(email)}`, { method: 'GET', redirect: 'follow' });
    return await res.json();
  } catch { return fallback; }
}

export async function submitWFH(data: {
  email: string; name: string; department: string; designation: string;
  attendanceId: string; attendanceDate: string; timeIn: string;
  workDescription: string; plannedTasks: string; expectedDeliverables: string;
  additionalNotes?: string; remarks?: string;
}): Promise<{ success: boolean; message: string; id?: string }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: false, message: 'No script URL configured' };
  try {
    const res = await fetch(scriptUrl, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'submitWFH', data }),
    });
    return await res.json();
  } catch (err) { return { success: false, message: String(err) }; }
}

export async function submitWFHEOD(data: {
  wfhId: string; email: string;
  eodSummary: string; eodAccomplishments: string; eodIssues: string;
  eodDeliverables: string; eodNextDayPlan?: string; eodRemarks?: string;
  attachments: Array<{ fileName: string; fileData: string; mimeType: string }>;
}): Promise<{ success: boolean; message: string; attachments?: import('../types').WFHAttachment[] }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: false, message: 'No script URL configured' };
  try {
    const res = await fetch(scriptUrl, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'submitWFHEOD', folderId: getFolderId(), data }),
    });
    return await res.json();
  } catch (err) { return { success: false, message: String(err) }; }
}

export async function resubmitWFHEOD(data: {
  wfhId: string; email: string;
  eodSummary: string; eodAccomplishments: string; eodIssues: string;
  eodDeliverables: string; eodNextDayPlan?: string; eodRemarks?: string;
  attachments: Array<{ fileName: string; fileData: string; mimeType: string }>;
}): Promise<{ success: boolean; message: string; attachments?: import('../types').WFHAttachment[] }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: false, message: 'No script URL configured' };
  try {
    const res = await fetch(scriptUrl, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'resubmitWFHEOD', folderId: getFolderId(), data }),
    });
    return await res.json();
  } catch (err) { return { success: false, message: String(err) }; }
}

export async function resubmitWFH(data: {
  wfhId: string; email: string;
  workDescription?: string; plannedTasks?: string; expectedDeliverables?: string;
  eodSummary?: string; eodAccomplishments?: string; eodIssues?: string;
  eodDeliverables?: string; eodNextDayPlan?: string; eodRemarks?: string; remarks?: string;
  attachments?: Array<{ fileName: string; fileData: string; mimeType: string }>;
}): Promise<{ success: boolean; message: string }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: false, message: 'No script URL configured' };
  try {
    const res = await fetch(scriptUrl, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'resubmitWFH', folderId: getFolderId(), data }),
    });
    return await res.json();
  } catch (err) { return { success: false, message: String(err) }; }
}

export async function getWFHHistory(email: string): Promise<{ success: boolean; records: import('../types').WFHRecord[] }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: true, records: [] };
  try {
    const res = await fetch(`${scriptUrl}?action=getWFHHistory&email=${encodeURIComponent(email)}`, { method: 'GET', redirect: 'follow' });
    return await res.json();
  } catch { return { success: true, records: [] }; }
}

export async function getPendingWFHApprovals(approverEmail: string): Promise<{ success: boolean; records: import('../types').WFHRecord[] }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: true, records: [] };
  try {
    const res = await fetch(`${scriptUrl}?action=getPendingWFHApprovals&email=${encodeURIComponent(approverEmail)}`, { method: 'GET', redirect: 'follow' });
    return await res.json();
  } catch { return { success: true, records: [] }; }
}

export async function approveWFH(wfhId: string, approverEmail: string, comments?: string): Promise<{ success: boolean; message: string }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: false, message: 'No script URL configured' };
  try {
    const res = await fetch(scriptUrl, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'approveWFH', id: wfhId, email: approverEmail, comments: comments || '' }),
    });
    return await res.json();
  } catch (err) { return { success: false, message: String(err) }; }
}

export async function rejectWFH(wfhId: string, approverEmail: string, reason: string): Promise<{ success: boolean; message: string }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: false, message: 'No script URL configured' };
  try {
    const res = await fetch(scriptUrl, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'rejectWFH', id: wfhId, email: approverEmail, reason }),
    });
    return await res.json();
  } catch (err) { return { success: false, message: String(err) }; }
}

export async function requestWFHRevision(wfhId: string, approverEmail: string, comments: string): Promise<{ success: boolean; message: string }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: false, message: 'No script URL configured' };
  try {
    const res = await fetch(scriptUrl, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'requestWFHRevision', id: wfhId, email: approverEmail, comments }),
    });
    return await res.json();
  } catch (err) { return { success: false, message: String(err) }; }
}

// ─── Google Apps Script template (v4.0 – Employee validation) ─────

export const APPS_SCRIPT_TEMPLATE = `
// ================================================================
//  Smart DTR System – Google Apps Script Backend  v4.0
//  ✅ Employee validation from Employee sheet
//  ✅ Attendance logging to Google Sheets
//  ✅ Photo upload to Google Drive (base64)
//  ✅ Photo retrieval as base64 (getImage endpoint)
//  ✅ Settings management
// ================================================================
//
//  REQUIRED SHEETS:
//  1. "Employee" - columns: Employee Name, Email, Hourly Wage, Role,
//                          Image, DEPARTMENT, DESIGNATION
//  2. "Attendance" - auto-created
//  3. "Settings" - auto-created
//
//  SETUP:
//  1. Paste this code in Apps Script editor
//  2. Deploy → New deployment → Web app
//     Execute as: Me  |  Who has access: Anyone
//  3. Authorize when prompted (Sheets + Drive)
//  4. Copy the URL into the DTR app Settings
//
// ================================================================

var ADMIN_EMAIL       = 'rommeljvr@gmail.com';
var DEFAULT_FOLDER_ID = '10Qvt5AZuPe7NPuOTWBJ_q6d_0SmdKYbX';
var DEFAULT_APP_TITLE = 'Smart DTR System';
var DEFAULT_ORG       = 'MIlMetro';

// ══════════════════════════════════════════════════════════════════
//  SETTINGS
// ══════════════════════════════════════════════════════════════════

function getSetting(key) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Settings');
  if (!sheet) return null;
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === key) return String(data[i][1]).trim();
  }
  return null;
}

function initSettingsSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Settings');
  if (!sheet) {
    sheet = ss.insertSheet('Settings');
    sheet.appendRow(['Key', 'Value']);
    sheet.appendRow(['FOLDER_ID', DEFAULT_FOLDER_ID]);
    sheet.appendRow(['APP_TITLE', DEFAULT_APP_TITLE]);
    sheet.appendRow(['ORGANIZATION', DEFAULT_ORG]);
    var hdr = sheet.getRange(1, 1, 1, 2);
    hdr.setFontWeight('bold').setBackground('#1e40af').setFontColor('#ffffff');
    sheet.setColumnWidth(1, 160);
    sheet.setColumnWidth(2, 400);
  }
  return sheet;
}

// ══════════════════════════════════════════════════════════════════
//  HTTP HANDLERS
// ══════════════════════════════════════════════════════════════════

function doPost(e) {
  // Handle CORS preflight request
  if (e.parameter.cors) {
    return ContentService
      .createTextOutput('')
      .setMimeType(ContentService.MimeType.TEXT)
      .setHeader('Access-Control-Allow-Origin', '*')
      .setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      .setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }

  try {
    var body = e.postData.contents;
    var data = JSON.parse(body);

    if (data.action === 'submitAttendance') return submitAttendance(data.data, data.folderId);
    if (data.action === 'validateEmployee') return validateEmployee(data.email);
    if (data.action === 'getLastAction')    return getLastAction(data.email);
    if (data.action === 'getHistory')       return getHistory(data.email);
    if (data.action === 'getSettings')      return (data.email && data.email.toLowerCase() === ADMIN_EMAIL) ? getSettings() : _json({ success: false, message: 'Unauthorized' });
    if (data.action === 'submitLeave')      return submitLeave(data.data);
    if (data.action === 'cancelLeave')      return cancelLeave(data.id, data.email);
    if (data.action === 'createEmployee')   return createEmployee(data);
    if (data.action === 'updateEmployee')   return updateEmployee(data);
    if (data.action === 'deactivateEmployee')   return deactivateEmployee(data.email, data.active);
    if (data.action === 'uploadEmployeePhoto')  return uploadEmployeePhoto(data);
    if (data.action === 'saveApproverSettings') return saveApproverSettings(data.data);
    if (data.action === 'acknowledgeLeave')     return acknowledgeLeave(data.leaveId, data.email);
    if (data.action === 'approveLeave')         return approveLeave(data.leaveId, data.email);
    if (data.action === 'rejectLeave')          return rejectLeave(data.leaveId, data.email, data.reason);
    if (data.action === 'markNotificationsRead') return markNotificationsRead(data.email, data.notificationId);
    if (data.action === 'submitTimeCorrection')      return submitTimeCorrection(data.data, data.documentData);
    if (data.action === 'acknowledgeTimeCorrection') return acknowledgeTimeCorrection(data.id, data.email);
    if (data.action === 'approveTimeCorrection')     return approveTimeCorrection(data.id, data.email);
    if (data.action === 'rejectTimeCorrection')      return rejectTimeCorrection(data.id, data.email, data.reason);
    if (data.action === 'cancelTimeCorrection')    return cancelTimeCorrection(data.id, data.email);
    if (data.action === 'generateDTR')       return generateDTR(data);
    if (data.action === 'regenerateDTR')     return regenerateDTR(data.dtrId, data.email);
    if (data.action === 'acknowledgeDTR')    return acknowledgeDTR(data.dtrId, data.email);
    if (data.action === 'reportDTRIssue')    return reportDTRIssue(data);
    if (data.action === 'resolveDTRIssue')   return resolveDTRIssue(data.issueId, data.email);
    if (data.action === 'submitMealAllowance')       return submitMealAllowance(data.data, data.folderId);
    if (data.action === 'saveMealAllowanceSettings') return saveMealAllowanceSettings(data.data, data.email);
    if (data.action === 'submitWFH')          return submitWFH(data.data);
    if (data.action === 'submitWFHEOD')       return submitWFHEOD(data.data, data.folderId);
    if (data.action === 'resubmitWFHEOD')     return resubmitWFHEOD(data.data, data.folderId);
    if (data.action === 'resubmitWFH')        return resubmitWFH(data.data, data.folderId);
    if (data.action === 'approveWFH')         return approveWFH(data.id, data.email, data.comments);
    if (data.action === 'rejectWFH')          return rejectWFH(data.id, data.email, data.reason);
    if (data.action === 'requestWFHRevision') return requestWFHRevision(data.id, data.email, data.comments);
    if (data.action === 'validateDTRDay')    return validateDTRDay(data.data);
    if (data.action === 'generateNewDTR')   return generateNewDTR(data.data);
    if (data.action === 'updateDTRDay')     return updateDTRDayField(data.data);
    if (data.action === 'sendDTRForReview') return sendDTRForReview(data.dtrId, data.email);
    if (data.action === 'acknowledgeDTRNew') return acknowledgeDTRNew(data.dtrId, data.email);
    if (data.action === 'reopenDTR')        return reopenDTRRecord(data.dtrId, data.email, data.reason);
    if (data.action === 'submitOT')         return submitOTRequest(data.data);
    if (data.action === 'updateOTDraft')    return updateOTDraft(data.data);
    if (data.action === 'approveOT')        return approveOTRequest(data.otId, data.email, data.approvedHours);
    if (data.action === 'returnOT')         return returnOTRequest(data.otId, data.email, data.remarks);
    if (data.action === 'rejectOT')         return rejectOTRequest(data.otId, data.email, data.reason);
    if (data.action === 'cancelOT')         return cancelOTRequest(data.otId, data.email);

    return _json({ success: false, message: 'Unknown action' });
  } catch (err) {
    return _json({ success: false, message: 'doPost error: ' + err.toString() });
  }
}

function doGet(e) {
  var p      = e.parameter || {};
  var action = p.action || '';
  var email  = p.email  || '';
  var id     = p.id     || '';

  // Handle CORS preflight request
  if (e.parameter.cors) {
    return ContentService
      .createTextOutput('')
      .setMimeType(ContentService.MimeType.TEXT)
      .setHeader('Access-Control-Allow-Origin', '*')
      .setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      .setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }

  if (action === 'validateEmployee') return validateEmployee(email);
  if (action === 'getImage')         return getImage(id);
  if (action === 'getLastAction')    return getLastAction(email);
  if (action === 'getHistory')       return getHistory(email);
  if (action === 'getSettings')      return (email && email.toLowerCase() === ADMIN_EMAIL) ? getSettings() : _json({ success: false, message: 'Unauthorized' });
  if (action === 'getLeaveCredits')  return getLeaveCredits(email);
  if (action === 'getDocument')      return getDocument(id);
  if (action === 'getLeaveHistory')  return getLeaveHistory(email);
  if (action === 'getEmployees')     return getEmployeeList();
  if (action === 'getDepartments')   return getDepartmentList();
  if (action === 'getDesignations')  return getDesignationList();
  if (action === 'getAttendanceMonitor') return email ? getAttendanceMonitor() : _json({ success: false, message: 'Email required' });
  if (action === 'getApproverSettings')  return getApproverSettings(email);
  if (action === 'getAllApproverSettings') return (email && email.toLowerCase() === ADMIN_EMAIL) ? getAllApproverSettings() : _json({ success: false, message: 'Unauthorized' });
  if (action === 'getPendingApprovals')  return email ? getPendingApprovals(email) : _json({ success: false, message: 'Email required' });
  if (action === 'getLeaveById')         return p.leaveId ? getLeaveById(p.leaveId) : _json({ success: false, message: 'leaveId required' });
  if (action === 'getTimeCorrectionById') return p.tcId ? getTimeCorrectionById(p.tcId) : _json({ success: false, message: 'tcId required' });
  if (action === 'getNotifications')     return email ? getNotifications(email) : _json({ success: false, message: 'Email required' });
  if (action === 'getUnreadCount')       return email ? getUnreadCount(email) : _json({ success: false, message: 'Email required' });
  if (action === 'getTimeCorrectionHistory')          return email ? getTimeCorrectionHistory(email) : _json({ success: false, message: 'Email required' });
  if (action === 'getPendingTimeCorrectionApprovals') return email ? getPendingTimeCorrectionApprovals(email) : _json({ success: false, message: 'Email required' });
  if (action === 'getMealAllowanceStatus')   return email ? getMealAllowanceStatus(email) : _json({ success: false, message: 'Email required' });
  if (action === 'getMealAllowanceConfig')   return _json({ success: true, config: getMealAllowanceConfig() });
  if (action === 'getWFHStatus')             return email ? getWFHStatus(email) : _json({ success: false, message: 'Email required' });
  if (action === 'getWFHHistory')            return email ? getWFHHistory(email) : _json({ success: false, message: 'Email required' });
  if (action === 'getPendingWFHApprovals')   return email ? getPendingWFHApprovals(email) : _json({ success: false, message: 'Email required' });
  if (action === 'getDTRList')        return email ? getDTRList(email) : _json({ success: false, message: 'Email required' });
  if (action === 'getEmployeeDTRList') return email ? getEmployeeDTRList(email) : _json({ success: false, message: 'Email required' });
  if (action === 'getDTRById')        return p.dtrId ? getDTRById(p.dtrId, email) : _json({ success: false, message: 'dtrId required' });
  if (action === 'getDTRValidationData') return p.dtrId ? getDTRValidationData(p.dtrId, email) : _json({ success: false, message: 'dtrId required' });
  if (action === 'getGeneratedDTR')      return p.dtrId ? getGeneratedDTRById(p.dtrId, email) : _json({ success: false, message: 'dtrId required' });
  if (action === 'getGeneratedDTRList')  return email ? getGeneratedDTRListGAS(email) : _json({ success: false, message: 'Email required' });
  if (action === 'getEmployeesForDTR') return (email && email.toLowerCase() === ADMIN_EMAIL) ? getEmployeeList() : _json({ success: false, message: 'Unauthorized' });
  if (action === 'getOTList')          return email ? getOTListGAS(email) : _json({ success: false, message: 'Email required' });
  if (action === 'getOTById')          return p.otId ? getOTByIdGAS(p.otId, email) : _json({ success: false, message: 'otId required' });
  if (action === 'test')             return _json({ success: true, message: 'Smart DTR System API v4.0 ✓' });

  return _json({ success: true, message: 'Smart DTR System API ready' });
}

// ══════════════════════════════════════════════════════════════════
//  EMPLOYEE VALIDATION
//  Checks if email exists in the "Employee" sheet
//  Returns employee details if found
// ══════════════════════════════════════════════════════════════════

function validateEmployee(email) {
  if (!email) {
    return _json({ success: false, valid: false, message: 'Email is required' });
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Employee');

  if (!sheet) {
    return _json({
      success: false,
      valid: false,
      message: 'Employee sheet not found. Please create an "Employee" sheet.'
    });
  }

  var rows = sheet.getDataRange().getValues();
  var headers = rows[0];
  var emailLower = String(email).trim().toLowerCase();

  // Find column indices (flexible column positions)
  var colName   = findColumnIndex(headers, ['Employee Name', 'Name', 'Full Name']);
  var colEmail  = findColumnIndex(headers, ['Email', 'Email Address']);
  var colWage   = findColumnIndex(headers, ['Hourly Wage', 'Wage', 'Rate']);
  var colRole   = findColumnIndex(headers, ['Role', 'Access Role', 'User Role']);
  var colImage  = findColumnIndex(headers, ['Image', 'Photo', 'Picture']);
  var colDept   = findColumnIndex(headers, ['DEPARTMENT', 'Department', 'Dept']);
  var colDesig  = findColumnIndex(headers, ['DESIGNATION', 'Designation', 'Position', 'Title']);

  if (colEmail === -1) {
    return _json({
      success: false,
      valid: false,
      message: 'Email column not found in Employee sheet'
    });
  }

  // Search for the employee
  for (var i = 1; i < rows.length; i++) {
    var rowEmail = String(rows[i][colEmail] || '').trim().toLowerCase();
    if (rowEmail === emailLower) {
      var employee = {
        name:        colName  !== -1 ? String(rows[i][colName]  || '').trim() : '',
        email:       rowEmail,
        hourlyWage:  colWage  !== -1 ? Number(rows[i][colWage]) || 0 : 0,
        role:        colRole  !== -1 ? String(rows[i][colRole]  || '').trim() : 'Level 1',
        image:       colImage !== -1 ? String(rows[i][colImage] || '').trim() : '',
        department:  colDept  !== -1 ? String(rows[i][colDept]  || '').trim() : '',
        designation: colDesig !== -1 ? String(rows[i][colDesig] || '').trim() : ''
      };

      return _json({
        success: true,
        valid: true,
        employee: employee,
        message: 'Welcome, ' + employee.name + '!'
      });
    }
  }

  return _json({
    success: true,
    valid: false,
    message: 'Email not found. You are not registered as an employee.'
  });
}

function findColumnIndex(headers, possibleNames) {
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i]).trim().toLowerCase();
    for (var j = 0; j < possibleNames.length; j++) {
      if (h === possibleNames[j].toLowerCase()) return i;
    }
  }
  return -1;
}

// ══════════════════════════════════════════════════════════════════
//  SUBMIT ATTENDANCE + DRIVE UPLOAD
// ══════════════════════════════════════════════════════════════════

function submitAttendance(data, clientFolderId) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Attendance');

  if (!sheet) {
    sheet = ss.insertSheet('Attendance');
    sheet.appendRow([
      'ID', 'User ID', 'User Name', 'Email', 'Action',
      'Timestamp', 'Date', 'Time', 'Latitude', 'Longitude',
      'Accuracy (m)', 'Address', 'Device Info',
      'Department', 'Designation', 'Image ID', 'Image URL'
    ]);
    var hdr = sheet.getRange(1, 1, 1, 17);
    hdr.setFontWeight('bold').setBackground('#1e40af').setFontColor('#ffffff');
    hdr.setHorizontalAlignment('center');
    sheet.setFrozenRows(1);
  }

  var folderId = clientFolderId || getSetting('FOLDER_ID') || DEFAULT_FOLDER_ID;

  // Upload image to Google Drive
  var imageUrl = '';
  var imageId  = '';
  try {
    if (data.photo && String(data.photo).indexOf('base64,') > -1) {
      var uploadResult = uploadImageToDrive(data, folderId);
      imageUrl = uploadResult.url;
      imageId  = uploadResult.id;
    }
  } catch (err) {
    Logger.log('Drive upload error: ' + err.toString());
    imageUrl = 'UPLOAD_ERROR: ' + err.toString().substring(0, 100);
  }

  var id = Utilities.getUuid();
  sheet.appendRow([
    id,
    data.userId     || '',
    data.userName   || '',
    data.userEmail  || '',
    data.action     || '',
    data.timestamp  || new Date().toISOString(),
    data.date       || '',
    data.time       || '',
    data.latitude   || '',
    data.longitude  || '',
    data.accuracy   || '',
    data.address    || '',
    data.deviceInfo || '',
    data.department || '',
    data.designation|| '',
    imageId,
    imageUrl
  ]);

  var lastRow = sheet.getLastRow();
  if (imageUrl && imageUrl.indexOf('http') === 0) {
    sheet.getRange(lastRow, 17).setFormula('=HYPERLINK("' + imageUrl + '","📷 View")');
  }

  // Fix missing Image ID
  if (!imageId || String(imageId).trim() === '') {
    recoverAttendanceImageByRow(lastRow);
  }

  try { sheet.autoResizeColumns(1, 17); } catch (ex) {}
  initSettingsSheet();

  // Update WFH Time Out when clocking out
  if (data.action === 'TIME_OUT') {
    try {
      var wfhSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('WorkFromHome');
      if (wfhSheet && wfhSheet.getLastRow() > 1) {
        var wfhData = wfhSheet.getDataRange().getValues();
        // Scan WFH rows for matching email + empty timeOut (most recent open record)
        var emailLow = String(data.userEmail || '').trim().toLowerCase();
        for (var wj = 1; wj < wfhData.length; wj++) {
          var wfhEmail = String(wfhData[wj][2] || '').trim().toLowerCase();
          var wfhTimeOut = String(wfhData[wj][8] || '').trim();
          if (wfhEmail === emailLow && !wfhTimeOut) {
            wfhSheet.getRange(wj + 1, 9).setValue(data.time || '');
            wfhSheet.getRange(wj + 1, 30).setValue(data.timestamp || new Date().toISOString());
            break;
          }
        }
      }
    } catch(wfhErr) { Logger.log('WFH time-out update error: ' + wfhErr); }
  }

  return _json({
    success: true,
    message: 'Attendance recorded & photo uploaded',
    id: id,
    imageId: imageId,
    imageUrl: imageUrl
  });
}

// ══════════════════════════════════════════════════════════════════
//  GOOGLE DRIVE – UPLOAD & GET
// ══════════════════════════════════════════════════════════════════

function uploadImageToDrive(data, folderId) {
  var parts  = String(data.photo).split('base64,');
  var base64 = parts[1];
  if (!base64 || base64.length < 100) throw new Error('Invalid base64 data');

  var decoded = Utilities.base64Decode(base64);
  var blob    = Utilities.newBlob(decoded, 'image/jpeg', formatFileName(data));

  var folder;
  try { folder = DriveApp.getFolderById(folderId); }
  catch (e) {
    Logger.log('Folder not found → root. ' + e);
    folder = DriveApp.getRootFolder();
  }

  var monthKey  = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
  var subName   = 'DTR_' + monthKey;
  var subIter   = folder.getFoldersByName(subName);
  var subFolder = subIter.hasNext() ? subIter.next() : folder.createFolder(subName);

  var file = subFolder.createFile(blob);

  return {
    id:  file.getId(),
    url: 'https://drive.google.com/file/d/' + file.getId() + '/view'
  };
}

function formatFileName(data) {
  var ts     = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');
  var name   = (data.userName || 'user').replace(/[^a-zA-Z0-9]/g, '_');
  var action = data.action || 'LOG';
  return 'DTR_' + name + '_' + action + '_' + ts + '.jpg';
}

function getImage(fileId) {
  if (!fileId) return _json({ success: false, message: 'Missing file ID' });

  try {
    var file  = DriveApp.getFileById(fileId);
    var blob  = file.getBlob();
    var bytes = blob.getBytes();
    var b64   = Utilities.base64Encode(bytes);
    var mime  = blob.getContentType() || 'image/jpeg';

    return _json({
      success:  true,
      base64:   'data:' + mime + ';base64,' + b64,
      fileName: file.getName(),
      fileSize: bytes.length
    });
  } catch (err) {
    return _json({ success: false, message: 'getImage error: ' + err.toString() });
  }
}

// ══════════════════════════════════════════════════════════════════
//  READ HELPERS
// ══════════════════════════════════════════════════════════════════

function getLastAction(email) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Attendance');

  if (!sheet || sheet.getLastRow() <= 1) {
    return _json({ success: true, lastAction: null });
  }

  var rows = sheet.getDataRange().getValues();

  for (var i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][3]).trim().toLowerCase() === String(email).trim().toLowerCase()) {

      var timestamp = rows[i][5];
      var dateObj = new Date(timestamp);

      var fmtDate = Utilities.formatDate(dateObj, 'Asia/Manila', 'M/d/yyyy');
      var fmtTime = Utilities.formatDate(dateObj, 'Asia/Manila', 'hh:mm:ss a');

      return _json({
        success: true,
        lastAction: {
          id:          rows[i][0],
          action:      rows[i][4],
          timestamp:   timestamp,
          date:        fmtDate,
          time:        fmtTime,
          department:  rows[i][13] || '',
          designation: rows[i][14] || '',
          imageId:     rows[i][15] || '',
          imageUrl:    rows[i][16] || ''
        }
      });
    }
  }

  return _json({ success: true, lastAction: null });
  }

function getHistory(email) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Attendance');
  if (!sheet || sheet.getLastRow() <= 1) return _json({ success: true, records: [] });

  var rows    = sheet.getDataRange().getValues();
  var records = [];
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][3]).trim().toLowerCase() === String(email).trim().toLowerCase()) {
      var rDate = rows[i][6];
      var rTime = rows[i][7];
      var dStr = rDate instanceof Date
        ? Utilities.formatDate(rDate, 'Asia/Manila', 'M/d/yyyy')
        : String(rDate || '');
      var tStr = formatTimeValue(rTime);
      
      records.push({
        id:          rows[i][0],
        action:      rows[i][4],
        timestamp:   rows[i][5],
        date:        dStr,
        time:        tStr,
        latitude:    rows[i][8],
        longitude:   rows[i][9],
        address:     rows[i][11],
        department:  rows[i][13] || '',
        designation: rows[i][14] || '',
        imageId:     rows[i][15] || '',
        imageUrl:    rows[i][16] || ''
      });
    }
  }
  return _json({ success: true, records: records.reverse() });
}



function getSettings() {
  initSettingsSheet();
  return _json({
    success: true,
    settings: {
      FOLDER_ID:    getSetting('FOLDER_ID')    || DEFAULT_FOLDER_ID,
      APP_TITLE:    getSetting('APP_TITLE')    || DEFAULT_APP_TITLE,
      ORGANIZATION: getSetting('ORGANIZATION') || DEFAULT_ORG
    }
  });
}

// ── JSON helper ─────────────────────────────────────────────────

function _json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function checkDriveAuthorization() {
  try {
    // Try to access Drive - this will throw if not authorized
    var rootFolder = DriveApp.getRootFolder();
    var testFile = rootFolder.createFile('test_auth.txt', 'Drive API test', MimeType.PLAIN_TEXT);
    testFile.setTrashed(true);
 
    return _json({
      success: true,
      authorized: true,
      message: 'Drive API is properly authorized',
      canUpload: true
    });
  } catch (err) {
    return _json({
      success: false,
      authorized: false,
      message: 'Drive API NOT authorized. Please re-deploy with proper permissions.',
      error: err.toString(),
      instructions: '1. Go to Deploy → Manage deployments. 2. Delete current deployment. 3. Deploy → New deployment → Web app. 4. Execute as: Me, Who has access: Anyone. 5. Click "Review permissions" → "Advanced" → "Go to (unsafe)" → "Allow"'
    });
  }
}

// ════════════════════════════════════════════════════════════════
//  ATTENDANCE IMAGE COLUMN REPAIR TOOL (MANUAL RUN)
// ════════════════════════════════════════════════════════════════

function repairAttendanceImageColumns() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Attendance');

  if (!sheet) return;

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();

  var updated = 0;
  var failedUploads = 0;

  for (var i = 0; i < data.length; i++) {

    var row = data[i];
    var sheetRow = i + 2;

    var imageId  = row[15];
    var imageUrl = row[16];

    // --------------------------------------------------
    // CASE 1: Upload error detected
    // --------------------------------------------------
    if (imageUrl && String(imageUrl).indexOf('UPLOAD_ERROR') === 0) {
      sheet.getRange(sheetRow, 17).setValue('FAILED_UPLOAD');
      failedUploads++;
      continue;
    }

    var extractedId = null;

    // --------------------------------------------------
    // CASE 2: Try extract Drive ID from URL
    // --------------------------------------------------
    if (imageUrl && typeof imageUrl === 'string' && imageUrl.indexOf('http') === 0) {
      var match = imageUrl.match(/\/d\/([a-zA-Z0-9_-]+)/) ||
                  imageUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);

      if (match) extractedId = match[1];
    }

    // --------------------------------------------------
    // CASE 3: Fix missing Image ID
    // --------------------------------------------------
    if (!imageId && extractedId) {
      sheet.getRange(sheetRow, 16).setValue(extractedId);
      imageId = extractedId;
      updated++;
    }

    // --------------------------------------------------
    // CASE 4: Rebuild valid URL
    // --------------------------------------------------
    if (imageId && (!imageUrl || imageUrl.indexOf('http') !== 0)) {
      var newUrl = 'https://drive.google.com/file/d/' + imageId + '/view';

      sheet.getRange(sheetRow, 17).setValue(newUrl);
      updated++;
    }

    // --------------------------------------------------
    // CASE 5: Ensure hyperlink formatting
    // --------------------------------------------------
    if (imageUrl && imageUrl.indexOf('http') === 0) {
      sheet.getRange(sheetRow, 17)
        .setFormula('=HYPERLINK("' + imageUrl + '","📷 View")');
    }
  }

  Logger.log("Updated: " + updated);
  Logger.log("Failed uploads: " + failedUploads);

  return _json({
    success: true,
    updatedRows: updated,
    failedUploads: failedUploads,
    message: "Repair completed (including upload errors)"
  });
}

function recoverAttendanceImagesFromDrive() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Attendance');
  if (!sheet) return;

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  var folderId = getSetting('FOLDER_ID') || DEFAULT_FOLDER_ID;
  var folder = DriveApp.getFolderById(folderId);

  var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();

  var updated = 0;

  // Collect all Drive files once (performance optimized)
  var files = [];
  var subFolders = folder.getFolders();

  while (subFolders.hasNext()) {
    var sub = subFolders.next();
    var f = sub.getFiles();

    while (f.hasNext()) {
      files.push(f.next());
    }
  }

  for (var i = 0; i < data.length; i++) {

    var row = data[i];
    var sheetRow = i + 2;

    var userName = row[2];
    var action   = row[4];

    var imageId  = row[15];
    var imageUrl = row[16];

    // ✔ ONLY PROCESS IF Image ID IS EMPTY
    if (imageId && String(imageId).trim() !== '') continue;

    if (!userName || !action) continue;

    var cleanName = String(userName).replace(/[^a-zA-Z0-9]/g, '_');

    for (var j = 0; j < files.length; j++) {

      var file = files[j];
      var fileName = file.getName();

      if (fileName.indexOf(cleanName) > -1 && fileName.indexOf(action) > -1) {

        var id = file.getId();
        var url = 'https://drive.google.com/file/d/' + id + '/view';

        sheet.getRange(sheetRow, 16).setValue(id);
        sheet.getRange(sheetRow, 17).setValue(url);

        updated++;
        break;
      }
    }
  }

  return _json({
    success: true,
    message: "Full recovery completed (Image ID only missing rows)",
    updatedRows: updated
  });
}

function recoverAttendanceImageByRow(rowNumber) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Attendance');
  if (!sheet) return;

  if (!rowNumber || rowNumber < 2) {
    return _json({
      success: false,
      message: "Invalid row number. Must be 2 or higher."
    });
  }

  var row = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];

  var userName = row[2];
  var action   = row[4];

  var imageId  = row[15];
  var imageUrl = row[16];

  if (imageId && String(imageId).trim() !== '') {
    return _json({
      success: true,
      message: "Row already has Image ID",
      row: rowNumber
    });
  }

  if (!userName || !action) {
    return _json({
      success: false,
      message: "Missing userName or action in row",
      row: rowNumber
    });
  }

  var folderId = getSetting('FOLDER_ID') || DEFAULT_FOLDER_ID;
  var folder = DriveApp.getFolderById(folderId);

  var files = [];
  var subFolders = folder.getFolders();

  while (subFolders.hasNext()) {
    var sub = subFolders.next();
    var f = sub.getFiles();
    while (f.hasNext()) {
      files.push(f.next());
    }
  }

  var cleanName = String(userName).replace(/[^a-zA-Z0-9]/g, '_');

  for (var i = 0; i < files.length; i++) {

    var file = files[i];
    var fileName = file.getName();

    if (fileName.indexOf(cleanName) > -1 && fileName.indexOf(action) > -1) {

      var id = file.getId();
      var url = 'https://drive.google.com/file/d/' + id + '/view';

      sheet.getRange(rowNumber, 16).setValue(id);
      sheet.getRange(rowNumber, 17).setValue(url);

      return _json({
        success: true,
        message: "Row repaired successfully",
        row: rowNumber,
        imageId: id,
        imageUrl: url
      });
    }
  }

  return _json({
    success: false,
    message: "No matching file found in Drive",
    row: rowNumber
  });
}

// ══════════════════════════════════════════════════════════════════
//  LEAVE CREDITS
//  Reads from "LeaveCredits" sheet — columns:
//  Employee Name | Email | Vacation Leave | Sick Leave | Birthday Leave
// ══════════════════════════════════════════════════════════════════

function getLeaveCredits(email) {
  if (!email) return _json({ success: false, message: 'Email is required' });

  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('LeaveCredits');

  if (!sheet) {
    sheet = ss.insertSheet('LeaveCredits');
    sheet.appendRow(['Employee Name', 'Email', 'Vacation Leave', 'Sick Leave', 'Birthday Leave']);
    var hdr = sheet.getRange(1, 1, 1, 5);
    hdr.setFontWeight('bold').setBackground('#1e40af').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    return _json({ success: false, message: 'LeaveCredits sheet created. Please populate it.' });
  }

  var rows = sheet.getDataRange().getValues();
  var headers = rows[0];
  var emailLower = String(email).trim().toLowerCase();

  var colEmail   = findColumnIndex(headers, ['Email', 'Email Address']);
  var colVacation = findColumnIndex(headers, ['Vacation Leave', 'VL', 'Vacation']);
  var colSick     = findColumnIndex(headers, ['Sick Leave', 'SL', 'Sick']);
  var colBirthday = findColumnIndex(headers, ['Birthday Leave', 'BL', 'Birthday']);

  if (colEmail === -1) return _json({ success: false, message: 'Email column not found in LeaveCredits sheet' });

  for (var i = 1; i < rows.length; i++) {
    var rowEmail = String(rows[i][colEmail] || '').trim().toLowerCase();
    if (rowEmail === emailLower) {
      return _json({
        success: true,
        credits: {
          vacationLeave: colVacation !== -1 ? Number(rows[i][colVacation]) || 0 : 0,
          sickLeave:     colSick     !== -1 ? Number(rows[i][colSick])     || 0 : 0,
          birthdayLeave: colBirthday !== -1 ? Number(rows[i][colBirthday]) || 0 : 0
        }
      });
    }
  }

  // Auto-insert a default credits row for new employees
  sheet.appendRow([email, email, 0, 0, 0]);
  return _json({
    success: true,
    credits: { vacationLeave: 0, sickLeave: 0, birthdayLeave: 0 },
    message: 'New employee — default credits (0) created'
  });
}

// ══════════════════════════════════════════════════════════════════
//  SUBMIT LEAVE APPLICATION
// ══════════════════════════════════════════════════════════════════

function submitLeave(data) {
  // Server-side validation
  if (!data)                 return _json({ success: false, message: 'No data received' });
  if (!data.email)           return _json({ success: false, message: 'Email is required' });
  if (!data.leaveType)       return _json({ success: false, message: 'Leave type is required' });
  if (!data.startDate)       return _json({ success: false, message: 'Start date is required' });
  if (!data.endDate)         return _json({ success: false, message: 'End date is required' });
  if (!data.reason || !String(data.reason).trim()) return _json({ success: false, message: 'Reason is required' });
  if (!data.totalDays || data.totalDays <= 0)      return _json({ success: false, message: 'Total days must be greater than 0' });

  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('LeaveApplications');

  if (!sheet) {
    sheet = ss.insertSheet('LeaveApplications');
    sheet.appendRow([
      'ID', 'Employee Name', 'Email', 'Leave Type', 'Start Date', 'End Date',
      'Mode', 'Half Day Period', 'Entries (JSON)', 'Total Days',
      'Payment Status', 'Reason', 'Document ID', 'Document URL', 'Status', 'Submitted At'
    ]);
    var hdr = sheet.getRange(1, 1, 1, 16);
    hdr.setFontWeight('bold').setBackground('#1e40af').setFontColor('#ffffff');
    hdr.setHorizontalAlignment('center');
    sheet.setFrozenRows(1);
  }

  // Upload supporting document to Drive (same pattern as attendance photo)
  var docUrl = '';
  var docId  = '';
  try {
    if (data.documentData && String(data.documentData).indexOf('base64,') > -1) {
      var docResult = uploadDocumentToDrive(data);
      docUrl = docResult.url;
      docId  = docResult.id;
    }
  } catch (err) {
    Logger.log('Leave doc upload error: ' + err.toString());
    docUrl = 'UPLOAD_ERROR: ' + err.toString().substring(0, 100);
  }

  var id = Utilities.getUuid();
  var now = new Date().toISOString();

  sheet.appendRow([
    id,
    data.employeeName   || '',
    data.email          || '',
    data.leaveType      || '',
    data.startDate      || '',
    data.endDate        || '',
    data.mode           || '',
    data.halfDayPeriod  || '',
    JSON.stringify(data.entries || []),
    data.totalDays      || 0,
    data.paymentStatus  || 'Unpaid',
    data.reason         || '',
    docId,
    docUrl,
    'Pending',
    now
  ]);

  var lastRow = sheet.getLastRow();
  if (docUrl && docUrl.indexOf('http') === 0) {
    sheet.getRange(lastRow, 14).setFormula('=HYPERLINK("' + docUrl + '","📄 View")');
  }

  // Fix missing Document ID
  if (!docId || String(docId).trim() === '') {
    recoverLeaveDocumentByRow(lastRow);
  }
  // Deduct leave credits for Paid leaves
  if (data.paymentStatus === 'Paid' && data.leaveType !== 'Emergency Leave') {
    deductLeaveCredit(data.email, data.leaveType, data.totalDays);
    logCreditTransaction(data.email, data.employeeName || '', data.leaveType, data.totalDays, 'Deduct', id,
      Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss"));
  }

  try { sheet.autoResizeColumns(1, 16); } catch (ex) {}

  // ── Notifications ──────────────────────────────────────────────
  try {
    var empName = data.employeeName || data.email;
    // Confirm to the employee
    createNotification(data.email, 'LEAVE_FILED',
      'Your leave application (' + data.leaveType + ', ' + data.startDate + ' – ' + data.endDate + ') has been submitted and is pending approval.', id);

    // Notify the first approver based on workflow
    var settings = null;
    try {
      var apResult = getApproverSettings(data.email);
      var apJson = JSON.parse(apResult.getContent());
      if (apJson.success && apJson.settings) settings = apJson.settings;
    } catch (ae) { Logger.log('submitLeave: getApproverSettings error: ' + ae); }

    if (settings) {
      var firstApprover = (settings.workflowType === 'TWO_STEP' && settings.teamLeadEmail)
        ? settings.teamLeadEmail : settings.approverEmail;
      if (firstApprover) {
        createNotification(firstApprover, 'PENDING_APPROVAL',
          empName + ' has filed a leave request (' + data.leaveType + ', ' + data.startDate + ' – ' + data.endDate + ') awaiting your action.', id);
      }
    }
  } catch (ne) { Logger.log('submitLeave: notification error: ' + ne); }

  return _json({
    success: true,
    message: 'Leave application submitted successfully',
    id: id,
    docId: docId,
    docUrl: docUrl
  });
}

// ══════════════════════════════════════════════════════════════════
//  CANCEL LEAVE APPLICATION
//  Sets status to Cancelled; only allowed if current status is Pending
//  and the requesting email matches the application email
// ══════════════════════════════════════════════════════════════════

function cancelLeave(id, email) {
  if (!id)    return _json({ success: false, message: 'Leave ID is required' });
  if (!email) return _json({ success: false, message: 'Email is required' });

  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('LeaveApplications');
  if (!sheet) return _json({ success: false, message: 'LeaveApplications sheet not found' });

  var rows    = sheet.getDataRange().getValues();
  var headers = rows[0];

  function col(name) {
    for (var c = 0; c < headers.length; c++) {
      if (String(headers[c]).trim().toLowerCase() === name.toLowerCase()) return c;
    }
    return -1;
  }

  var cId            = col('ID');
  var cEmail         = col('Email');
  var cStatus        = col('Status');
  var cLeaveType     = col('Leave Type');
  var cPayment       = col('Payment Status');
  var cTotalDays     = col('Total Days');
  var cEmployeeName  = col('Employee Name');

  if (cId === -1 || cEmail === -1 || cStatus === -1) {
    return _json({ success: false, message: 'Required columns not found in LeaveApplications sheet' });
  }

  for (var i = 1; i < rows.length; i++) {
    var rowId    = String(rows[i][cId]    || '').trim();
    var rowEmail = String(rows[i][cEmail] || '').trim().toLowerCase();
    var rowStatus = String(rows[i][cStatus] || '').trim();

    if (rowId !== String(id).trim()) continue;

    // Ownership check
    if (rowEmail !== String(email).trim().toLowerCase()) {
      return _json({ success: false, message: 'Unauthorized: this application does not belong to you' });
    }

    // Idempotency: only Pending can be cancelled (prevents duplicate credit restoration)
    if (rowStatus !== 'Pending') {
      return _json({ success: false, message: 'Only Pending applications can be cancelled. Current status: ' + rowStatus });
    }

    var leaveType     = cLeaveType    !== -1 ? String(rows[i][cLeaveType]    || '').trim() : '';
    var paymentStatus = cPayment      !== -1 ? String(rows[i][cPayment]      || '').trim() : '';
    var totalDays     = cTotalDays    !== -1 ? Number(rows[i][cTotalDays])   || 0 : 0;
    var employeeName  = cEmployeeName !== -1 ? String(rows[i][cEmployeeName] || '').trim() : '';

    var cancelledAt = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
    var sheetRow = i + 1;

    // 1. Update status to Cancelled
    sheet.getRange(sheetRow, cStatus + 1).setValue('Cancelled');

    // 2. Record cancellation timestamp
    var cCancelledAt = col('Cancelled At');
    if (cCancelledAt !== -1) {
      sheet.getRange(sheetRow, cCancelledAt + 1).setValue(cancelledAt);
    } else {
      var cReason = col('Reason');
      if (cReason !== -1) {
        var existingReason = String(sheet.getRange(sheetRow, cReason + 1).getValue() || '');
        sheet.getRange(sheetRow, cReason + 1).setValue(existingReason + ' [Cancelled: ' + cancelledAt + ']');
      }
    }

    // 3. Restore leave credits for Paid, non-Emergency credit-bearing leave types
    var creditTypes = { 'Vacation Leave': true, 'Sick Leave': true, 'Birthday Leave': true };
    var creditsRestored = false;
    if (paymentStatus === 'Paid' && creditTypes[leaveType] && totalDays > 0) {
      restoreLeaveCredit(rowEmail, leaveType, totalDays);
      logCreditTransaction(rowEmail, employeeName, leaveType, totalDays, 'Restore', id, cancelledAt);
      creditsRestored = true;
    }

    return _json({
      success: true,
      message: 'Leave application cancelled successfully' + (creditsRestored ? '. Leave credits restored.' : ''),
      id: id,
      cancelledAt: cancelledAt,
      creditsRestored: creditsRestored,
      restoredDays: creditsRestored ? totalDays : 0
    });
  }

  return _json({ success: false, message: 'Leave application not found with ID: ' + id });
}

function restoreLeaveCredit(email, leaveType, days) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('LeaveCredits');
  if (!sheet) return;

  var colMap = {
    'Vacation Leave': 'Vacation Leave',
    'Sick Leave':     'Sick Leave',
    'Birthday Leave': 'Birthday Leave'
  };

  var creditCol = colMap[leaveType];
  if (!creditCol) return;

  var rows    = sheet.getDataRange().getValues();
  var headers = rows[0];
  var colEmail  = findColumnIndex(headers, ['Email', 'Email Address']);
  var colCredit = findColumnIndex(headers, [creditCol]);
  if (colEmail === -1 || colCredit === -1) return;

  var emailLower = String(email).trim().toLowerCase();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][colEmail] || '').trim().toLowerCase() === emailLower) {
      var current = Number(rows[i][colCredit]) || 0;
      sheet.getRange(i + 1, colCredit + 1).setValue(current + days);
      return;
    }
  }
}

function logCreditTransaction(email, employeeName, leaveType, days, txType, leaveId, timestamp) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('LeaveCreditTransactions');

  if (!sheet) {
    sheet = ss.insertSheet('LeaveCreditTransactions');
    sheet.appendRow(['Timestamp', 'Employee Name', 'Email', 'Leave Type', 'Transaction Type', 'Days', 'Leave ID']);
    var hdr = sheet.getRange(1, 1, 1, 7);
    hdr.setFontWeight('bold').setBackground('#1e40af').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }

  sheet.appendRow([timestamp, employeeName, email, leaveType, txType, days, leaveId]);
}

// ══════════════════════════════════════════════════════════════════
//  EMPLOYEE MAINTENANCE CRUD
// ══════════════════════════════════════════════════════════════════

function getEmployeeSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Employee');
  if (!sheet) {
    sheet = ss.insertSheet('Employee');
    sheet.appendRow(['Email', 'Employee Name', 'Hourly Wage', 'Role', 'Image', 'Department', 'Designation', 'ACTIVE']);
    var hdr = sheet.getRange(1, 1, 1, 8);
    hdr.setFontWeight('bold').setBackground('#1e40af').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function rowToEmployee(row) {
  return {
    email:       String(row[0] || '').trim(),
    name:        String(row[1] || '').trim(),
    wage:        Number(row[2]) || 0,
    role:        String(row[3] || '').trim(),
    image:       String(row[4] || '').trim(),
    department:  String(row[5] || '').trim(),
    designation: String(row[6] || '').trim(),
    active:      String(row[7]).trim().toLowerCase() !== 'false'
  };
}

function getEmployeeList() {
  var sheet = getEmployeeSheet();
  var rows = sheet.getDataRange().getValues();
  var employees = [];
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0] || '').trim()) {
      employees.push(rowToEmployee(rows[i]));
    }
  }
  return _json({ success: true, employees: employees });
}

function createEmployee(data) {
  if (!data.email)         return _json({ success: false, message: 'Email is required' });
  if (!data.employee_name) return _json({ success: false, message: 'Employee name is required' });

  var sheet = getEmployeeSheet();
  var rows  = sheet.getDataRange().getValues();
  var emailLower = String(data.email).trim().toLowerCase();

  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0] || '').trim().toLowerCase() === emailLower) {
      return _json({ success: false, message: 'An employee with this email already exists' });
    }
  }

  sheet.appendRow([
    emailLower,
    String(data.employee_name || '').trim(),
    Number(data.hourly_wage)  || 0,
    String(data.role         || 'Level 1').trim(),
    String(data.image        || '').trim(),
    String(data.department   || '').trim(),
    String(data.designation  || '').trim(),
    true
  ]);

  return _json({ success: true, message: 'Employee created successfully' });
}

function updateEmployee(data) {
  if (!data.email) return _json({ success: false, message: 'Email is required' });

  var sheet     = getEmployeeSheet();
  var rows      = sheet.getDataRange().getValues();
  var emailLower = String(data.email).trim().toLowerCase();

  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0] || '').trim().toLowerCase() === emailLower) {
      sheet.getRange(i + 1, 2, 1, 6).setValues([[
        String(data.employee_name || rows[i][1]).trim(),
        Number(data.hourly_wage)  || rows[i][2] || 0,
        String(data.role         || rows[i][3] || '').trim(),
        String(data.image        || rows[i][4] || '').trim(),
        String(data.department   || rows[i][5] || '').trim(),
        String(data.designation  || rows[i][6] || '').trim()
      ]]);
      return _json({ success: true, message: 'Employee updated successfully' });
    }
  }

  return _json({ success: false, message: 'Employee not found' });
}

function deactivateEmployee(email, active) {
  if (!email) return _json({ success: false, message: 'Email is required' });

  var sheet     = getEmployeeSheet();
  var rows      = sheet.getDataRange().getValues();
  var emailLower = String(email).trim().toLowerCase();

  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0] || '').trim().toLowerCase() === emailLower) {
      sheet.getRange(i + 1, 8).setValue(active === true || active === 'true');
      return _json({ success: true, message: active ? 'Employee reactivated' : 'Employee deactivated' });
    }
  }

  return _json({ success: false, message: 'Employee not found' });
}

function getDepartmentList() {
  var sheet = getEmployeeSheet();
  var rows  = sheet.getDataRange().getValues();
  var depts = {};
  for (var i = 1; i < rows.length; i++) {
    var d = String(rows[i][5] || '').trim();
    if (d) depts[d] = true;
  }
  return _json({ success: true, departments: Object.keys(depts).sort() });
}

function getDesignationList() {
  var sheet = getEmployeeSheet();
  var rows  = sheet.getDataRange().getValues();
  var desgs = {};
  for (var i = 1; i < rows.length; i++) {
    var d = String(rows[i][6] || '').trim();
    if (d) desgs[d] = true;
  }
  return _json({ success: true, designations: Object.keys(desgs).sort() });
}

function getAttendanceMonitor() {
  var ss          = SpreadsheetApp.getActiveSpreadsheet();
  var empSheet    = ss.getSheetByName('Employee');
  var attSheet    = ss.getSheetByName('Attendance');
  var leaveSheet  = ss.getSheetByName('LeaveApplications');

  var todayDate = new Date();
  var today     = Utilities.formatDate(todayDate, Session.getScriptTimeZone(), 'M/d/yyyy');
  var todayAlt  = (todayDate.getMonth()+1) + '/' + todayDate.getDate() + '/' + todayDate.getFullYear();

  // ── Read all employees ──────────────────────────────────────────
  var employees = [];
  if (empSheet) {
    var empRows    = empSheet.getDataRange().getValues();
    var empHeaders = empRows[0];
    var cName  = findColumnIndex(empHeaders, ['Employee Name', 'Name', 'Full Name']);
    var cEmail = findColumnIndex(empHeaders, ['Email', 'Email Address']);
    var cRole  = findColumnIndex(empHeaders, ['Role', 'Access Role', 'User Role']);
    var cImg   = findColumnIndex(empHeaders, ['Image', 'Photo', 'Picture']);
    var cDept  = findColumnIndex(empHeaders, ['DEPARTMENT', 'Department', 'Dept']);
    var cDesig = findColumnIndex(empHeaders, ['DESIGNATION', 'Designation', 'Position', 'Title']);
    var cActive = findColumnIndex(empHeaders, ['Active', 'Status', 'Is Active']);
    for (var i = 1; i < empRows.length; i++) {
      var rowEmail = String(empRows[i][cEmail] || '').trim();
      if (!rowEmail) continue;
      var activeVal = cActive !== -1 ? empRows[i][cActive] : true;
      if (activeVal === false || String(activeVal).toLowerCase() === 'false' || String(activeVal).toLowerCase() === 'inactive') continue;
      employees.push({
        email:       rowEmail.toLowerCase(),
        name:        cName  !== -1 ? String(empRows[i][cName]  || '').trim() : rowEmail,
        department:  cDept  !== -1 ? String(empRows[i][cDept]  || '').trim() : '',
        designation: cDesig !== -1 ? String(empRows[i][cDesig] || '').trim() : '',
        image:       cImg   !== -1 ? String(empRows[i][cImg]   || '').trim() : ''
      });
    }
  }

  // ── Read today's approved leaves ───────────────────────────────
  var onLeaveEmails = {};
  if (leaveSheet) {
    var leaveRows    = leaveSheet.getDataRange().getValues();
    var leaveHeaders = leaveRows[0];
    var lEmail  = findColumnIndex(leaveHeaders, ['Email', 'Email Address']);
    var lStart  = findColumnIndex(leaveHeaders, ['Start Date', 'StartDate']);
    var lEnd    = findColumnIndex(leaveHeaders, ['End Date', 'EndDate']);
    var lStatus = findColumnIndex(leaveHeaders, ['Status']);
    var todayMs = new Date().setHours(0, 0, 0, 0);
    for (var li = 1; li < leaveRows.length; li++) {
      var lStat = lStatus !== -1 ? String(leaveRows[li][lStatus] || '').trim() : '';
      if (lStat !== 'Approved') continue;
      var leaveEmail = lEmail !== -1 ? String(leaveRows[li][lEmail] || '').trim().toLowerCase() : '';
      if (!leaveEmail) continue;
      var startMs = lStart !== -1 ? new Date(leaveRows[li][lStart]).setHours(0,0,0,0) : 0;
      var endMs   = lEnd   !== -1 ? new Date(leaveRows[li][lEnd]).setHours(0,0,0,0)   : 0;
      if (startMs <= todayMs && todayMs <= endMs) onLeaveEmails[leaveEmail] = true;
    }
  }

  // ── Read today's attendance rows ───────────────────────────────
  // cols: 0=id,1=userId,2=userName,3=email,4=action,5=timestamp,6=date,7=time,
  //       8=lat,9=lng,10=accuracy,11=address,12=device,13=dept,14=desig,15=imgId,16=imgUrl
  var timeIns  = {};
  var timeOuts = {};
  var lastActions = {};

  if (attSheet && attSheet.getLastRow() > 1) {
    var attRows = attSheet.getDataRange().getValues();
    for (var ai = 1; ai < attRows.length; ai++) {
      var rawDate  = attRows[ai][6];
      var attDate;
      if (rawDate instanceof Date) {
        attDate = (rawDate.getMonth()+1) + '/' + rawDate.getDate() + '/' + rawDate.getFullYear();
      } else {
        attDate = String(rawDate || '').trim();
      }
     // if (attDate !== today && attDate !== todayAlt) continue;
      /*var attEmail  = String(attRows[ai][3] || '').trim().toLowerCase();
      var attAction = String(attRows[ai][4] || '').trim();
      var rawTs     = attRows[ai][5];
      var tsMs      = rawTs instanceof Date ? rawTs.getTime() : new Date(String(rawTs || '')).getTime();
      if (isNaN(tsMs)) tsMs = 0;
      var attEntry  = {
        time:      String(attRows[ai][7]  || ''),
        timestamp: String(attRows[ai][5]  || ''),
        tsMs:      tsMs,
        latitude:  Number(attRows[ai][8]  || 0),
        longitude: Number(attRows[ai][9]  || 0),
        address:   String(attRows[ai][11] || ''),
        imageUrl:  String(attRows[ai][16] || '')
      }; */
      var attEmail  = String(attRows[ai][3] || '').trim().toLowerCase();
      var attAction = String(attRows[ai][4] || '').trim();

      var rawTs = attRows[ai][5];
      var tsMs = rawTs instanceof Date
        ? rawTs.getTime()
        : new Date(String(rawTs || '')).getTime();

      if (isNaN(tsMs)) tsMs = 0;

      var attEntry = {
        action:    attAction,
        time:      String(attRows[ai][7]  || ''),
        timestamp: String(attRows[ai][5]  || ''),
        tsMs:      tsMs,
        latitude:  Number(attRows[ai][8]  || 0),
        longitude: Number(attRows[ai][9]  || 0),
        address:   String(attRows[ai][11] || ''),
        imageUrl:  String(attRows[ai][16] || '')
      };

      // NEW: Always remember the latest attendance record,
      // even if it is from a previous day.
      if (!lastActions[attEmail] || tsMs > lastActions[attEmail].tsMs) {
        lastActions[attEmail] = attEntry;
      }

      if (attDate !== today && attDate !== todayAlt) continue;
      if (attAction === 'TIME_IN') {
        if (!timeIns[attEmail] || attEntry.tsMs > timeIns[attEmail].tsMs)
          timeIns[attEmail] = attEntry;
      } else if (attAction === 'TIME_OUT') {
        if (!timeOuts[attEmail] || attEntry.tsMs > timeOuts[attEmail].tsMs)
          timeOuts[attEmail] = attEntry;
      }
    }
  }

  // ── Build result ───────────────────────────────────────────────
  var result = employees.map(function(emp) {
    var tin  = timeIns[emp.email];
    // Only count a TIME_OUT that occurred AFTER the latest TIME_IN
    var toutRaw = timeOuts[emp.email];
    //var tout = (toutRaw && tin && toutRaw.tsMs > tin.tsMs) ? toutRaw : null;
    var tout = null;

    if (toutRaw) {
      if (!tin) {
        // TIME_OUT today that closes yesterday's TIME_IN
        tout = toutRaw;
      } else if (toutRaw.tsMs > tin.tsMs) {
        tout = toutRaw;
      }
    }
    /*var status;
    if (tin) {
      // Actual attendance overrides any leave record
      status = tout ? 'Completed' : 'Active';
    } else if (onLeaveEmails[emp.email]) {
      status = 'On Leave';
    } else {
      status = 'Absent';
    } */

    var rec = {
      email:       emp.email,
      name:        emp.name,
      department:  emp.department,
      designation: emp.designation,
      image:       emp.image,
      status:      status
    };

    var status;
    var last = lastActions[emp.email];

    if (tin) {

      // Existing logic for today's attendance
      status = tout ? 'Completed' : 'Active';

    } else if (last && last.action === 'TIME_IN') {

      // NEW: Overnight shift (last attendance is still TIME_IN)
      status = 'Active';

      rec.timeIn = last.time;
      rec.timeInTimestamp = last.timestamp;
      rec.timeInLatitude = last.latitude;
      rec.timeInLongitude = last.longitude;
      rec.timeInAddress = last.address;
      rec.imageUrl = last.imageUrl;

    } else if (onLeaveEmails[emp.email]) {

      status = 'On Leave';

    } else {

      status = 'Absent';

    }
    rec.status = status;

    if (tin) {
      rec.timeIn          = tin.time;
      rec.timeInTimestamp = tin.timestamp;
      rec.timeInLatitude  = tin.latitude;
      rec.timeInLongitude = tin.longitude;
      rec.timeInAddress   = tin.address;
      rec.imageUrl        = tin.imageUrl;
    }
    if (tout) {
      rec.timeOut          = tout.time;
      rec.timeOutTimestamp = tout.timestamp;
      rec.timeOutLatitude  = tout.latitude;
      rec.timeOutLongitude = tout.longitude;
      rec.timeOutAddress   = tout.address;
    }
    return rec;
  });

  return _json({ success: true, date: today, records: result });
}
  
function uploadEmployeePhoto(data) {
  if (!data.email) return _json({ success: false, message: 'Email is required' });
  if (!data.photo || String(data.photo).indexOf('base64,') === -1) {
    return _json({ success: false, message: 'Invalid photo data' });
  }

  try {
    var parts  = String(data.photo).split('base64,');
    var base64 = parts[1];
    var decoded = Utilities.base64Decode(base64);
    var ts      = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');
    var safeName = String(data.email).replace(/[^a-zA-Z0-9]/g, '_');
    var fileName = 'EMP_' + safeName + '_' + ts + '.jpg';
    var blob    = Utilities.newBlob(decoded, 'image/jpeg', fileName);

    var ss         = SpreadsheetApp.getActiveSpreadsheet();
    var parentId   = getSetting('FOLDER_ID') || DEFAULT_FOLDER_ID;
    var parent;
    try { parent = DriveApp.getFolderById(parentId); }
    catch (e) { parent = DriveApp.getRootFolder(); }

    var folderName = 'Employees_Images';
    var folderIter = parent.getFoldersByName(folderName);
    var folder     = folderIter.hasNext() ? folderIter.next() : parent.createFolder(folderName);

    var file = folder.createFile(blob);
    
    var url = 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w400';

    // Write URL back to the employee sheet immediately
    var empSheet  = getEmployeeSheet();
    var empRows   = empSheet.getDataRange().getValues();
    var emailLower = String(data.email).trim().toLowerCase();
    for (var i = 1; i < empRows.length; i++) {
      if (String(empRows[i][0] || '').trim().toLowerCase() === emailLower) {
        empSheet.getRange(i + 1, 5).setValue(url); // col 5 = image
        break;
      }
    }

    return _json({ success: true, url: url, id: file.getId(), message: 'Photo uploaded' });
  } catch (err) {
    Logger.log('uploadEmployeePhoto error: ' + err.toString());
    return _json({ success: false, message: 'Upload failed: ' + err.toString().substring(0, 100) });
  }
}

// ══════════════════════════════════════════════════════════════════
//  LEAVE HISTORY
//  Returns all leave applications for a given email
// ══════════════════════════════════════════════════════════════════

function getLeaveHistory(email) {
  if (!email) return _json({ success: false, message: 'Email is required' });

  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('LeaveApplications');

  if (!sheet || sheet.getLastRow() <= 1) {
    return _json({ success: true, records: [], message: 'No leave applications found' });
  }

  var rows    = sheet.getDataRange().getValues();
  var headers = rows[0];
  var emailLower = String(email).trim().toLowerCase();

  // Map header names to column indices
  function col(names) {
    for (var n = 0; n < names.length; n++) {
      for (var c = 0; c < headers.length; c++) {
        if (String(headers[c]).trim().toLowerCase() === names[n].toLowerCase()) return c;
      }
    }
    return -1;
  }

  var cId     = col(['ID']);
  var cName   = col(['Employee Name']);
  var cEmail  = col(['Email']);
  var cType   = col(['Leave Type']);
  var cStart  = col(['Start Date']);
  var cEnd    = col(['End Date']);
  var cMode   = col(['Mode']);
  var cHalf   = col(['Half Day Period']);
  var cEntry  = col(['Entries (JSON)']);
  var cDays   = col(['Total Days']);
  var cPay    = col(['Payment Status']);
  var cReason = col(['Reason']);
  var cDocId  = col(['Document ID']);
  var cDocUrl = col(['Document URL']);
  var cStatus = col(['Status']);
  var cFiled  = col(['Submitted At']);
  var cRej    = col(['Rejection Reason']);

  var records = [];

  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    var rowEmail = String(row[cEmail] || '').trim().toLowerCase();
    if (rowEmail !== emailLower) continue;

    var docUrlVal = cDocUrl !== -1 ? String(row[cDocUrl] || '') : '';
    // Strip HYPERLINK formula if present
    if (docUrlVal.indexOf('HYPERLINK') > -1) {
      var m = docUrlVal.match(/https:\/\/[^"]+/);
      docUrlVal = m ? m[0] : '';
    }

    records.push({
      id:            cId     !== -1 ? String(row[cId]     || '') : '',
      employeeName:  cName   !== -1 ? String(row[cName]   || '') : '',
      email:         cEmail  !== -1 ? String(row[cEmail]  || '') : '',
      leaveType:     cType   !== -1 ? String(row[cType]   || '') : '',
      startDate:     cStart  !== -1 ? String(row[cStart]  || '') : '',
      endDate:       cEnd    !== -1 ? String(row[cEnd]    || '') : '',
      mode:          cMode   !== -1 ? String(row[cMode]   || '') : '',
      halfDayPeriod: cHalf   !== -1 ? String(row[cHalf]  || '') : '',
      entries:       cEntry  !== -1 ? String(row[cEntry]  || '[]') : '[]',
      totalDays:     cDays   !== -1 ? Number(row[cDays]   || 0)   : 0,
      paymentStatus: cPay    !== -1 ? String(row[cPay]   || '') : '',
      reason:        cReason !== -1 ? String(row[cReason] || '') : '',
      docId:           cDocId  !== -1 ? String(row[cDocId]  || '') : '',
      docUrl:          docUrlVal,
      status:          cStatus !== -1 ? String(row[cStatus] || 'Pending') : 'Pending',
      submittedAt:     cFiled  !== -1 ? String(row[cFiled]  || '') : '',
      rejectionReason: cRej    !== -1 ? String(row[cRej]   || '') : '',
      approvalHistory: getApprovalHistoryForLeave(cId !== -1 ? String(row[cId] || '') : '')
    });
  }

  // Sort newest first
  records.sort(function(a, b) {
    return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime();
  });

  return _json({ success: true, records: records });
}

// ══════════════════════════════════════════════════════════════════
//  GET LEAVE BY ID
//  Returns a single leave application row for approver/notification view
// ══════════════════════════════════════════════════════════════════

function getLeaveById(leaveId) {
  if (!leaveId) return _json({ success: false, message: 'leaveId required' });
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('LeaveApplications');
  if (!sheet || sheet.getLastRow() <= 1) return _json({ success: false, message: 'No records' });
  var rows    = sheet.getDataRange().getValues();
  var headers = rows[0];
  function col(names) {
    for (var n = 0; n < names.length; n++)
      for (var c = 0; c < headers.length; c++)
        if (String(headers[c]).trim().toLowerCase() === names[n].toLowerCase()) return c;
    return -1;
  }
  var cId     = col(['ID']);
  var cName   = col(['Employee Name']);
  var cEmail  = col(['Email']);
  var cType   = col(['Leave Type']);
  var cStart  = col(['Start Date']);
  var cEnd    = col(['End Date']);
  var cMode   = col(['Mode']);
  var cHalf   = col(['Half Day Period']);
  var cDays   = col(['Total Days']);
  var cPay    = col(['Payment Status']);
  var cReason = col(['Reason']);
  var cDocId  = col(['Document ID']);
  var cDocUrl = col(['Document URL']);
  var cStatus = col(['Status']);
  var cFiled  = col(['Submitted At']);
  var cRej    = col(['Rejection Reason']);
  var idLower = String(leaveId).trim().toLowerCase();
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    if (String(row[cId] || '').trim().toLowerCase() !== idLower) continue;
    var docUrlVal = cDocUrl !== -1 ? String(row[cDocUrl] || '') : '';
    if (docUrlVal.indexOf('HYPERLINK') > -1) { var m = docUrlVal.match(/https:\/\/[^"]+/); docUrlVal = m ? m[0] : ''; }
    var history = getApprovalHistoryForLeave(String(row[cId] || ''));
    var settings = null;
    try {
      var empEmail = cEmail !== -1 ? String(row[cEmail] || '').trim() : '';
      var apResult = getApproverSettings(empEmail);
      var apJson = JSON.parse(apResult.getContent());
      if (apJson.success && apJson.settings) settings = apJson.settings;
    } catch(e) {}
    return _json({ success: true, record: {
      id:              String(row[cId]     || ''),
      employeeName:    cName   !== -1 ? String(row[cName]   || '') : '',
      email:           cEmail  !== -1 ? String(row[cEmail]  || '') : '',
      leaveType:       cType   !== -1 ? String(row[cType]   || '') : '',
      startDate:       cStart  !== -1 ? String(row[cStart]  || '') : '',
      endDate:         cEnd    !== -1 ? String(row[cEnd]    || '') : '',
      mode:            cMode   !== -1 ? String(row[cMode]   || '') : '',
      halfDayPeriod:   cHalf   !== -1 ? String(row[cHalf]  || '') : '',
      totalDays:       cDays   !== -1 ? Number(row[cDays]   || 0)  : 0,
      paymentStatus:   cPay    !== -1 ? String(row[cPay]   || '') : '',
      reason:          cReason !== -1 ? String(row[cReason] || '') : '',
      docId:           cDocId  !== -1 ? String(row[cDocId]  || '') : '',
      documentUrl:     docUrlVal,
      status:          cStatus !== -1 ? String(row[cStatus] || 'Pending') : 'Pending',
      submittedAt:     cFiled  !== -1 ? String(row[cFiled]  || '') : '',
      rejectionReason: cRej    !== -1 ? String(row[cRej]   || '') : '',
      teamLeadEmail:   settings ? String(settings.teamLeadEmail || '') : '',
      approverEmail:   settings ? String(settings.approverEmail  || '') : '',
      workflowType:    settings ? String(settings.workflowType   || 'DIRECT') : 'DIRECT',
      approvalHistory: history
    }});
  }
  return _json({ success: false, message: 'Leave not found' });
}

// ══════════════════════════════════════════════════════════════════
//  LEAVE DOCUMENT – UPLOAD & GET
//  Mirrors uploadImageToDrive / getImage for attendance photos
// ══════════════════════════════════════════════════════════════════

function uploadDocumentToDrive(data) {
  var raw    = String(data.documentData);
  var parts  = raw.split('base64,');
  var base64 = parts[1];
  if (!base64 || base64.length < 10) throw new Error('Invalid base64 document data');

  // Detect MIME type from data URI prefix
  var mimeRaw = raw.split(';')[0].replace('data:', '') || 'application/octet-stream';
  var extMap  = {
    'image/jpeg':       'jpg',
    'image/png':        'png',
    'image/gif':        'gif',
    'application/pdf':  'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx'
  };
  var ext = extMap[mimeRaw] || 'bin';

  var decoded = Utilities.base64Decode(base64);
  var ts      = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');
  var name    = (data.employeeName || data.email || 'user').replace(/[^a-zA-Z0-9]/g, '_');
  var fileName = 'LEAVE_' + name + '_' + ts + '.' + ext;
  var blob    = Utilities.newBlob(decoded, mimeRaw, fileName);

  var folderId = getSetting('FOLDER_ID') || DEFAULT_FOLDER_ID;
  var folder;
  try { folder = DriveApp.getFolderById(folderId); }
  catch (e) {
    Logger.log('Leave doc folder not found → root. ' + e);
    folder = DriveApp.getRootFolder();
  }

  var monthKey  = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
  var subName   = 'LEAVE_DOCS_' + monthKey;
  var subIter   = folder.getFoldersByName(subName);
  var subFolder = subIter.hasNext() ? subIter.next() : folder.createFolder(subName);

  var file = subFolder.createFile(blob);
 
  return {
    id:  file.getId(),
    url: 'https://drive.google.com/file/d/' + file.getId() + '/view'
  };
}

function getDocument(fileId) {
  if (!fileId) return _json({ success: false, message: 'Missing file ID' });
  try {
    var file  = DriveApp.getFileById(fileId);
    var blob  = file.getBlob();
    var bytes = blob.getBytes();
    var b64   = Utilities.base64Encode(bytes);
    var mime  = blob.getContentType() || 'application/octet-stream';
    return _json({
      success:  true,
      base64:   'data:' + mime + ';base64,' + b64,
      fileName: file.getName(),
      fileSize: bytes.length,
      viewUrl:  'https://drive.google.com/file/d/' + fileId + '/view'
    });
  } catch (err) {
    return _json({ success: false, message: 'getDocument error: ' + err.toString() });
  }
}

function deductLeaveCredit(email, leaveType, days) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('LeaveCredits');
  if (!sheet) return;

  var colMap = {
    'Vacation Leave': 'Vacation Leave',
    'Sick Leave':     'Sick Leave',
    'Birthday Leave': 'Birthday Leave'
  };

  var creditCol = colMap[leaveType];
  if (!creditCol) return;

  var rows    = sheet.getDataRange().getValues();
  var headers = rows[0];
  var colEmail   = findColumnIndex(headers, ['Email', 'Email Address']);
  var colCredit  = findColumnIndex(headers, [creditCol]);
  if (colEmail === -1 || colCredit === -1) return;

  var emailLower = String(email).trim().toLowerCase();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][colEmail] || '').trim().toLowerCase() === emailLower) {
      var current = Number(rows[i][colCredit]) || 0;
      sheet.getRange(i + 1, colCredit + 1).setValue(Math.max(0, current - days));
      return;
    }
  }
}

function recoverLeaveDocumentByRow(rowNumber) {

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('LeaveApplications');

  if (!sheet) return;

  if (!rowNumber || rowNumber < 2) {
    return _json({
      success: false,
      message: "Invalid row number. Must be 2 or higher."
    });
  }

  var row = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];

  var employeeName = row[1];
  var email        = row[2];

  var docId        = row[12];
  var docUrl       = row[13];

  // Already repaired
  if (docId && String(docId).trim() !== '') {
    return _json({
      success: true,
      message: "Row already has Document ID",
      row: rowNumber
    });
  }

  if (!employeeName && !email) {
    return _json({
      success: false,
      message: "Missing employee information",
      row: rowNumber
    });
  }

  var folderId = getSetting('FOLDER_ID') || DEFAULT_FOLDER_ID;

  var folder;
  try {
    folder = DriveApp.getFolderById(folderId);
  } catch (e) {
    return _json({
      success: false,
      message: "Folder not found: " + e.toString()
    });
  }

  var files = [];
  var subFolders = folder.getFolders();

  while (subFolders.hasNext()) {
    var sub = subFolders.next();

    // Only scan Leave document folders
    if (sub.getName().indexOf('LEAVE_DOCS_') !== 0) continue;

    var f = sub.getFiles();

    while (f.hasNext()) {
      files.push(f.next());
    }
  }

  var cleanName = String(employeeName || email)
    .replace(/[^a-zA-Z0-9]/g, '_');

  for (var i = 0; i < files.length; i++) {

    var file = files[i];
    var fileName = file.getName();

    if (fileName.indexOf('LEAVE_' + cleanName) > -1) {

      var id  = file.getId();
      var url = 'https://drive.google.com/file/d/' + id + '/view';

      sheet.getRange(rowNumber, 13).setValue(id);
      sheet.getRange(rowNumber, 14).setValue(url);

      return _json({
        success: true,
        message: "Leave document recovered successfully",
        row: rowNumber,
        documentId: id,
        documentUrl: url
      });
    }
  }

  return _json({
    success: false,
    message: "No matching leave document found",
    row: rowNumber
  });
}

// ══════════════════════════════════════════════════════════════════
//  APPROVER SETTINGS
//  Sheet: ApproverSettings
//  Columns: Employee Email, Employee Name, Team Lead Email, Approver Email, Workflow Type
// ══════════════════════════════════════════════════════════════════

function getApproverSettingsSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('ApproverSettings');
  if (!sheet) {
    sheet = ss.insertSheet('ApproverSettings');
    sheet.appendRow(['Employee Email', 'Employee Name', 'Team Lead Email', 'Approver Email', 'Workflow Type']);
    var hdr = sheet.getRange(1, 1, 1, 5);
    hdr.setFontWeight('bold').setBackground('#1e3a5f').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getApproverSettings(email) {
  var sheet = getApproverSettingsSheet();
  if (sheet.getLastRow() <= 1) return _json({ success: true, settings: null });
  var rows = sheet.getDataRange().getValues();
  var emailLower = String(email || '').trim().toLowerCase();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0] || '').trim().toLowerCase() === emailLower) {
      return _json({ success: true, settings: {
        employeeEmail: rows[i][0],
        employeeName:  rows[i][1],
        teamLeadEmail: rows[i][2],
        approverEmail: rows[i][3],
        workflowType:  rows[i][4] || 'DIRECT'
      }});
    }
  }
  return _json({ success: true, settings: null });
}

function getAllApproverSettings() {
  var sheet = getApproverSettingsSheet();
  if (sheet.getLastRow() <= 1) return _json({ success: true, settings: [] });
  var rows = sheet.getDataRange().getValues();
  var results = [];
  for (var i = 1; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    results.push({
      employeeEmail: rows[i][0],
      employeeName:  rows[i][1],
      teamLeadEmail: rows[i][2],
      approverEmail: rows[i][3],
      workflowType:  rows[i][4] || 'DIRECT'
    });
  }
  return _json({ success: true, settings: results });
}

function saveApproverSettings(data) {
  if (!data || !data.employeeEmail) return _json({ success: false, message: 'Employee email required' });
  var sheet = getApproverSettingsSheet();
  var rows = sheet.getLastRow() > 1 ? sheet.getDataRange().getValues() : [[]];
  var emailLower = String(data.employeeEmail).trim().toLowerCase();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0] || '').trim().toLowerCase() === emailLower) {
      sheet.getRange(i + 1, 1, 1, 5).setValues([[
        data.employeeEmail, data.employeeName || '', data.teamLeadEmail || '',
        data.approverEmail || '', data.workflowType || 'DIRECT'
      ]]);
      return _json({ success: true, message: 'Approver settings updated' });
    }
  }
  sheet.appendRow([data.employeeEmail, data.employeeName || '', data.teamLeadEmail || '', data.approverEmail || '', data.workflowType || 'DIRECT']);
  return _json({ success: true, message: 'Approver settings saved' });
}

// ══════════════════════════════════════════════════════════════════
//  LEAVE APPROVAL HISTORY
//  Sheet: LeaveApprovals
//  Columns: ID, Leave ID, Approver Email, Approver Name, Action, Reason, Timestamp
// ══════════════════════════════════════════════════════════════════

function getLeaveApprovalsSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('LeaveApprovals');
  if (!sheet) {
    sheet = ss.insertSheet('LeaveApprovals');
    sheet.appendRow(['ID', 'Leave ID', 'Approver Email', 'Approver Name', 'Action', 'Reason', 'Timestamp']);
    var hdr = sheet.getRange(1, 1, 1, 7);
    hdr.setFontWeight('bold').setBackground('#1e3a5f').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function appendApprovalHistory(leaveId, approverEmail, approverName, action, reason) {
  var sheet = getLeaveApprovalsSheet();
  sheet.appendRow([
    Utilities.getUuid(), leaveId, approverEmail, approverName,
    action, reason || '', Utilities.formatDate(new Date(), 'Asia/Manila', "yyyy-MM-dd'T'HH:mm:ss+08:00")
  ]);
}

function getApprovalHistoryForLeave(leaveId) {
  var sheet = getLeaveApprovalsSheet();
  if (sheet.getLastRow() <= 1) return [];
  var rows = sheet.getDataRange().getValues();
  var results = [];
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][1] || '') === leaveId) {
      results.push({
        id:            rows[i][0],
        leaveId:       rows[i][1],
        approverEmail: rows[i][2],
        approverName:  rows[i][3],
        action:        rows[i][4],
        reason:        rows[i][5] || '',
        timestamp:     rows[i][6]
      });
    }
  }
  return results;
}

// ══════════════════════════════════════════════════════════════════
//  NOTIFICATIONS
//  Sheet: Notifications
//  Columns: ID, User ID (email), Type, Message, Leave ID, Is Read, Created At
// ══════════════════════════════════════════════════════════════════

function getNotificationsSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Notifications');
  if (!sheet) {
    sheet = ss.insertSheet('Notifications');
    sheet.appendRow(['ID', 'User Email', 'Type', 'Message', 'Leave ID', 'Is Read', 'Created At']);
    var hdr = sheet.getRange(1, 1, 1, 7);
    hdr.setFontWeight('bold').setBackground('#1e3a5f').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function createNotification(userEmail, type, message, leaveId) {
  var sheet = getNotificationsSheet();
  sheet.appendRow([
    Utilities.getUuid(), userEmail, type, message,
    leaveId || '', 'false', Utilities.formatDate(new Date(), 'Asia/Manila', "yyyy-MM-dd'T'HH:mm:ss+08:00")
  ]);
}

function getNotifications(email) {
  var sheet = getNotificationsSheet();
  if (sheet.getLastRow() <= 1) return _json({ success: true, notifications: [] });
  var rows = sheet.getDataRange().getValues();
  var emailLower = String(email || '').trim().toLowerCase();
  var results = [];
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][1] || '').trim().toLowerCase() === emailLower) {
      var nType = String(rows[i][2] || '');
      var refId  = rows[i][4] || '';
      // 8-col format (createNotificationRecord): [id,email,type,msg,refId,refField,isRead,createdAt]
      // 7-col format (createNotification legacy): [id,email,type,msg,refId,isRead,createdAt]
      var is8Col = rows[i].length >= 8 && rows[i][7] !== undefined && rows[i][7] !== '';
      var refField   = is8Col ? String(rows[i][5] || '') : '';
      var isReadVal  = is8Col ? rows[i][6] : rows[i][5];
      var createdVal = is8Col ? rows[i][7] : rows[i][6];
      // Determine which typed ID field to populate based on type prefix or explicit refField
      var leaveIdVal  = '';
      var tcIdVal     = '';
      var dtrIdVal    = '';
      var wfhIdVal    = '';
      if (refField === 'wfhId' || nType.indexOf('WFH_') === 0) {
        wfhIdVal = String(refId);
      } else if (refField === 'dtrId' || nType.indexOf('DTR_') === 0) {
        dtrIdVal = String(refId);
      } else if (nType.indexOf('TC_') === 0) {
        tcIdVal = String(refId);
      } else if (nType.indexOf('LEAVE_') === 0) {
        leaveIdVal = String(refId);
      } else if (nType === 'PENDING_APPROVAL') {
        // Distinguish leave vs WFH PENDING_APPROVAL by refField when available
        if (refField === 'wfhId') { wfhIdVal = String(refId); }
        else { leaveIdVal = String(refId); }
      }
      results.push({
        id:                 rows[i][0],
        userId:             rows[i][1],
        type:               nType,
        message:            rows[i][3],
        leaveId:            leaveIdVal,
        timeCorrectionId:   tcIdVal,
        dtrId:              dtrIdVal,
        wfhId:              wfhIdVal,
        isRead:             isReadVal === 'true' || isReadVal === true,
        createdAt:          createdVal
      });
    }
  }
  results.sort(function(a, b) { return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(); });
  return _json({ success: true, notifications: results });
}

function getUnreadCount(email) {
  var sheet = getNotificationsSheet();
  if (sheet.getLastRow() <= 1) return _json({ success: true, count: 0 });
  var rows = sheet.getDataRange().getValues();
  var emailLower = String(email || '').trim().toLowerCase();
  var count = 0;
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][1] || '').trim().toLowerCase() === emailLower) {
      var c5 = rows[i][5];
      var isLeg = (c5 !== 'true' && c5 !== 'false' && c5 !== true && c5 !== false && String(c5).length > 0);
      var isReadV = isLeg ? rows[i][6] : c5;
      if (isReadV !== 'true' && isReadV !== true) count++;
    }
  }
  return _json({ success: true, count: count });
}

function markNotificationsRead(email, notificationId) {
  var sheet = getNotificationsSheet();
  if (sheet.getLastRow() <= 1) return _json({ success: true });
  var rows = sheet.getDataRange().getValues();
  var emailLower = String(email || '').trim().toLowerCase();
  for (var i = 1; i < rows.length; i++) {
    var rowEmail = String(rows[i][1] || '').trim().toLowerCase();
    if (rowEmail !== emailLower) continue;
    if (!notificationId || rows[i][0] === notificationId) {
      var mc5 = rows[i][5];
      var mIsLeg = (mc5 !== 'true' && mc5 !== 'false' && mc5 !== true && mc5 !== false && String(mc5).length > 0);
      var isReadCol = mIsLeg ? 7 : 6; // 1-indexed
      sheet.getRange(i + 1, isReadCol).setValue('true');
    }
  }
  return _json({ success: true, message: 'Marked as read' });
}

// ══════════════════════════════════════════════════════════════════
//  PENDING APPROVALS
//  Returns leave applications where the caller is the next approver
// ══════════════════════════════════════════════════════════════════

function getPendingApprovals(approverEmail) {
  if (!approverEmail) return _json({ success: false, message: 'Email required' });
  var ss        = SpreadsheetApp.getActiveSpreadsheet();
  var leaveSheet = ss.getSheetByName('LeaveApplications');
  if (!leaveSheet || leaveSheet.getLastRow() <= 1) return _json({ success: true, records: [] });

  var rows    = leaveSheet.getDataRange().getValues();
  var headers = rows[0];
  var approverLower = String(approverEmail).trim().toLowerCase();

  function col(names) {
    for (var n = 0; n < names.length; n++) {
      for (var c = 0; c < headers.length; c++) {
        if (String(headers[c]).trim().toLowerCase() === names[n].toLowerCase()) return c;
      }
    }
    return -1;
  }

  var cId     = col(['ID']);
  var cName   = col(['Employee Name']);
  var cEmail  = col(['Email']);
  var cType   = col(['Leave Type']);
  var cStart  = col(['Start Date']);
  var cEnd    = col(['End Date']);
  var cDays   = col(['Total Days']);
  var cReason = col(['Reason']);
  var cDocId  = col(['Document ID']);
  var cDocUrl = col(['Document URL']);
  var cStatus = col(['Status']);
  var cFiled  = col(['Submitted At']);
  var cRej    = col(['Rejection Reason']);

  // Pre-load all approver settings into a map keyed by employee email
  var settingsMap = {};
  try {
    var apSheet = getApproverSettingsSheet();
    if (apSheet && apSheet.getLastRow() > 1) {
      var apRows = apSheet.getDataRange().getValues();
      for (var a = 1; a < apRows.length; a++) {
        var empKey = String(apRows[a][0] || '').trim().toLowerCase();
        if (empKey) {
          settingsMap[empKey] = {
            teamLeadEmail: String(apRows[a][2] || '').trim().toLowerCase(),
            approverEmail:  String(apRows[a][3] || '').trim().toLowerCase(),
            workflowType:   String(apRows[a][4] || 'DIRECT').trim()
          };
        }
      }
    }
  } catch (se) { Logger.log('getPendingApprovals: settings load error: ' + se); }

  var records = [];
  for (var i = 1; i < rows.length; i++) {
    var row    = rows[i];
    var status = String(row[cStatus] || '').trim();
    if (status !== 'Pending' && status !== 'Acknowledged') continue;

    var empEmail = cEmail !== -1 ? String(row[cEmail] || '').trim().toLowerCase() : '';
    var cfg = settingsMap[empEmail] || null;

    var tl   = cfg ? cfg.teamLeadEmail : '';
    var appr = cfg ? cfg.approverEmail  : '';
    var wf   = cfg ? cfg.workflowType   : 'DIRECT';

    var isNextApprover = false;
    if (wf === 'TWO_STEP') {
      if (status === 'Pending'      && tl   === approverLower) isNextApprover = true;
      if (status === 'Acknowledged' && appr === approverLower) isNextApprover = true;
    } else {
      if (status === 'Pending' && appr === approverLower) isNextApprover = true;
    }
    if (!isNextApprover) continue;

    var leaveId = cId !== -1 ? String(row[cId] || '') : '';
    var history = getApprovalHistoryForLeave(leaveId);

    records.push({
      id:              leaveId,
      employeeName:    cName   !== -1 ? String(row[cName]   || '') : '',
      email:           cEmail  !== -1 ? String(row[cEmail]  || '') : '',
      leaveType:       cType   !== -1 ? String(row[cType]   || '') : '',
      startDate:       cStart  !== -1 ? String(row[cStart]  || '') : '',
      endDate:         cEnd    !== -1 ? String(row[cEnd]    || '') : '',
      totalDays:       cDays   !== -1 ? Number(row[cDays]   || 0)  : 0,
      reason:          cReason !== -1 ? String(row[cReason] || '') : '',
      docId:           cDocId  !== -1 ? String(row[cDocId]  || '') : '',
      documentUrl:     cDocUrl !== -1 ? String(row[cDocUrl] || '') : '',
      status:          status,
      submittedAt:     cFiled  !== -1 ? String(row[cFiled]  || '') : '',
      teamLeadEmail:   cfg ? String(cfg.teamLeadEmail || '') : '',
      approverEmail:   cfg ? String(cfg.approverEmail  || '') : '',
      workflowType:    wf,
      rejectionReason: cRej !== -1 ? String(row[cRej] || '') : '',
      approvalHistory: history
    });
  }
  return _json({ success: true, records: records });
}

// ══════════════════════════════════════════════════════════════════
//  LEAVE APPROVAL ACTIONS
//  Helper: find leave row and update status
// ══════════════════════════════════════════════════════════════════

function findLeaveRow(leaveId) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('LeaveApplications');
  if (!sheet || sheet.getLastRow() <= 1) return null;
  var rows    = sheet.getDataRange().getValues();
  var headers = rows[0];
  var cId = -1;
  for (var c = 0; c < headers.length; c++) {
    if (String(headers[c]).trim().toLowerCase() === 'id') { cId = c; break; }
  }
  if (cId === -1) return null;
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][cId] || '') === leaveId) return { sheet: sheet, rowIndex: i + 1, headers: headers, row: rows[i] };
  }
  return null;
}

function colIdx(headers, names) {
  for (var n = 0; n < names.length; n++) {
    for (var c = 0; c < headers.length; c++) {
      if (String(headers[c]).trim().toLowerCase() === names[n].toLowerCase()) return c;
    }
  }
  return -1;
}

function getApproverName(approverEmail) {
  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Employee') || ss.getSheetByName('Employees');
  if (!sheet) return approverEmail;
  var rows    = sheet.getDataRange().getValues();
  var headers = rows[0];
  var cEmail = colIdx(headers, ['Email', 'Email Address']);
  var cName  = colIdx(headers, ['Employee Name', 'Name', 'Full Name']);
  var emailLower = String(approverEmail).trim().toLowerCase();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][cEmail] || '').trim().toLowerCase() === emailLower) {
      return String(rows[i][cName] || approverEmail);
    }
  }
  return approverEmail;
}

function getSettingsForEmployee(employeeEmail) {
  try {
    var apSheet = getApproverSettingsSheet();
    if (!apSheet || apSheet.getLastRow() <= 1) return null;
    var apRows = apSheet.getDataRange().getValues();
    var empLower = String(employeeEmail || '').trim().toLowerCase();
    for (var a = 1; a < apRows.length; a++) {
      if (String(apRows[a][0] || '').trim().toLowerCase() === empLower) {
        return {
          teamLeadEmail: String(apRows[a][2] || '').trim().toLowerCase(),
          approverEmail:  String(apRows[a][3] || '').trim().toLowerCase(),
          workflowType:   String(apRows[a][4] || 'DIRECT').trim()
        };
      }
    }
  } catch (e) { Logger.log('getSettingsForEmployee error: ' + e); }
  return null;
}

function acknowledgeLeave(leaveId, approverEmail) {
  if (!leaveId || !approverEmail) return _json({ success: false, message: 'Missing parameters' });
  var found = findLeaveRow(leaveId);
  if (!found) return _json({ success: false, message: 'Leave application not found' });

  var headers = found.headers;
  var cStatus = colIdx(headers, ['Status']);
  var cEmail  = colIdx(headers, ['Email']);

  var currentStatus = String(found.row[cStatus] || '');
  if (currentStatus !== 'Pending') return _json({ success: false, message: 'Can only acknowledge Pending requests' });

  var employeeEmail = cEmail !== -1 ? String(found.row[cEmail] || '') : '';
  var cfg = getSettingsForEmployee(employeeEmail);
  var tlEmail      = cfg ? cfg.teamLeadEmail : '';
  var nextApprover = cfg ? cfg.approverEmail  : '';

  if (tlEmail !== String(approverEmail).trim().toLowerCase()) return _json({ success: false, message: 'You are not the assigned Team Lead' });

  found.sheet.getRange(found.rowIndex, cStatus + 1).setValue('Acknowledged');

  var approverName = getApproverName(approverEmail);
  appendApprovalHistory(leaveId, approverEmail, approverName, 'Acknowledge', '');

  createNotification(employeeEmail, 'LEAVE_ACKNOWLEDGED',
    'Your leave request has been acknowledged by ' + approverName + ' and forwarded for approval.', leaveId);
  if (nextApprover) {
    createNotification(nextApprover, 'PENDING_APPROVAL',
      (employeeEmail + ' leave request is awaiting your approval.'), leaveId);
  }

  return _json({ success: true, message: 'Leave acknowledged and forwarded' });
}

function approveLeave(leaveId, approverEmail) {
  if (!leaveId || !approverEmail) return _json({ success: false, message: 'Missing parameters' });
  var found = findLeaveRow(leaveId);
  if (!found) return _json({ success: false, message: 'Leave application not found' });

  var headers = found.headers;
  var cStatus = colIdx(headers, ['Status']);
  var cEmail  = colIdx(headers, ['Email']);

  var currentStatus = String(found.row[cStatus] || '');
  var employeeEmail = cEmail !== -1 ? String(found.row[cEmail] || '') : '';
  var cfg = getSettingsForEmployee(employeeEmail);
  var apprEmail   = cfg ? cfg.approverEmail  : '';
  var tlEmail     = cfg ? cfg.teamLeadEmail  : '';
  var wf          = cfg ? cfg.workflowType   : 'DIRECT';
  var callerLower = String(approverEmail).trim().toLowerCase();

  var canApprove = false;
  if (wf === 'TWO_STEP') {
    if (currentStatus === 'Acknowledged' && callerLower === apprEmail) canApprove = true;
    if (currentStatus === 'Pending' && callerLower === tlEmail && !apprEmail) canApprove = true;
  } else {
    if (currentStatus === 'Pending' && callerLower === apprEmail) canApprove = true;
  }
  if (!canApprove) return _json({ success: false, message: 'You are not authorized to approve this request or the status is invalid' });

  found.sheet.getRange(found.rowIndex, cStatus + 1).setValue('Approved');

  var approverName = getApproverName(approverEmail);
  appendApprovalHistory(leaveId, approverEmail, approverName, 'Approve', '');

  createNotification(employeeEmail, 'LEAVE_APPROVED',
    'Your leave request has been approved by ' + approverName + '.', leaveId);

  return _json({ success: true, message: 'Leave approved successfully' });
}

function rejectLeave(leaveId, approverEmail, reason) {
  if (!leaveId || !approverEmail) return _json({ success: false, message: 'Missing parameters' });
  if (!reason || String(reason).trim() === '') return _json({ success: false, message: 'Rejection reason is required' });

  var found = findLeaveRow(leaveId);
  if (!found) return _json({ success: false, message: 'Leave application not found' });

  var headers = found.headers;
  var cStatus = colIdx(headers, ['Status']);
  var cEmail  = colIdx(headers, ['Email']);
  var cRej    = colIdx(headers, ['Rejection Reason']);

  var currentStatus = String(found.row[cStatus] || '');
  var employeeEmail = cEmail !== -1 ? String(found.row[cEmail] || '') : '';
  var cfg = getSettingsForEmployee(employeeEmail);
  var apprEmail   = cfg ? cfg.approverEmail  : '';
  var tlEmail     = cfg ? cfg.teamLeadEmail  : '';
  var callerLower = String(approverEmail).trim().toLowerCase();

  if (callerLower !== apprEmail && callerLower !== tlEmail) {
    return _json({ success: false, message: 'You are not authorized to reject this request' });
  }
  if (currentStatus === 'Approved' || currentStatus === 'Cancelled') {
    return _json({ success: false, message: 'Cannot reject an already ' + currentStatus + ' request' });
  }

  found.sheet.getRange(found.rowIndex, cStatus + 1).setValue('Rejected');
  if (cRej !== -1) {
    found.sheet.getRange(found.rowIndex, cRej + 1).setValue(String(reason));
  }

  var approverName  = getApproverName(approverEmail);
  appendApprovalHistory(leaveId, approverEmail, approverName, 'Reject', reason);

  var employeeEmail = cEmail !== -1 ? String(found.row[cEmail] || '') : '';
  createNotification(employeeEmail, 'LEAVE_REJECTED',
    'Your leave request was rejected by ' + approverName + '. Reason: ' + reason, leaveId);

  return _json({ success: true, message: 'Leave rejected' });
}

// ══════════════════════════════════════════════════════════════════
//  TIME CORRECTION FILING
// ══════════════════════════════════════════════════════════════════

function submitTimeCorrection(data, documentData) {
  if (!data) return _json({ success: false, message: 'No data provided' });
  if (!data.email)             return _json({ success: false, message: 'Email is required' });
  if (!data.attendanceDate)    return _json({ success: false, message: 'Attendance date is required' });
  if (!data.attendanceRecordId) return _json({ success: false, message: 'Attendance record ID is required' });
  if (!data.reason || String(data.reason).trim().length < 10)
    return _json({ success: false, message: 'Reason must be at least 10 characters' });
  if (!String(data.correctedTimeIn || '').trim() && !String(data.correctedTimeOut || '').trim())
    return _json({ success: false, message: 'A corrected time is required' });

  var attDate  = new Date(data.attendanceDate);
  var today    = new Date();
  var diffDays = Math.floor((today.getTime() - attDate.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays > 30) return _json({ success: false, message: 'Attendance record is older than 30 days and is no longer eligible for correction' });
  if (attDate > today) return _json({ success: false, message: 'Future attendance dates are not allowed' });

  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('TimeCorrectionFilings');
  if (!sheet) {
    sheet = ss.insertSheet('TimeCorrectionFilings');
    sheet.appendRow([
      'ID','Employee Name','Email','Department','Designation',
      'Attendance Date','Attendance Record ID',
      'Original Time In','Original Time Out',
      'Corrected Time In','Corrected Time Out',
      'Reason','Document ID','Document URL',
      'Status','Submitted At','Approver Email','Rejection Reason'
    ]);
  }

  if (sheet.getLastRow() > 1) {
    var rows2   = sheet.getDataRange().getValues();
    var hdr2    = rows2[0];
    var cE2     = findColumnIndex(hdr2, ['Email']);
    var cRId2   = findColumnIndex(hdr2, ['Attendance Record ID']);
    var cSt2    = findColumnIndex(hdr2, ['Status']);
    for (var i = 1; i < rows2.length; i++) {
      if (String(rows2[i][cE2]  || '').trim().toLowerCase() === String(data.email).trim().toLowerCase()
       && String(rows2[i][cRId2]|| '').trim() === String(data.attendanceRecordId).trim()
       && (String(rows2[i][cSt2]|| '') === 'Pending' || String(rows2[i][cSt2]|| '') === 'Approved')) {
        return _json({ success: false, message: 'An active Time Correction request already exists for this attendance record' });
      }
    }
  }

  var hdr2 = sheet.getDataRange().getValues()[0];

  var docId = '', docUrl = '';
  if (documentData && String(documentData).indexOf('base64,') > -1) {
    try {
      var folderId = getSetting('FOLDER_ID') || DEFAULT_FOLDER_ID;
      var tcFolder;
      try { tcFolder = DriveApp.getFolderById(folderId); }
      catch (fe) { tcFolder = DriveApp.getRootFolder(); }
      var monthKey   = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
      var subName    = 'TC_DOCS_' + monthKey;
      var subIter    = tcFolder.getFoldersByName(subName);
      var subFolder  = subIter.hasNext() ? subIter.next() : tcFolder.createFolder(subName);
      var parts      = documentData.split(',');
      var mime       = parts[0].match(/:(.*?);/)[1];
      var ext        = mime.split('/')[1] || 'bin';
      var ts         = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');
      var safeName   = (data.employeeName || data.email || 'user').replace(/[^a-zA-Z0-9]/g, '_');
      var blob       = Utilities.newBlob(Utilities.base64Decode(parts[1]), mime, 'TC_' + safeName + '_' + ts + '.' + ext);
      var file       = subFolder.createFile(blob);
      
      docId  = file.getId();
      docUrl = 'https://drive.google.com/file/d/' + file.getId() + '/view';
    } catch (e2) { Logger.log('TC doc upload error: ' + e2.toString()); }
  }

  var id  = Utilities.getUuid();
  var now = Utilities.formatDate(new Date(), 'Asia/Manila', "yyyy-MM-dd'T'HH:mm:ss'+08:00'");

  sheet.appendRow([
    id, data.employeeName || '', data.email,
    data.department || '', data.designation || '',
    data.attendanceDate, data.attendanceRecordId,
    data.originalTimeIn  || '', data.originalTimeOut || '',
    data.correctedTimeIn || '', data.correctedTimeOut || '',
    data.reason, docId, docUrl,
    'Pending', now, data.approverEmail || '', ''
  ]);

  // Determine approver based on employee workflow settings
  var tcSettings  = null;
  try {
    var apResult = getApproverSettings(data.email);
    var apJson   = JSON.parse(apResult.getContent());
    if (apJson.success && apJson.settings) tcSettings = apJson.settings;
  } catch (ae) { Logger.log('submitTimeCorrection: getApproverSettings error: ' + ae); }

  var finalApprover = data.approverEmail || (tcSettings ? tcSettings.approverEmail : '');
  var teamLead      = tcSettings ? tcSettings.teamLeadEmail : '';
  var tcWorkflow    = tcSettings ? tcSettings.workflowType : 'DIRECT';
  var firstApprover = (tcWorkflow === 'TWO_STEP' && teamLead) ? teamLead : finalApprover;

  // Update the stored approver to the first handler
  if (firstApprover) {
    var cAppr = findColumnIndex(hdr2, ['Approver Email']);
    if (cAppr !== -1) sheet.getRange(sheet.getLastRow(), cAppr + 1).setValue(firstApprover);
  }

  if (firstApprover) {
    createNotification(firstApprover, 'TC_FILED',
      (data.employeeName || data.email) + ' submitted a Time Correction request for ' + data.attendanceDate, id);
  }

  return _json({ success: true, message: 'Time Correction filed successfully', id: id, docId: docId, docUrl: docUrl });
}

function getTimeCorrectionById(tcId) {
  if (!tcId) return _json({ success: false, message: 'tcId required' });
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('TimeCorrectionFilings');
  if (!sheet || sheet.getLastRow() <= 1) return _json({ success: false, message: 'No records' });
  var rows    = sheet.getDataRange().getValues();
  var headers = rows[0];
  var idLower = String(tcId).trim().toLowerCase();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][findColumnIndex(headers,['ID'])] || '').trim().toLowerCase() !== idLower) continue;
    return _json({ success: true, record: {
      id:                String(rows[i][findColumnIndex(headers,['ID'])]                    || ''),
      employeeName:      String(rows[i][findColumnIndex(headers,['Employee Name'])]         || ''),
      email:             String(rows[i][findColumnIndex(headers,['Email'])]                 || ''),
      department:        String(rows[i][findColumnIndex(headers,['Department'])]            || ''),
      designation:       String(rows[i][findColumnIndex(headers,['Designation'])]           || ''),
      attendanceDate:    String(rows[i][findColumnIndex(headers,['Attendance Date'])]       || ''),
      attendanceRecordId:String(rows[i][findColumnIndex(headers,['Attendance Record ID'])]  || ''),
      originalTimeIn:    formatTimeValue(rows[i][findColumnIndex(headers,['Original Time In'])]),
      originalTimeOut:   formatTimeValue(rows[i][findColumnIndex(headers,['Original Time Out'])]),
      correctedTimeIn:   formatTimeValue(rows[i][findColumnIndex(headers,['Corrected Time In'])]),
      correctedTimeOut:  formatTimeValue(rows[i][findColumnIndex(headers,['Corrected Time Out'])]),
      reason:            String(rows[i][findColumnIndex(headers,['Reason'])]                || ''),
      docId:             String(rows[i][findColumnIndex(headers,['Document ID'])]           || ''),
      documentUrl:       String(rows[i][findColumnIndex(headers,['Document URL'])]          || ''),
      status:            String(rows[i][findColumnIndex(headers,['Status'])]                || 'Pending'),
      submittedAt:       String(rows[i][findColumnIndex(headers,['Submitted At'])]          || ''),
      approverEmail:     String(rows[i][findColumnIndex(headers,['Approver Email'])]        || ''),
      rejectionReason:   String(rows[i][findColumnIndex(headers,['Rejection Reason'])]      || '')
    }});
  }
  return _json({ success: false, message: 'Not found' });
}

function getTimeCorrectionHistory(email) {
  if (!email) return _json({ success: false, message: 'Email is required' });
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('TimeCorrectionFilings');
  if (!sheet || sheet.getLastRow() <= 1) return _json({ success: true, records: [] });

  var rows    = sheet.getDataRange().getValues();
  var headers = rows[0];
  var records = [];
  for (var i = 1; i < rows.length; i++) {
    var cEmail = findColumnIndex(headers, ['Email']);
    if (String(rows[i][cEmail] || '').trim().toLowerCase() !== String(email).trim().toLowerCase()) continue;
    records.push({
      id:                String(rows[i][findColumnIndex(headers,['ID'])]                    || ''),
      employeeName:      String(rows[i][findColumnIndex(headers,['Employee Name'])]         || ''),
      email:             String(rows[i][cEmail]                                             || ''),
      department:        String(rows[i][findColumnIndex(headers,['Department'])]            || ''),
      designation:       String(rows[i][findColumnIndex(headers,['Designation'])]           || ''),
      attendanceDate:    String(rows[i][findColumnIndex(headers,['Attendance Date'])]       || ''),
      attendanceRecordId:String(rows[i][findColumnIndex(headers,['Attendance Record ID'])]  || ''),
      originalTimeIn:    formatTimeValue(rows[i][findColumnIndex(headers,['Original Time In'])]),
      originalTimeOut:   formatTimeValue(rows[i][findColumnIndex(headers,['Original Time Out'])]),
      correctedTimeIn:   formatTimeValue(rows[i][findColumnIndex(headers,['Corrected Time In'])]),
      correctedTimeOut:  formatTimeValue(rows[i][findColumnIndex(headers,['Corrected Time Out'])]),
      reason:            String(rows[i][findColumnIndex(headers,['Reason'])]                || ''),
      docId:             String(rows[i][findColumnIndex(headers,['Document ID'])]           || ''),
      documentUrl:       String(rows[i][findColumnIndex(headers,['Document URL'])]          || ''),
      status:            String(rows[i][findColumnIndex(headers,['Status'])]                || 'Pending'),
      submittedAt:       String(rows[i][findColumnIndex(headers,['Submitted At'])]          || ''),
      approverEmail:     String(rows[i][findColumnIndex(headers,['Approver Email'])]        || ''),
      rejectionReason:   String(rows[i][findColumnIndex(headers,['Rejection Reason'])]      || '')
    });
  }
  return _json({ success: true, records: records.reverse() });
}

function getPendingTimeCorrectionApprovals(approverEmail) {
  if (!approverEmail) return _json({ success: false, message: 'Email required' });
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('TimeCorrectionFilings');
  if (!sheet || sheet.getLastRow() <= 1) return _json({ success: true, records: [] });

  var rows    = sheet.getDataRange().getValues();
  var headers = rows[0];
  var cApprover = findColumnIndex(headers, ['Approver Email']);
  var cStatus   = findColumnIndex(headers, ['Status']);
  var cEmail    = findColumnIndex(headers, ['Email']);
  var isAdmin   = String(approverEmail).toLowerCase() === ADMIN_EMAIL;
  var approverLower = String(approverEmail).trim().toLowerCase();
  var records   = [];

  for (var i = 1; i < rows.length; i++) {
    var status = String(rows[i][cStatus] || '');
    if (status !== 'Pending' && status !== 'Acknowledged') continue;
    var rowApprover = String(rows[i][cApprover] || '').trim().toLowerCase();

    // Determine if caller is the current step's approver
    var isNextApprover = false;
    if (!isAdmin) {
      var employeeEmail = String(rows[i][cEmail] || '').trim().toLowerCase();
      var cfg = getSettingsForEmployee(employeeEmail);
      var tl = cfg ? cfg.teamLeadEmail : '';
      var appr = cfg ? cfg.approverEmail : '';
      var wf = cfg ? cfg.workflowType : 'DIRECT';
      if (wf === 'TWO_STEP') {
        if (status === 'Pending' && tl === approverLower) isNextApprover = true;
        if (status === 'Acknowledged' && appr === approverLower) isNextApprover = true;
      } else {
        if (status === 'Pending' && appr === approverLower) isNextApprover = true;
      }
      // Fallback to stored approver if no settings
      if (!isNextApprover && rowApprover === approverLower) isNextApprover = true;
    }
    if (!isAdmin && !isNextApprover) continue;
    records.push({
      id:                String(rows[i][findColumnIndex(headers,['ID'])]                    || ''),
      employeeName:      String(rows[i][findColumnIndex(headers,['Employee Name'])]         || ''),
      email:             String(rows[i][findColumnIndex(headers,['Email'])]                 || ''),
      department:        String(rows[i][findColumnIndex(headers,['Department'])]            || ''),
      designation:       String(rows[i][findColumnIndex(headers,['Designation'])]           || ''),
      attendanceDate:    String(rows[i][findColumnIndex(headers,['Attendance Date'])]       || ''),
      attendanceRecordId:String(rows[i][findColumnIndex(headers,['Attendance Record ID'])]  || ''),
      originalTimeIn:    formatTimeValue(rows[i][findColumnIndex(headers,['Original Time In'])]),
      originalTimeOut:   formatTimeValue(rows[i][findColumnIndex(headers,['Original Time Out'])]),
      correctedTimeIn:   formatTimeValue(rows[i][findColumnIndex(headers,['Corrected Time In'])]),
      correctedTimeOut:  formatTimeValue(rows[i][findColumnIndex(headers,['Corrected Time Out'])]),
      reason:            String(rows[i][findColumnIndex(headers,['Reason'])]                || ''),
      docId:             String(rows[i][findColumnIndex(headers,['Document ID'])]           || ''),
      documentUrl:       String(rows[i][findColumnIndex(headers,['Document URL'])]          || ''),
      status:            String(rows[i][cStatus]                                            || 'Pending'),
      submittedAt:       String(rows[i][findColumnIndex(headers,['Submitted At'])]          || ''),
      approverEmail:     String(rows[i][cApprover]                                          || ''),
      rejectionReason:   String(rows[i][findColumnIndex(headers,['Rejection Reason'])]      || '')
    });
  }
  return _json({ success: true, records: records });
}

function formatTimeValue(value) {
  if (!value) return '';

  // If value is a Date object
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      'h:mm:ss a'
    );
  }

  return String(value);
}

function findTimeCorrectionRow(id) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('TimeCorrectionFilings');
  if (!sheet || sheet.getLastRow() <= 1) return null;
  var rows    = sheet.getDataRange().getValues();
  var headers = rows[0];
  var cId     = findColumnIndex(headers, ['ID']);
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][cId] || '').trim() === String(id).trim()) {
      return { sheet: sheet, rowIndex: i + 1, row: rows[i], headers: headers };
    }
  }
  return null;
}

function acknowledgeTimeCorrection(id, approverEmail) {
  if (!id || !approverEmail) return _json({ success: false, message: 'Missing parameters' });
  var found = findTimeCorrectionRow(id);
  if (!found) return _json({ success: false, message: 'Time Correction request not found' });

  var headers = found.headers;
  var cStatus = findColumnIndex(headers, ['Status']);
  var cEmail  = findColumnIndex(headers, ['Email']);
  var cAppr   = findColumnIndex(headers, ['Approver Email']);
  var cDate   = findColumnIndex(headers, ['Attendance Date']);
  var currentStatus = String(found.row[cStatus] || '');

  if (currentStatus !== 'Pending') return _json({ success: false, message: 'Can only acknowledge Pending requests' });

  var employeeEmail = String(found.row[cEmail] || '');
  var cfg = getSettingsForEmployee(employeeEmail);
  var tlEmail = cfg ? cfg.teamLeadEmail : '';
  var nextApprover = cfg ? cfg.approverEmail : '';

  if (tlEmail !== String(approverEmail).trim().toLowerCase()) return _json({ success: false, message: 'You are not the assigned Team Lead' });

  found.sheet.getRange(found.rowIndex, cStatus + 1).setValue('Acknowledged');
  if (cAppr !== -1 && nextApprover) found.sheet.getRange(found.rowIndex, cAppr + 1).setValue(nextApprover);

  var approverName = getApproverName(approverEmail);
  var now = Utilities.formatDate(new Date(), 'Asia/Manila', "yyyy-MM-dd'T'HH:mm:ss'+08:00'");
  appendTimeCorrectionHistory(id, approverEmail, approverName, 'Acknowledge', '', now);

  createNotification(employeeEmail, 'TC_ACKNOWLEDGED',
    'Your Time Correction request has been acknowledged by ' + approverName + ' and forwarded for approval.', id);
  if (nextApprover) {
    createNotification(nextApprover, 'TC_FILED',
      'Time Correction request for ' + String(found.row[cDate] || '') + ' has been forwarded for your approval.', id);
  }
  return _json({ success: true, message: 'Time Correction acknowledged and forwarded' });
}

function approveTimeCorrection(id, approverEmail) {
  if (!id || !approverEmail) return _json({ success: false, message: 'Missing parameters' });
  var found = findTimeCorrectionRow(id);
  if (!found) return _json({ success: false, message: 'Time Correction request not found' });
  var cStatus = findColumnIndex(found.headers, ['Status']);
  var cEmail  = findColumnIndex(found.headers, ['Email']);
  var cDate   = findColumnIndex(found.headers, ['Attendance Date']);
  var status = String(found.row[cStatus] || '');
  if (status !== 'Pending' && status !== 'Acknowledged')
    return _json({ success: false, message: 'Only Pending or Acknowledged requests can be approved' });

  var cAppr = findColumnIndex(found.headers, ['Approver Email']);
  var currentApprover = cAppr !== -1 ? String(found.row[cAppr] || '').trim().toLowerCase() : '';
  if (currentApprover && currentApprover !== String(approverEmail).trim().toLowerCase())
    return _json({ success: false, message: 'You are not the assigned approver' });

  found.sheet.getRange(found.rowIndex, cStatus + 1).setValue('Approved');
  var approverName  = getApproverName(approverEmail);
  var now = Utilities.formatDate(new Date(), 'Asia/Manila', "yyyy-MM-dd'T'HH:mm:ss'+08:00'");
  appendTimeCorrectionHistory(id, approverEmail, approverName, 'Approve', '', now);
  createNotification(String(found.row[cEmail] || ''), 'TC_APPROVED',
    'Your Time Correction request for ' + String(found.row[cDate] || '') + ' was approved by ' + approverName, id);
  return _json({ success: true, message: 'Time Correction approved' });
}

function rejectTimeCorrection(id, approverEmail, reason) {
  if (!id || !approverEmail) return _json({ success: false, message: 'Missing parameters' });
  var found = findTimeCorrectionRow(id);
  if (!found) return _json({ success: false, message: 'Time Correction request not found' });
  var headers = found.headers;
  var cStatus = findColumnIndex(headers, ['Status']);
  var cEmail  = findColumnIndex(headers, ['Email']);
  var cRej    = findColumnIndex(headers, ['Rejection Reason']);
  var cAppr   = findColumnIndex(headers, ['Approver Email']);
  var status = String(found.row[cStatus] || '');
  if (status !== 'Pending' && status !== 'Acknowledged')
    return _json({ success: false, message: 'Only Pending or Acknowledged requests can be rejected' });

  var employeeEmail = String(found.row[cEmail] || '');
  var cfg = getSettingsForEmployee(employeeEmail);
  var tlEmail = cfg ? cfg.teamLeadEmail : '';
  var apprEmail = cfg ? cfg.approverEmail : '';
  var callerLower = String(approverEmail).trim().toLowerCase();
  var currentApprover = cAppr !== -1 ? String(found.row[cAppr] || '').trim().toLowerCase() : '';

  if (currentApprover && currentApprover !== callerLower && tlEmail !== callerLower && apprEmail !== callerLower) {
    return _json({ success: false, message: 'You are not authorized to reject this request' });
  }

  found.sheet.getRange(found.rowIndex, cStatus + 1).setValue('Rejected');
  if (cRej !== -1) found.sheet.getRange(found.rowIndex, cRej + 1).setValue(String(reason || ''));
  var approverName = getApproverName(approverEmail);
  var now = Utilities.formatDate(new Date(), 'Asia/Manila', "yyyy-MM-dd'T'HH:mm:ss'+08:00'");
  appendTimeCorrectionHistory(id, approverEmail, approverName, 'Reject', reason, now);
  createNotification(employeeEmail, 'TC_REJECTED',
    'Your Time Correction request was rejected by ' + approverName + '. Reason: ' + reason, id);
  return _json({ success: true, message: 'Time Correction rejected' });
}

function cancelTimeCorrection(id, email) {
  if (!id || !email) return _json({ success: false, message: 'Missing parameters' });
  var found = findTimeCorrectionRow(id);
  if (!found) return _json({ success: false, message: 'Time Correction request not found' });
  var cStatus = findColumnIndex(found.headers, ['Status']);
  var cEmail  = findColumnIndex(found.headers, ['Email']);
  var currentStatus = String(found.row[cStatus] || '');
  if (String(found.row[cEmail] || '').trim().toLowerCase() !== String(email).trim().toLowerCase())
    return _json({ success: false, message: 'Unauthorized' });
  if (currentStatus === 'Approved' || currentStatus === 'Cancelled')
    return _json({ success: false, message: 'Cannot cancel an already ' + currentStatus + ' request' });

  found.sheet.getRange(found.rowIndex, cStatus + 1).setValue('Cancelled');
  var now = Utilities.formatDate(new Date(), 'Asia/Manila', "yyyy-MM-dd'T'HH:mm:ss'+08:00'");
  appendTimeCorrectionHistory(id, email, email, 'Cancel', 'Cancelled by employee', now);
  return _json({ success: true, message: 'Time Correction cancelled' });
}

function appendTimeCorrectionHistory(tcId, approverEmail, approverName, action, reason, timestamp) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('TimeCorrectionHistory');
  if (!sheet) {
    sheet = ss.insertSheet('TimeCorrectionHistory');
    sheet.appendRow(['ID','TC ID','Approver Email','Approver Name','Action','Reason','Timestamp']);
  }
  sheet.appendRow([Utilities.getUuid(), tcId, approverEmail, approverName, action, reason || '', timestamp]);
}

// ══════════════════════════════════════════════════════════════════
//  DTR MANAGEMENT
// ══════════════════════════════════════════════════════════════════

function initDTRSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('DTRRecords');
  if (!sheet) {
    sheet = ss.insertSheet('DTRRecords');
    sheet.appendRow([
      'ID','Version','Employee Email','Employee Name','Employee Number',
      'Department','Designation','Branch','Month','Year','Cut-Off',
      'Coverage Start','Coverage End','Status','Generated By','Generated At',
      'Sent At','Viewed At','Acknowledged At','Acknowledged By',
      'Days JSON','Summary JSON','Audit Trail JSON'
    ]);
  }
  return sheet;
}

function initDTRIssuesSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('DTRIssues');
  if (!sheet) {
    sheet = ss.insertSheet('DTRIssues');
    sheet.appendRow(['ID','DTR ID','Employee Email','Employee Name','Issue Type','Comments','Submitted At','Resolved At','Resolved By']);
  }
  return sheet;
}

function generateDTR(data) {
  var adminEmail = String(data.adminEmail || '').trim().toLowerCase();
  var empEmail   = String(data.employeeEmail || '').trim().toLowerCase();
  var month      = parseInt(data.month, 10);
  var year       = parseInt(data.year, 10);
  var cutOff     = String(data.cutOff || '1st').trim();

  if (!adminEmail || !empEmail || !month || !year)
    return _json({ success: false, message: 'Missing required parameters' });

  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Coverage dates
  var startDay = cutOff === '1st' ? 1 : 16;
  var endDay   = cutOff === '1st' ? 15 : new Date(year, month, 0).getDate();
  var coverageStart = month + '/' + startDay + '/' + year;
  var coverageEnd   = month + '/' + endDay   + '/' + year;

  // Pull ALL attendance records for this employee (no date pre-filter).
  // We need the full chronological stream to pair TIME_IN / TIME_OUT correctly
  // across overnight, multi-day, and cross-coverage-boundary shifts.
  var attSheet = ss.getSheetByName('Attendance');
  var attRows  = attSheet ? attSheet.getDataRange().getValues() : [];

  // Helper: format a Date to M/D/YYYY key
  function dateKey(d) {
    return (d.getMonth()+1) + '/' + d.getDate() + '/' + d.getFullYear();
  }

  // Coverage boundary timestamps for filtering pairs
  var coverageStartTs = new Date(year, month - 1, startDay).getTime();
  var coverageEndTs   = new Date(year, month - 1, endDay, 23, 59, 59, 999).getTime();

  // Collect and sort all events for this employee by timestamp
  var allEvents = [];
  for (var ai = 1; ai < attRows.length; ai++) {
    var rowEmail = String(attRows[ai][3] || '').trim().toLowerCase();
    if (rowEmail !== empEmail) continue;
    var action = String(attRows[ai][4] || '').trim();
    if (action !== 'TIME_IN' && action !== 'TIME_OUT') continue;

    var tsRaw = attRows[ai][5];
    var tsMs  = tsRaw instanceof Date ? tsRaw.getTime() : new Date(String(tsRaw || '')).getTime();
    if (isNaN(tsMs)) continue;

    var tsStr = tsRaw instanceof Date
      ? Utilities.formatDate(tsRaw, 'Asia/Manila', "yyyy-MM-dd'T'HH:mm:ss+08:00")
      : String(tsRaw || '');
    var eventDate = new Date(tsMs);
    allEvents.push({
      action:    action,
      tsMs:      tsMs,
      timestamp: tsStr,
      date:      dateKey(eventDate),
      time:      String(attRows[ai][7]  || ''),
      latitude:  Number(attRows[ai][8]  || 0),
      longitude: Number(attRows[ai][9]  || 0),
      address:   String(attRows[ai][11] || ''),
      imageId:   String(attRows[ai][15] || ''),
      imageUrl:  String(attRows[ai][16] || '')
    });
  }
  allEvents.sort(function(a, b) { return a.tsMs - b.tsMs; });

  // Sequential pairing: walk chronologically, TIME_IN opens a pair, next TIME_OUT closes it.
  // A pair belongs to the DTR if the TIME_IN falls within the coverage range.
  var pairs = []; // { timeIn, timeOut|null } — one entry per attendance session
  var openIn = null;
  for (var ei = 0; ei < allEvents.length; ei++) {
    var ev = allEvents[ei];
    if (ev.action === 'TIME_IN') {
      // If there is an unclosed TIME_IN already, it has no TIME_OUT → keep it as-is and start fresh
      if (openIn) {
        // Only include the pair if the TIME_IN was within coverage
        if (openIn.tsMs >= coverageStartTs && openIn.tsMs <= coverageEndTs) {
          pairs.push({ timeIn: openIn, timeOut: null });
        }
      }
      openIn = ev;
    } else { // TIME_OUT
      if (openIn) {
        // Close the open pair
        if (openIn.tsMs >= coverageStartTs && openIn.tsMs <= coverageEndTs) {
          pairs.push({ timeIn: openIn, timeOut: ev });
        }
        openIn = null;
      }
      // Orphan TIME_OUT with no preceding TIME_IN — skip
    }
  }
  // Handle trailing unclosed TIME_IN
  if (openIn && openIn.tsMs >= coverageStartTs && openIn.tsMs <= coverageEndTs) {
    pairs.push({ timeIn: openIn, timeOut: null });
  }

  // Build a set of calendar dates that have at least one pair (TIME_IN date)
  var pairedDates = {};
  for (var pi = 0; pi < pairs.length; pi++) {
    pairedDates[pairs[pi].timeIn.date] = true;
  }

  // Pull approved leaves for this employee in range
  var leaveSheet = ss.getSheetByName('LeaveApplications');
  var leaveRows  = leaveSheet ? leaveSheet.getDataRange().getValues() : [];
  var approvedLeaveDates = {};
  for (var li = 1; li < leaveRows.length; li++) {
    var lEmail  = String(leaveRows[li][1] || '').trim().toLowerCase();
    var lStatus = String(leaveRows[li][13] || '').trim();
    if (lEmail !== empEmail || lStatus !== 'Approved') continue;
    var lStart = new Date(String(leaveRows[li][4] || ''));
    var lEnd   = new Date(String(leaveRows[li][5] || ''));
    if (isNaN(lStart.getTime()) || isNaN(lEnd.getTime())) continue;
    var cur = new Date(lStart);
    while (cur <= lEnd) {
      var key = (cur.getMonth()+1) + '/' + cur.getDate() + '/' + cur.getFullYear();
      approvedLeaveDates[key] = true;
      cur.setDate(cur.getDate() + 1);
    }
  }

  // Build day records from pairs + absent rows
  var days = [];
  var summary = {
    totalWorkingDays: 0, daysPresent: 0, daysAbsent: 0,
    approvedLeave: 0, lateCount: 0, undertimeCount: 0,
    missingTimeIn: 0, missingTimeOut: 0, totalHoursWorked: 0
  };
  var dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

  // 1. One row per attendance pair
  for (var pi = 0; pi < pairs.length; pi++) {
    var pair = pairs[pi];
    var tin  = pair.timeIn;
    var tout = pair.timeOut;
    var tinDate  = new Date(tin.tsMs);
    var dow  = tinDate.getDay();
    var workHours = 0;
    var status;
    var isCrossDay = tout && (tout.date !== tin.date);
    var periodLabel = isCrossDay ? (tin.date + ' → ' + tout.date) : tin.date;

    var isRestDay = (dow === 0 || dow === 6);
    summary.totalWorkingDays++;
    if (tout) {
      var toutTs = new Date(tout.timestamp);
      var tinTs  = new Date(tin.timestamp);
      if (!isNaN(tinTs.getTime()) && !isNaN(toutTs.getTime())) {
        workHours = (toutTs.getTime() - tinTs.getTime()) / 3600000;
        summary.totalHoursWorked += workHours;
      }
      var tinHr = tinTs.getHours ? tinTs.getHours() : 0;
      var tinMin = tinTs.getMinutes ? tinTs.getMinutes() : 0;
      if (tinHr > 8 || (tinHr === 8 && tinMin > 0)) summary.lateCount++;
      status = isRestDay ? 'Rest Day' : 'Present';
      summary.daysPresent++;
    } else {
      status = 'Missing Time Out';
      summary.missingTimeOut++;
      summary.daysPresent++;
    }

    days.push({
      date:             tin.date,
      dayOfWeek:        dayNames[dow],
      timeIn:           tin.time,
      timeOut:          tout ? tout.time : '',
      timeOutDate:      isCrossDay ? tout.date : '',
      workPeriodLabel:  isCrossDay ? periodLabel : '',
      workingHours:     Math.round(workHours * 100) / 100,
      status:           status,
      address:          tin.address,
      latitude:         tin.latitude,
      longitude:        tin.longitude,
      timeInImageUrl:   tin.imageUrl,
      timeInImageId:    tin.imageId,
      timeOutImageUrl:  tout ? tout.imageUrl : '',
      timeOutImageId:   tout ? tout.imageId  : '',
      timeInTimestamp:  tin.timestamp,
      timeOutTimestamp: tout ? tout.timestamp : '',
      remarks:          ''
    });
  }

  // 2. Insert Absent / Leave / Rest rows for every calendar day that had no pair
  for (var day = startDay; day <= endDay; day++) {
    var dt   = new Date(year, month - 1, day);
    var dow2 = dt.getDay();
    var dKey = month + '/' + day + '/' + year;
    if (pairedDates[dKey]) continue; // already covered by a pair row

    var isRestDay2 = (dow2 === 0 || dow2 === 6);
    var isLeave   = approvedLeaveDates[dKey] || false;
    var status2;
    if (isRestDay2) {
      status2 = 'Rest Day';
    } else if (isLeave) {
      status2 = 'Approved Leave';
      summary.approvedLeave++;
    } else {
      status2 = 'Absent';
      summary.daysAbsent++;
      summary.totalWorkingDays++;
    }
    days.push({
      date:            dKey,
      dayOfWeek:       dayNames[dow2],
      timeIn:          '',
      timeOut:         '',
      timeOutDate:     '',
      workPeriodLabel: '',
      workingHours:    0,
      status:          status2,
      address:         '',
      latitude:        0,
      longitude:       0,
      timeInImageUrl:  '',
      timeInImageId:   '',
      timeOutImageUrl: '',
      timeOutImageId:  '',
      timeInTimestamp: '',
      timeOutTimestamp:'',
      remarks:         ''
    });
  }

  // 3. Sort by TIME_IN timestamp (pairs first by occurrence, then absent days fill in order)
  days.sort(function(a, b) {
    var ta = a.timeInTimestamp ? new Date(a.timeInTimestamp).getTime() : new Date(a.date).getTime();
    var tb = b.timeInTimestamp ? new Date(b.timeInTimestamp).getTime() : new Date(b.date).getTime();
    return ta - tb;
  });

  summary.totalHoursWorked = Math.round(summary.totalHoursWorked * 100) / 100;

  // Get employee info
  var empSheet = ss.getSheetByName('Employee');
  var empRows  = empSheet ? empSheet.getDataRange().getValues() : [];
  var empName = data.employeeName || empEmail;
  var dept = '', desig = '', branch = '', empNumber = '';
  for (var ei = 1; ei < empRows.length; ei++) {
    if (String(empRows[ei][0] || '').trim().toLowerCase() === empEmail) {
      empName   = String(empRows[ei][1] || empName);
      dept      = String(empRows[ei][5] || '');
      desig     = String(empRows[ei][6] || '');
      empNumber = String(empRows[ei][2] || '');
      break;
    }
  }

  // Duplicate check: reject if an active DTR already exists for this employee + period
  var dtrSheet = initDTRSheet();
  var existingRows = dtrSheet.getDataRange().getValues();
  for (var di = 1; di < existingRows.length; di++) {
    var exEmail  = String(existingRows[di][2] || '').trim().toLowerCase();
    var exMonth  = Number(existingRows[di][8]);
    var exYear   = Number(existingRows[di][9]);
    var exCutOff = String(existingRows[di][10] || '').trim();
    var exStatus = String(existingRows[di][13] || '').trim();
    if (exEmail === empEmail && exMonth === month && exYear === year && exCutOff === cutOff
        && exStatus !== 'Regenerated') {
      return _json({
        success:       false,
        alreadyExists: true,
        dtrId:         String(existingRows[di][0]),
        message:       'A DTR already exists for this employee and payroll cut-off. Use Regenerate DTR to update it.'
      });
    }
  }

  var now   = Utilities.formatDate(new Date(), 'Asia/Manila', "yyyy-MM-dd'T'HH:mm:ss'+08:00'");
  var dtrId = Utilities.getUuid();
  var auditTrail = [{ action: 'Generated', performedBy: adminEmail, performedAt: now }];

  var sheet = dtrSheet;
  sheet.appendRow([
    dtrId, 1, empEmail, empName, empNumber,
    dept, desig, branch, month, year, cutOff,
    coverageStart, coverageEnd, 'Generated', adminEmail, now,
    '', '', '', '',
    JSON.stringify(days), JSON.stringify(summary), JSON.stringify(auditTrail)
  ]);

  // Notify employee
  createNotificationRecord(empEmail, 'DTR_GENERATED',
    'Your DTR for ' + (cutOff === '1st' ? '1st' : '2nd') + ' cut-off of ' +
    new Date(year, month-1, 1).toLocaleString('default', { month: 'long' }) + ' ' + year + ' is ready for review.',
    dtrId, 'dtrId');

  return _json({ success: true, message: 'DTR generated', dtrId: dtrId });
}

function regenerateDTR(dtrId, adminEmail) {
  if (!dtrId || !adminEmail) return _json({ success: false, message: 'dtrId and adminEmail required' });
  if (!isAdminRole(adminEmail)) return _json({ success: false, message: 'Unauthorized' });
  var sheet = initDTRSheet();
  var rows  = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) !== String(dtrId)) continue;
    // Block regeneration of acknowledged (finalized) records
    if (String(rows[i][13] || '').trim() === 'Acknowledged') {
      return _json({ success: false, message: 'This DTR has been acknowledged and is locked. It cannot be regenerated.' });
    }
    // Build a re-generate request from existing record
    var data = {
      adminEmail:    adminEmail,
      employeeEmail: String(rows[i][2]),
      employeeName:  String(rows[i][3]),
      month:         Number(rows[i][8]),
      year:          Number(rows[i][9]),
      cutOff:        String(rows[i][10])
    };
    // Mark old as Regenerated
    var oldAudit = [];
    try { oldAudit = JSON.parse(String(rows[i][22] || '[]')); } catch(e) {}
    var now = Utilities.formatDate(new Date(), 'Asia/Manila', "yyyy-MM-dd'T'HH:mm:ss'+08:00'");
    oldAudit.push({ action: 'Regenerated', performedBy: adminEmail, performedAt: now });
    sheet.getRange(i + 1, 14).setValue('Regenerated');
    sheet.getRange(i + 1, 23).setValue(JSON.stringify(oldAudit));
    // Generate fresh
    return generateDTR(data);
  }
  return _json({ success: false, message: 'DTR not found' });
}

// ── Build email → image URL map from Employee sheet (used by all DTR reads) ──
function getEmpImageMap() {
  var map = {};
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var empSheet = ss.getSheetByName('Employee');
  if (!empSheet) return map;
  var rows    = empSheet.getDataRange().getValues();
  var headers = rows[0];
  var cEmail  = findColumnIndex(headers, ['Email', 'Email Address']);
  var cImg    = findColumnIndex(headers, ['Image', 'Photo', 'Picture']);
  if (cEmail === -1 || cImg === -1) return map;
  for (var i = 1; i < rows.length; i++) {
    var em = String(rows[i][cEmail] || '').trim().toLowerCase();
    var img = String(rows[i][cImg]  || '').trim();
    if (em && img) map[em] = img;
  }
  return map;
}

// ── Shared admin-role check ─────────────────────────────────────
function isAdminRole(emailToCheck) {
  if (!emailToCheck) return false;
  var lower = emailToCheck.toLowerCase();
  if (lower === ADMIN_EMAIL) return true;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var empSheet = ss.getSheetByName('Employee');
  if (!empSheet) return false;
  var empRows = empSheet.getDataRange().getValues();
  for (var ei = 1; ei < empRows.length; ei++) {
    if (String(empRows[ei][0] || '').trim().toLowerCase() === lower) {
      var role = String(empRows[ei][3] || '').trim().toLowerCase();
      return (role === 'admin' || role === 'superadmin');
    }
  }
  return false;
}

// getDTRList – admin only; returns all DTR records
function getDTRList(email) {
  if (!isAdminRole(email)) return _json({ success: false, message: 'Unauthorized' });
  var imgMap  = getEmpImageMap();
  var sheet   = initDTRSheet();
  var rows    = sheet.getDataRange().getValues();
  var records = [];
  for (var i = 1; i < rows.length; i++) {
    var empEmail = String(rows[i][2] || '').trim().toLowerCase();
    records.push({
      id:             String(rows[i][0]),
      version:        Number(rows[i][1]),
      employeeEmail:  empEmail,
      employeeName:   String(rows[i][3]),
      employeeImage:  imgMap[empEmail] || '',
      department:     String(rows[i][5]),
      designation:    String(rows[i][6]),
      month:          Number(rows[i][8]),
      year:           Number(rows[i][9]),
      cutOff:         String(rows[i][10]),
      coverageStart:  String(rows[i][11]),
      coverageEnd:    String(rows[i][12]),
      status:         String(rows[i][13]),
      generatedBy:    String(rows[i][14]),
      generatedAt:    String(rows[i][15]),
      sentAt:         String(rows[i][16] || ''),
      acknowledgedAt: String(rows[i][18] || ''),
      acknowledgedBy: String(rows[i][19] || '')
    });
  }
  records.reverse();
  return _json({ success: true, records: records });
}

// getEmployeeDTRList – employee only; always scoped to caller's email
function getEmployeeDTRList(email) {
  if (!email) return _json({ success: false, message: 'Email required' });
  var emailLower = email.toLowerCase();
  var imgMap  = getEmpImageMap();
  var sheet   = initDTRSheet();
  var rows    = sheet.getDataRange().getValues();
  var records = [];
  for (var i = 1; i < rows.length; i++) {
    var empEmail = String(rows[i][2] || '').trim().toLowerCase();
    if (empEmail !== emailLower) continue;
    records.push({
      id:             String(rows[i][0]),
      version:        Number(rows[i][1]),
      employeeEmail:  empEmail,
      employeeName:   String(rows[i][3]),
      employeeImage:  imgMap[empEmail] || '',
      department:     String(rows[i][5]),
      designation:    String(rows[i][6]),
      month:          Number(rows[i][8]),
      year:           Number(rows[i][9]),
      cutOff:         String(rows[i][10]),
      coverageStart:  String(rows[i][11]),
      coverageEnd:    String(rows[i][12]),
      status:         String(rows[i][13]),
      generatedBy:    String(rows[i][14]),
      generatedAt:    String(rows[i][15]),
      sentAt:         String(rows[i][16] || ''),
      acknowledgedAt: String(rows[i][18] || ''),
      acknowledgedBy: String(rows[i][19] || '')
    });
  }
  records.reverse();
  return _json({ success: true, records: records });
}

function getDTRById(dtrId, requesterEmail) {
  var sheet = initDTRSheet();
  var rows  = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) !== String(dtrId)) continue;
    var empEmail = String(rows[i][2] || '').trim().toLowerCase();
    var reqLower = requesterEmail ? requesterEmail.toLowerCase() : '';
    var isAdmin  = isAdminRole(reqLower);
    var isOwner  = reqLower && reqLower === empEmail;
    if (!isAdmin && !isOwner) return _json({ success: false, message: 'Unauthorized' });

    var days = [], summary = {}, audit = [];
    try { days    = JSON.parse(String(rows[i][20] || '[]')); } catch(e) {}
    try { summary = JSON.parse(String(rows[i][21] || '{}')); } catch(e) {}
    try { audit   = JSON.parse(String(rows[i][22] || '[]')); } catch(e) {}

    // Mark viewed if employee first access
    if (isOwner && !rows[i][17]) {
      var now = Utilities.formatDate(new Date(), 'Asia/Manila', "yyyy-MM-dd'T'HH:mm:ss'+08:00'");
      sheet.getRange(i + 1, 18).setValue(now);
      if (String(rows[i][13]) === 'Sent to Employee') {
        sheet.getRange(i + 1, 14).setValue('Sent to Employee');
      }
    }

    // Pull issues
    var issueSheet = initDTRIssuesSheet();
    var issueRows  = issueSheet.getDataRange().getValues();
    var issues = [];
    for (var j = 1; j < issueRows.length; j++) {
      if (String(issueRows[j][1]) === String(dtrId)) {
        issues.push({
          id:           String(issueRows[j][0]),
          dtrId:        String(issueRows[j][1]),
          employeeEmail:String(issueRows[j][2]),
          employeeName: String(issueRows[j][3]),
          issueType:    String(issueRows[j][4]),
          comments:     String(issueRows[j][5]),
          submittedAt:  String(issueRows[j][6]),
          resolvedAt:   String(issueRows[j][7] || ''),
          resolvedBy:   String(issueRows[j][8] || '')
        });
      }
    }

    // Extract acknowledgedRole from audit trail note field
    var ackRole = '';
    for (var ai2 = audit.length - 1; ai2 >= 0; ai2--) {
      if (audit[ai2].action === 'Acknowledged' && audit[ai2].note) {
        ackRole = String(audit[ai2].note).indexOf('Administrator') !== -1 ? 'Administrator' : 'Employee';
        break;
      }
    }

    return _json({ success: true, record: {
      id:              String(rows[i][0]),
      version:         Number(rows[i][1]),
      employeeEmail:   empEmail,
      employeeName:    String(rows[i][3]),
      employeeNumber:  String(rows[i][4]),
      department:      String(rows[i][5]),
      designation:     String(rows[i][6]),
      branch:          String(rows[i][7] || ''),
      month:           Number(rows[i][8]),
      year:            Number(rows[i][9]),
      cutOff:          String(rows[i][10]),
      coverageStart:   String(rows[i][11]),
      coverageEnd:     String(rows[i][12]),
      status:          String(rows[i][13]),
      generatedBy:     String(rows[i][14]),
      generatedAt:     String(rows[i][15]),
      sentAt:          String(rows[i][16] || ''),
      viewedAt:        String(rows[i][17] || ''),
      acknowledgedAt:  String(rows[i][18] || ''),
      acknowledgedBy:  String(rows[i][19] || ''),
      acknowledgedRole:ackRole,
      employeeImage:   (getEmpImageMap()[empEmail] || ''),
      days:            days,
      summary:         summary,
      issues:          issues,
      auditTrail:      audit
    }});
  }
  return _json({ success: false, message: 'DTR not found' });
}

function acknowledgeDTR(dtrId, requesterEmail) {
  if (!dtrId || !requesterEmail) return _json({ success: false, message: 'Missing parameters' });
  var reqLower = requesterEmail.trim().toLowerCase();
  var sheet = initDTRSheet();
  var rows  = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) !== String(dtrId)) continue;
    var empEmail = String(rows[i][2] || '').trim().toLowerCase();
    var isAdmin  = isAdminRole(reqLower);
    var isOwner  = reqLower === empEmail;
    if (!isAdmin && !isOwner) return _json({ success: false, message: 'Unauthorized' });
    if (rows[i][18]) return _json({ success: false, message: 'DTR already acknowledged' });
    // Only allow acknowledgment when DTR has been sent or is in a reviewable state
    var status = String(rows[i][13] || '').trim();
    if (status === 'Regenerated') return _json({ success: false, message: 'Cannot acknowledge a superseded DTR version' });
    var now  = Utilities.formatDate(new Date(), 'Asia/Manila', "yyyy-MM-dd'T'HH:mm:ss+08:00");
    var role = isAdmin ? 'Administrator' : 'Employee';
    var version = Number(rows[i][1]) || 1;
    sheet.getRange(i + 1, 14).setValue('Acknowledged');
    sheet.getRange(i + 1, 19).setValue(now);             // col 19 = Acknowledged At
    sheet.getRange(i + 1, 20).setValue(String(rows[i][3])); // col 20 = Acknowledged By (name)
    var audit = [];
    try { audit = JSON.parse(String(rows[i][22] || '[]')); } catch(e) {}
    audit.push({
      action:      'Acknowledged',
      performedBy: requesterEmail,
      performedAt: now,
      note:        role + ' — Version ' + version
    });
    sheet.getRange(i + 1, 23).setValue(JSON.stringify(audit));
    // Notify admin (unless admin performed the acknowledgment)
    if (!isAdmin) {
      createNotificationRecord(ADMIN_EMAIL, 'DTR_GENERATED',
        String(rows[i][3]) + ' acknowledged their DTR for ' +
        String(rows[i][10]) + ' cut-off of ' +
        new Date(Number(rows[i][9]), Number(rows[i][8])-1, 1).toLocaleString('default', { month: 'long' }) +
        ' ' + String(rows[i][9]) + '.', dtrId, 'dtrId');
    } else {
      // Notify the employee that admin acknowledged on their behalf
      createNotificationRecord(empEmail, 'DTR_GENERATED',
        'Your DTR for ' + String(rows[i][10]) + ' cut-off has been acknowledged by an Administrator.',
        dtrId, 'dtrId');
    }
    return _json({ success: true, message: 'DTR acknowledged', acknowledgedAt: now, acknowledgedBy: requesterEmail, acknowledgedRole: role });
  }
  return _json({ success: false, message: 'DTR not found' });
}

function reportDTRIssue(data) {
  var dtrId      = String(data.dtrId || '');
  var empEmail   = String(data.employeeEmail || '').trim().toLowerCase();
  var issueType  = String(data.issueType || '');
  var comments   = String(data.comments || '');
  if (!dtrId || !empEmail || !issueType) return _json({ success: false, message: 'Missing parameters' });

  var sheet = initDTRSheet();
  var rows  = sheet.getDataRange().getValues();
  var empName = empEmail;
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === dtrId) {
      empName = String(rows[i][3] || empEmail);
      sheet.getRange(i + 1, 14).setValue('Returned for Review');
      var audit = [];
      try { audit = JSON.parse(String(rows[i][22] || '[]')); } catch(e) {}
      var now2 = Utilities.formatDate(new Date(), 'Asia/Manila', "yyyy-MM-dd'T'HH:mm:ss'+08:00'");
      audit.push({ action: 'Issue Reported', performedBy: empEmail, performedAt: now2, note: issueType + ': ' + comments });
      sheet.getRange(i + 1, 23).setValue(JSON.stringify(audit));
      break;
    }
  }

  var now = Utilities.formatDate(new Date(), 'Asia/Manila', "yyyy-MM-dd'T'HH:mm:ss'+08:00'");
  var issueSheet = initDTRIssuesSheet();
  issueSheet.appendRow([Utilities.getUuid(), dtrId, empEmail, empName, issueType, comments, now, '', '']);

  createNotificationRecord(ADMIN_EMAIL, 'DTR_ISSUE_SUBMITTED',
    empName + ' reported an issue on their DTR: ' + issueType, dtrId, 'dtrId');
  return _json({ success: true, message: 'Issue submitted' });
}

function resolveDTRIssue(issueId, adminEmail) {
  if (!issueId || !adminEmail) return _json({ success: false, message: 'Missing parameters' });
  var sheet = initDTRIssuesSheet();
  var rows  = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(issueId)) {
      var now = Utilities.formatDate(new Date(), 'Asia/Manila', "yyyy-MM-dd'T'HH:mm:ss'+08:00'");
      sheet.getRange(i + 1, 8).setValue(now);
      sheet.getRange(i + 1, 9).setValue(adminEmail);
      return _json({ success: true, message: 'Issue resolved' });
    }
  }
  return _json({ success: false, message: 'Issue not found' });
}

// ══════════════════════════════════════════════════════════════════
//  DTR VALIDATION
// ══════════════════════════════════════════════════════════════════

function initDTRValidationSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('DTRValidation');
  if (!sheet) {
    sheet = ss.insertSheet('DTRValidation');
    sheet.appendRow(['id','dtrId','date','validationStatus','remarks','validatedBy','validatedAt','auditTrail']);
  }
  return sheet;
}

function getDTRValidationData(dtrId, adminEmail) {
  if (!dtrId || !adminEmail) return _json({ success: false, message: 'Missing parameters' });
  if (!isAdminRole(adminEmail)) return _json({ success: false, message: 'Unauthorized' });
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dtrSheet = initDTRSheet();
  var dtrRows  = dtrSheet.getDataRange().getValues();
  var dtrRow = null;
  for (var di = 1; di < dtrRows.length; di++) {
    if (String(dtrRows[di][0]) === String(dtrId)) { dtrRow = dtrRows[di]; break; }
  }
  if (!dtrRow) return _json({ success: false, message: 'DTR not found' });

  var empEmail = String(dtrRow[2] || '').trim().toLowerCase();
  var month    = Number(dtrRow[8]);
  var year     = Number(dtrRow[9]);
  var cutOff   = String(dtrRow[10] || '').trim();
  var startDay = cutOff === '1st' ? 1 : 16;
  var endDay   = cutOff === '1st' ? 15 : new Date(year, month, 0).getDate();
  var coverageStart = month + '/' + startDay + '/' + year;
  var coverageEnd   = month + '/' + endDay   + '/' + year;

  // Parse existing DTR days
  var dtrDays = [];
  try { dtrDays = JSON.parse(String(dtrRow[20] || '[]')); } catch(e) {}

  // Load linked data
  var attSheet = ss.getSheetByName('Attendance');
  var attRows  = attSheet ? attSheet.getDataRange().getValues() : [];
  var tcSheet  = ss.getSheetByName('TimeCorrectionFilings');
  var tcRows   = tcSheet ? tcSheet.getDataRange().getValues() : [];
  var tcHeaders = tcRows.length > 0 ? tcRows[0] : [];
  var leaveSheet = ss.getSheetByName('LeaveApplications');
  var leaveRows  = leaveSheet ? leaveSheet.getDataRange().getValues() : [];
  var maSheet  = ss.getSheetByName('MealAllowance');
  var maRows   = maSheet ? maSheet.getDataRange().getValues() : [];
  var wfhSheet = ss.getSheetByName('WorkFromHome');
  var wfhRows  = wfhSheet ? wfhSheet.getDataRange().getValues() : [];

  // Build date helpers
  function dateKey(d) { return (d.getMonth()+1) + '/' + d.getDate() + '/' + d.getFullYear(); }
  function normalizeDate(val) {
    if (!val) return '';
    if (val instanceof Date) return dateKey(val);
    var d = new Date(String(val));
    return isNaN(d.getTime()) ? String(val) : dateKey(d);
  }

  // Time Corrections indexed by attendance date
  var tcByDate = {};
  for (var ti = 1; ti < tcRows.length; ti++) {
    var tcEmail = String(tcRows[ti][findColumnIndex(tcHeaders, ['Email'])] || '').trim().toLowerCase();
    if (tcEmail !== empEmail) continue;
    var tcDate = normalizeDate(tcRows[ti][findColumnIndex(tcHeaders, ['Attendance Date'])]);
    if (!tcDate) continue;
    if (!tcByDate[tcDate]) tcByDate[tcDate] = [];
    tcByDate[tcDate].push({
      id: String(tcRows[ti][0] || ''),
      status: String(tcRows[ti][findColumnIndex(tcHeaders, ['Status'])] || ''),
      reason: String(tcRows[ti][findColumnIndex(tcHeaders, ['Reason'])] || ''),
      originalTimeIn: String(tcRows[ti][findColumnIndex(tcHeaders, ['Original Time In'])] || ''),
      originalTimeOut: String(tcRows[ti][findColumnIndex(tcHeaders, ['Original Time Out'])] || ''),
      correctedTimeIn: String(tcRows[ti][findColumnIndex(tcHeaders, ['Corrected Time In'])] || ''),
      correctedTimeOut: String(tcRows[ti][findColumnIndex(tcHeaders, ['Corrected Time Out'])] || ''),
      documentUrl: String(tcRows[ti][findColumnIndex(tcHeaders, ['Document URL'])] || '')
    });
  }

  // Leaves indexed by covered dates
  var leaveByDate = {};
  for (var li = 1; li < leaveRows.length; li++) {
    var lEmail  = String(leaveRows[li][1] || '').trim().toLowerCase();
    if (lEmail !== empEmail) continue;
    var lStart = new Date(String(leaveRows[li][4] || ''));
    var lEnd   = new Date(String(leaveRows[li][5] || ''));
    if (isNaN(lStart.getTime()) || isNaN(lEnd.getTime())) continue;
    var lObj = {
      id: String(leaveRows[li][0] || ''),
      leaveType: String(leaveRows[li][3] || ''),
      status: String(leaveRows[li][13] || ''),
      startDate: normalizeDate(leaveRows[li][4]),
      endDate: normalizeDate(leaveRows[li][5]),
      totalDays: Number(leaveRows[li][8] || 0),
      reason: String(leaveRows[li][10] || '')
    };
    var cur = new Date(lStart);
    while (cur <= lEnd) {
      var lKey = dateKey(cur);
      if (!leaveByDate[lKey]) leaveByDate[lKey] = [];
      leaveByDate[lKey].push(lObj);
      cur.setDate(cur.getDate() + 1);
    }
  }

  // Meal Allowances indexed by date
  var maByDate = {};
  for (var mi = 1; mi < maRows.length; mi++) {
    var mEmail = String(maRows[mi][2] || '').trim().toLowerCase();
    if (mEmail !== empEmail) continue;
    var mTs = maRows[mi][10];
    var mDate = normalizeDate(mTs);
    if (!mDate) continue;
    if (!maByDate[mDate]) maByDate[mDate] = [];
    maByDate[mDate].push({
      id: String(maRows[mi][0] || ''),
      sequence: Number(maRows[mi][4] || 1),
      imageUrl: String(maRows[mi][6] || ''),
      imageId: String(maRows[mi][5] || ''),
      address: String(maRows[mi][9] || ''),
      timestamp: mTs instanceof Date ? Utilities.formatDate(mTs, 'Asia/Manila', "yyyy-MM-dd'T'HH:mm:ss'+08:00'") : String(mTs || ''),
      remarks: String(maRows[mi][11] || '')
    });
  }

  // WFH indexed by attendance date
  var wfhByDate = {};
  for (var wi = 1; wi < wfhRows.length; wi++) {
    var wEmail = String(wfhRows[wi][2] || '').trim().toLowerCase();
    if (wEmail !== empEmail) continue;
    var wDate = normalizeDate(wfhRows[wi][6]);
    if (!wDate) continue;
    if (!wfhByDate[wDate]) wfhByDate[wDate] = [];
    var wAttach = [];
    try { wAttach = JSON.parse(String(wfhRows[wi][21] || '[]')); } catch(e) {}
    wfhByDate[wDate].push({
      id: String(wfhRows[wi][0] || ''),
      status: String(wfhRows[wi][22] || ''),
      workDescription: String(wfhRows[wi][9] || ''),
      eodSummary: String(wfhRows[wi][14] || ''),
      eodSubmittedAt: String(wfhRows[wi][20] || ''),
      attachments: wAttach
    });
  }

  // Load existing validation records
  var valSheet = initDTRValidationSheet();
  var valRows  = valSheet.getDataRange().getValues();
  var valByDate = {};
  for (var vi = 1; vi < valRows.length; vi++) {
    if (String(valRows[vi][1]) !== String(dtrId)) continue;
    var vDate = String(valRows[vi][2] || '');
    valByDate[vDate] = {
      rowIndex: vi + 1,
      validationStatus: String(valRows[vi][3] || 'Pending'),
      remarks: String(valRows[vi][4] || ''),
      validatedBy: String(valRows[vi][5] || ''),
      validatedAt: String(valRows[vi][6] || ''),
      auditTrail: valRows[vi][7] || '[]'
    };
  }

  // Build validation day records
  var days = [];
  for (var dd = 0; dd < dtrDays.length; dd++) {
    var d = dtrDays[dd];
    var dKey = d.date || '';
    var val = valByDate[dKey] || {};
    var auditArr = [];
    try { auditArr = JSON.parse(String(val.auditTrail || '[]')); } catch(e) {}

    days.push({
      date: dKey,
      dayOfWeek: d.dayOfWeek || '',
      timeIn: d.timeIn || '',
      timeOut: d.timeOut || '',
      workingHours: d.workingHours || 0,
      attendanceStatus: d.status || '',
      timeInImageId: d.timeInImageId || '',
      timeInImageUrl: d.timeInImageUrl || '',
      timeOutImageId: d.timeOutImageId || '',
      timeOutImageUrl: d.timeOutImageUrl || '',
      latitude: d.latitude || 0,
      longitude: d.longitude || 0,
      address: d.address || '',
      deviceInfo: d.deviceUsed || '',
      timeInTimestamp: d.timeInTimestamp || '',
      timeOutTimestamp: d.timeOutTimestamp || '',
      validationStatus: val.validationStatus || 'Pending',
      validationRemarks: val.remarks || '',
      validatedBy: val.validatedBy || '',
      validatedAt: val.validatedAt || '',
      mealAllowances: maByDate[dKey] || [],
      timeCorrections: tcByDate[dKey] || [],
      leaves: leaveByDate[dKey] || [],
      wfh: wfhByDate[dKey] || []
    });
  }

  // Collect global validation audit trail
  var globalAudit = [];
  for (var vk in valByDate) {
    try {
      var arr = JSON.parse(String(valByDate[vk].auditTrail || '[]'));
      for (var ai = 0; ai < arr.length; ai++) {
        arr[ai].field = arr[ai].field || vk;
        globalAudit.push(arr[ai]);
      }
    } catch(e) {}
  }
  globalAudit.sort(function(a, b) { return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(); });

  var imgMap = getEmpImageMap();

  return _json({
    success: true,
    data: {
      dtrId: dtrId,
      employeeEmail: empEmail,
      employeeName: String(dtrRow[3] || ''),
      employeeImage: imgMap[empEmail] || '',
      department: String(dtrRow[5] || ''),
      designation: String(dtrRow[6] || ''),
      month: month,
      year: year,
      cutOff: cutOff,
      coverageStart: coverageStart,
      coverageEnd: coverageEnd,
      days: days,
      auditTrail: globalAudit
    }
  });
}

function validateDTRDay(data) {
  if (!data || !data.dtrId || !data.date || !data.adminEmail)
    return _json({ success: false, message: 'Missing parameters' });
  if (!isAdminRole(data.adminEmail))
    return _json({ success: false, message: 'Unauthorized' });

  var now = Utilities.formatDate(new Date(), 'Asia/Manila', "yyyy-MM-dd'T'HH:mm:ss'+08:00'");
  var sheet = initDTRValidationSheet();
  var rows = sheet.getDataRange().getValues();

  // Find existing validation row for this dtrId + date
  var existingRow = -1;
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][1]) === String(data.dtrId) && String(rows[i][2]) === String(data.date)) {
      existingRow = i + 1;
      break;
    }
  }

  var prevStatus = 'Pending';
  var prevRemarks = '';
  var auditArr = [];

  if (existingRow > 0) {
    prevStatus = String(rows[existingRow - 1][3] || 'Pending');
    prevRemarks = String(rows[existingRow - 1][4] || '');
    try { auditArr = JSON.parse(String(rows[existingRow - 1][7] || '[]')); } catch(e) {}
  }

  var newStatus = data.validationStatus || 'Validated';
  var newRemarks = data.remarks || '';

  auditArr.push({
    action: newStatus === 'Flagged' ? 'FLAGGED' : newStatus === 'Validated' ? 'VALIDATED' : 'STATUS_CHANGED',
    by: data.adminEmail,
    timestamp: now,
    field: data.date,
    previousValue: prevStatus,
    updatedValue: newStatus,
    remarks: newRemarks
  });

  if (existingRow > 0) {
    sheet.getRange(existingRow, 4).setValue(newStatus);
    sheet.getRange(existingRow, 5).setValue(newRemarks);
    sheet.getRange(existingRow, 6).setValue(data.adminEmail);
    sheet.getRange(existingRow, 7).setValue(now);
    sheet.getRange(existingRow, 8).setValue(JSON.stringify(auditArr));
  } else {
    sheet.appendRow([
      Utilities.getUuid(), data.dtrId, data.date, newStatus,
      newRemarks, data.adminEmail, now, JSON.stringify(auditArr)
    ]);
  }

  return _json({
    success: true,
    message: 'Day ' + data.date + ' marked as ' + newStatus,
    validationStatus: newStatus,
    validatedBy: data.adminEmail,
    validatedAt: now
  });
}

// ══════════════════════════════════════════════════════════════════
//  GENERATED DTR — NEW WORKFLOW
// ══════════════════════════════════════════════════════════════════

function initGeneratedDTRSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('GeneratedDTR');
  if (!sheet) {
    sheet = ss.insertSheet('GeneratedDTR');
    sheet.appendRow([
      'ID', 'Version', 'Employee Email', 'Employee Name', 'Employee Number',
      'Department', 'Designation', 'Branch', 'Month', 'Year', 'Cut-Off',
      'Coverage Start', 'Coverage End', 'Status', 'Generated By', 'Generated At',
      'Sent At', 'Acknowledged At', 'Acknowledged By', 'Reopened By', 'Reopened At',
      'Days JSON', 'Summary JSON', 'Audit Trail JSON'
    ]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function generateNewDTR(data) {
  var adminEmail = String(data.adminEmail || '').trim().toLowerCase();
  var empEmail   = String(data.employeeEmail || '').trim().toLowerCase();
  var month      = parseInt(data.month, 10);
  var year       = parseInt(data.year, 10);
  var cutOff     = String(data.cutOff || '1st').trim();

  if (!adminEmail || !empEmail || !month || !year)
    return _json({ success: false, message: 'Missing required parameters' });
  if (!isAdminRole(adminEmail))
    return _json({ success: false, message: 'Unauthorized' });

  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Coverage dates
  var startDay = cutOff === '1st' ? 1 : 16;
  var endDay   = cutOff === '1st' ? 15 : new Date(year, month, 0).getDate();
  var coverageStart = month + '/' + startDay + '/' + year;
  var coverageEnd   = month + '/' + endDay   + '/' + year;
  var coverageStartTs = new Date(year, month - 1, startDay).getTime();
  var coverageEndTs   = new Date(year, month - 1, endDay, 23, 59, 59, 999).getTime();

  // Duplicate check
  var dtrSheet = initGeneratedDTRSheet();
  var existingRows = dtrSheet.getDataRange().getValues();
  for (var di = 1; di < existingRows.length; di++) {
    var exEmail  = String(existingRows[di][2] || '').trim().toLowerCase();
    var exMonth  = Number(existingRows[di][8]);
    var exYear   = Number(existingRows[di][9]);
    var exCutOff = String(existingRows[di][10] || '').trim();
    var exStatus = String(existingRows[di][13] || '').trim();
    if (exEmail === empEmail && exMonth === month && exYear === year && exCutOff === cutOff && exStatus !== 'Regenerated') {
      return _json({ success: false, alreadyExists: true, dtrId: String(existingRows[di][0]), message: 'A Generated DTR already exists for this period.' });
    }
  }

  // Helper functions
  function dateKey(d) { return (d.getMonth()+1) + '/' + d.getDate() + '/' + d.getFullYear(); }
  var dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

  // Collect attendance events
  var attSheet = ss.getSheetByName('Attendance');
  var attRows  = attSheet ? attSheet.getDataRange().getValues() : [];
  var allEvents = [];
  for (var ai = 1; ai < attRows.length; ai++) {
    var rowEmail = String(attRows[ai][3] || '').trim().toLowerCase();
    if (rowEmail !== empEmail) continue;
    var action = String(attRows[ai][4] || '').trim();
    if (action !== 'TIME_IN' && action !== 'TIME_OUT') continue;
    var tsRaw = attRows[ai][5];
    var tsMs  = tsRaw instanceof Date ? tsRaw.getTime() : new Date(String(tsRaw || '')).getTime();
    if (isNaN(tsMs)) continue;
    var tsStr = tsRaw instanceof Date
      ? Utilities.formatDate(tsRaw, 'Asia/Manila', "yyyy-MM-dd'T'HH:mm:ss+08:00")
      : String(tsRaw || '');
    // Combine col 6 (Date) + col 7 (Time) from Attendance sheet for consistent display
    // col 7 (Time) may be a Sheets time serial that serializes to "Dec 30 1899" — use the Date object's time portion only
    var colDate = attRows[ai][6]; // e.g. "7/7/2026" or Date object
    var colTime = attRows[ai][7]; // e.g. "8:30 AM" or Date object (time serial)
    var datePart = colDate instanceof Date
      ? Utilities.formatDate(colDate, 'Asia/Manila', 'M/d/yyyy')
      : String(colDate || '');
    var timePart = colTime instanceof Date
      ? Utilities.formatDate(colTime, 'Asia/Manila', 'h:mm a')
      : (String(colTime || '').match(/^\d{1,2}:\d{2}/) ? String(colTime) : (function() {
          var m = tsStr.match(/T(\d{2}):(\d{2})/);
          if (m) { var h = parseInt(m[1], 10); var ampm = h >= 12 ? 'PM' : 'AM'; return (h % 12 || 12) + ':' + m[2] + ' ' + ampm; }
          return '';
        })());
    var timeDisplay = (datePart && timePart) ? datePart + ' ' + timePart : (timePart || datePart);
    allEvents.push({
      action: action, tsMs: tsMs, timestamp: tsStr, date: dateKey(new Date(tsMs)),
      time: timeDisplay,
      latitude: Number(attRows[ai][8] || 0), longitude: Number(attRows[ai][9] || 0),
      address: String(attRows[ai][11] || ''), deviceInfo: String(attRows[ai][12] || ''),
      imageId: String(attRows[ai][15] || ''), imageUrl: String(attRows[ai][16] || '')
    });
  }
  allEvents.sort(function(a, b) { return a.tsMs - b.tsMs; });

  // Sequential pairing
  var pairs = [];
  var openIn = null;
  for (var ei = 0; ei < allEvents.length; ei++) {
    var ev = allEvents[ei];
    if (ev.action === 'TIME_IN') {
      if (openIn && openIn.tsMs >= coverageStartTs && openIn.tsMs <= coverageEndTs) {
        pairs.push({ timeIn: openIn, timeOut: null });
      }
      openIn = ev;
    } else {
      if (openIn) {
        if (openIn.tsMs >= coverageStartTs && openIn.tsMs <= coverageEndTs) {
          pairs.push({ timeIn: openIn, timeOut: ev });
        }
        openIn = null;
      }
    }
  }
  if (openIn && openIn.tsMs >= coverageStartTs && openIn.tsMs <= coverageEndTs) {
    pairs.push({ timeIn: openIn, timeOut: null });
  }

  var pairedDates = {};
  for (var pi = 0; pi < pairs.length; pi++) { pairedDates[pairs[pi].timeIn.date] = true; }

  // Load leaves
  var leaveSheet = ss.getSheetByName('LeaveApplications');
  var leaveRows  = leaveSheet ? leaveSheet.getDataRange().getValues() : [];
  var approvedLeaveDates = {};
  var leaveByDate = {};
  for (var li = 1; li < leaveRows.length; li++) {
    var lEmail  = String(leaveRows[li][1] || '').trim().toLowerCase();
    if (lEmail !== empEmail) continue;
    var lStatus = String(leaveRows[li][13] || '').trim();
    var lStart = new Date(String(leaveRows[li][4] || ''));
    var lEnd   = new Date(String(leaveRows[li][5] || ''));
    if (isNaN(lStart.getTime()) || isNaN(lEnd.getTime())) continue;
    var lObj = {
      id: String(leaveRows[li][0] || ''), leaveType: String(leaveRows[li][3] || ''),
      status: lStatus, startDate: String(leaveRows[li][4] || ''), endDate: String(leaveRows[li][5] || ''),
      totalDays: Number(leaveRows[li][8] || 0)
    };
    var cur = new Date(lStart);
    while (cur <= lEnd) {
      var lKey = dateKey(cur);
      if (lStatus === 'Approved') approvedLeaveDates[lKey] = true;
      if (!leaveByDate[lKey]) leaveByDate[lKey] = [];
      leaveByDate[lKey].push(lObj);
      cur.setDate(cur.getDate() + 1);
    }
  }

  // Load time corrections
  var tcSheet  = ss.getSheetByName('TimeCorrectionFilings');
  var tcRows   = tcSheet ? tcSheet.getDataRange().getValues() : [];
  var tcHeaders = tcRows.length > 0 ? tcRows[0] : [];
  var tcByDate = {};
  for (var ti = 1; ti < tcRows.length; ti++) {
    var tcEmail = String(tcRows[ti][findColumnIndex(tcHeaders, ['Email'])] || '').trim().toLowerCase();
    if (tcEmail !== empEmail) continue;
    var tcDateRaw = tcRows[ti][findColumnIndex(tcHeaders, ['Attendance Date'])];
    var tcDate = tcDateRaw ? (tcDateRaw instanceof Date ? dateKey(tcDateRaw) : dateKey(new Date(String(tcDateRaw)))) : '';
    if (!tcDate) continue;
    if (!tcByDate[tcDate]) tcByDate[tcDate] = [];
    tcByDate[tcDate].push({
      id: String(tcRows[ti][0] || ''), status: String(tcRows[ti][findColumnIndex(tcHeaders, ['Status'])] || ''),
      reason: String(tcRows[ti][findColumnIndex(tcHeaders, ['Reason'])] || ''),
      originalTimeIn: String(tcRows[ti][findColumnIndex(tcHeaders, ['Original Time In'])] || ''),
      originalTimeOut: String(tcRows[ti][findColumnIndex(tcHeaders, ['Original Time Out'])] || ''),
      correctedTimeIn: String(tcRows[ti][findColumnIndex(tcHeaders, ['Corrected Time In'])] || ''),
      correctedTimeOut: String(tcRows[ti][findColumnIndex(tcHeaders, ['Corrected Time Out'])] || ''),
      documentUrl: String(tcRows[ti][findColumnIndex(tcHeaders, ['Document URL'])] || '')
    });
  }

  // Load meal allowances
  var maSheet  = ss.getSheetByName('MealAllowance');
  var maRows   = maSheet ? maSheet.getDataRange().getValues() : [];
  var maByDate = {};
  for (var mi = 1; mi < maRows.length; mi++) {
    var mEmail = String(maRows[mi][2] || '').trim().toLowerCase();
    if (mEmail !== empEmail) continue;
    var mTs = maRows[mi][10];
    var mDate = mTs ? (mTs instanceof Date ? dateKey(mTs) : dateKey(new Date(String(mTs)))) : '';
    if (!mDate) continue;
    if (!maByDate[mDate]) maByDate[mDate] = [];
    maByDate[mDate].push({
      id: String(maRows[mi][0] || ''), sequence: Number(maRows[mi][4] || 1),
      imageUrl: String(maRows[mi][6] || ''), imageId: String(maRows[mi][5] || ''),
      address: String(maRows[mi][9] || ''),
      timestamp: mTs instanceof Date ? Utilities.formatDate(mTs, 'Asia/Manila', "yyyy-MM-dd'T'HH:mm:ss'+08:00'") : String(mTs || ''),
      remarks: String(maRows[mi][11] || '')
    });
  }

  // Load WFH
  var wfhSheet = ss.getSheetByName('WorkFromHome');
  var wfhRows  = wfhSheet ? wfhSheet.getDataRange().getValues() : [];
  var wfhByDate = {};
  for (var wi = 1; wi < wfhRows.length; wi++) {
    var wEmail = String(wfhRows[wi][2] || '').trim().toLowerCase();
    if (wEmail !== empEmail) continue;
    var wDateRaw = wfhRows[wi][6];
    var wDate = wDateRaw ? (wDateRaw instanceof Date ? dateKey(wDateRaw) : dateKey(new Date(String(wDateRaw)))) : '';
    if (!wDate) continue;
    if (!wfhByDate[wDate]) wfhByDate[wDate] = [];
    var wAttach = [];
    try { wAttach = JSON.parse(String(wfhRows[wi][21] || '[]')); } catch(e) {}
    wfhByDate[wDate].push({
      id: String(wfhRows[wi][0] || ''), status: String(wfhRows[wi][22] || ''),
      workDescription: String(wfhRows[wi][9] || ''),
      eodSummary: String(wfhRows[wi][14] || ''), eodSubmittedAt: String(wfhRows[wi][20] || ''),
      attachments: wAttach
    });
  }

  // Load approved OT records for this employee
  var otByDate = {};
  var otSheet2 = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('OvertimeFiling');
  if (otSheet2) {
    var otRows2 = otSheet2.getDataRange().getValues();
    for (var oi = 1; oi < otRows2.length; oi++) {
      if (String(otRows2[oi][1]).trim().toLowerCase() !== empEmail) continue;
      if (String(otRows2[oi][15]) !== 'Approved') continue;
      var otDateRaw = otRows2[oi][5];
      var otD = otDateRaw instanceof Date ? dateKey(otDateRaw) : dateKey(new Date(String(otDateRaw)));
      if (!otD) continue;
      if (!otByDate[otD]) otByDate[otD] = [];
      var otApprovedHrs = otRows2[oi][18] !== '' && otRows2[oi][18] !== null ? Number(otRows2[oi][18]) : Number(otRows2[oi][11] || 0);
      var otApprovedAt = String(otRows2[oi][19] || '');
      otByDate[otD].push({
        id: String(otRows2[oi][0]),
        otDate: otD,
        otType: String(otRows2[oi][6]),
        status: 'Approved',
        preShiftStart: String(otRows2[oi][7] || ''), preShiftEnd: String(otRows2[oi][8] || ''),
        postShiftStart: String(otRows2[oi][9] || ''), postShiftEnd: String(otRows2[oi][10] || ''),
        totalRequestedHours: Number(otRows2[oi][11] || 0),
        approvedHours: otApprovedHrs,
        reason: String(otRows2[oi][12] || ''),
        approverEmail: String(otRows2[oi][16] || ''),
        approverName:  String(otRows2[oi][17] || ''),
        approvedAt:    otApprovedAt,
        attachmentUrl: String(otRows2[oi][13] || '')
      });
    }
  }

  // Build day records — NO automatic late computation
  var days = [];
  var summary = { presentDays: 0, absentDays: 0, holidays: 0, restDays: 0, leaveDays: 0,
    officialBusinessDays: 0, wfhDays: 0, totalHoursWorked: 0, totalLateHours: 0,
    totalLateMinutes: 0, totalApprovedOT: 0, totalActualOT: 0, totalValidatedOT: 0, mealEligibleDays: 0 };

  // 1. Rows for attendance pairs
  for (var pi2 = 0; pi2 < pairs.length; pi2++) {
    var pair = pairs[pi2];
    var tin  = pair.timeIn;
    var tout = pair.timeOut;
    var tinDate = new Date(tin.tsMs);
    var dow = tinDate.getDay();
    var workHours = 0;
    if (tout) {
      var diff = (new Date(tout.timestamp).getTime() - new Date(tin.timestamp).getTime()) / 3600000;
      if (!isNaN(diff) && diff > 0) workHours = Math.round(diff * 100) / 100;
    }
    var hasMeal = (maByDate[tin.date] && maByDate[tin.date].length > 0);
    var classification = (dow === 0 || dow === 6) ? 'Rest Day' : 'Present';
    // Check if WFH covers this date
    if (wfhByDate[tin.date] && wfhByDate[tin.date].length > 0) {
      var anyApproved = false;
      for (var wc = 0; wc < wfhByDate[tin.date].length; wc++) {
        if (wfhByDate[tin.date][wc].status === 'Approved') { anyApproved = true; break; }
      }
      if (anyApproved) classification = 'Work From Home';
    }

    if (classification === 'Present') summary.presentDays++;
    else if (classification === 'Rest Day') summary.restDays++;
    else if (classification === 'Work From Home') summary.wfhDays++;
    summary.totalHoursWorked += workHours;
    if (hasMeal) summary.mealEligibleDays++;

    // Compute approvedOT and actualOT for this day
    var dayOTs = otByDate[tin.date] || [];
    var approvedOTHours = 0;
    for (var oi2 = 0; oi2 < dayOTs.length; oi2++) { approvedOTHours += Number(dayOTs[oi2].approvedHours || 0); }
    // actualOT = hours worked beyond standard 8h shift (only if positive)
    var actualOTHours = workHours > 8 ? Math.round((workHours - 8) * 100) / 100 : 0;
    summary.totalApprovedOT  += approvedOTHours;
    summary.totalActualOT    += actualOTHours;
    summary.totalValidatedOT += approvedOTHours;

    days.push({
      date: tin.date, dayOfWeek: dayNames[dow],
      timeIn: tin.time, timeOut: tout ? tout.time : '',
      totalHoursWorked: workHours, actualOT: actualOTHours, approvedOT: approvedOTHours,
      validatedOT: approvedOTHours,
      mealEligibility: hasMeal, attendanceClassification: classification, attendanceRemarks: '',
      lateHours: 0, lateMinutes: 0,
      originalRecord: {
        timeIn: tin.timestamp, timeOut: tout ? tout.timestamp : '',
        latitude: tin.latitude, longitude: tin.longitude, address: tin.address,
        deviceInfo: tin.deviceInfo, timeInImageId: tin.imageId, timeInImageUrl: tin.imageUrl,
        timeOutImageId: tout ? tout.imageId : '', timeOutImageUrl: tout ? tout.imageUrl : ''
      },
      sourceAttendanceIds: [], sourceOTId: dayOTs.length > 0 ? dayOTs[0].id : '',
      sourceMealAllowanceIds: (maByDate[tin.date] || []).map(function(m) { return m.id; }),
      mealAllowances: maByDate[tin.date] || [],
      timeCorrections: tcByDate[tin.date] || [],
      leaves: leaveByDate[tin.date] || [],
      wfh: wfhByDate[tin.date] || [],
      overtimes: dayOTs
    });
  }

  // 2. Fill absent/leave/rest/holiday rows for calendar days with no pair
  for (var day2 = startDay; day2 <= endDay; day2++) {
    var dt2  = new Date(year, month - 1, day2);
    var dow2 = dt2.getDay();
    var dKey2 = dateKey(dt2);
    if (pairedDates[dKey2]) continue;

    var isRest2 = (dow2 === 0 || dow2 === 6);
    var isLeave2 = approvedLeaveDates[dKey2] || false;
    var hasWfh2 = wfhByDate[dKey2] && wfhByDate[dKey2].length > 0;
    var classification2;
    if (isRest2) { classification2 = 'Rest Day'; summary.restDays++; }
    else if (isLeave2) { classification2 = 'Approved Leave'; summary.leaveDays++; }
    else if (hasWfh2) { classification2 = 'Work From Home'; summary.wfhDays++; }
    else { classification2 = 'Absent'; summary.absentDays++; }

    var dayOTs2 = otByDate[dKey2] || [];
    var approvedOTHours2 = 0;
    for (var oi3 = 0; oi3 < dayOTs2.length; oi3++) { approvedOTHours2 += Number(dayOTs2[oi3].approvedHours || 0); }
    summary.totalApprovedOT  += approvedOTHours2;
    summary.totalValidatedOT += approvedOTHours2;

    days.push({
      date: dKey2, dayOfWeek: dayNames[dow2],
      timeIn: '', timeOut: '', totalHoursWorked: 0, actualOT: 0, approvedOT: approvedOTHours2,
      validatedOT: approvedOTHours2,
      mealEligibility: false, attendanceClassification: classification2, attendanceRemarks: '',
      lateHours: 0, lateMinutes: 0,
      originalRecord: { timeIn: '', timeOut: '' },
      sourceAttendanceIds: [], sourceOTId: dayOTs2.length > 0 ? dayOTs2[0].id : '',
      sourceMealAllowanceIds: [],
      mealAllowances: maByDate[dKey2] || [],
      timeCorrections: tcByDate[dKey2] || [],
      leaves: leaveByDate[dKey2] || [],
      wfh: wfhByDate[dKey2] || [],
      overtimes: dayOTs2
    });
  }

  // Sort days chronologically
  days.sort(function(a, b) {
    var ta = a.originalRecord && a.originalRecord.timeIn ? new Date(a.originalRecord.timeIn).getTime() : new Date(a.date).getTime();
    var tb = b.originalRecord && b.originalRecord.timeIn ? new Date(b.originalRecord.timeIn).getTime() : new Date(b.date).getTime();
    return ta - tb;
  });

  summary.totalHoursWorked = Math.round(summary.totalHoursWorked * 100) / 100;

  // Get employee info
  var empSheet = ss.getSheetByName('Employee');
  var empRows  = empSheet ? empSheet.getDataRange().getValues() : [];
  var empName = empEmail, dept = '', desig = '', empNumber = '';
  for (var ei2 = 1; ei2 < empRows.length; ei2++) {
    if (String(empRows[ei2][0] || '').trim().toLowerCase() === empEmail) {
      empName   = String(empRows[ei2][1] || empName);
      dept      = String(empRows[ei2][5] || '');
      desig     = String(empRows[ei2][6] || '');
      empNumber = String(empRows[ei2][2] || '');
      break;
    }
  }

  var now = Utilities.formatDate(new Date(), 'Asia/Manila', "yyyy-MM-dd'T'HH:mm:ss'+08:00'");
  var dtrId = Utilities.getUuid();
  var auditTrail = [];

  dtrSheet.appendRow([
    dtrId, 1, empEmail, empName, empNumber,
    dept, desig, '', month, year, cutOff,
    coverageStart, coverageEnd, 'Generated', adminEmail, now,
    '', '', '', '', '',
    JSON.stringify(days), JSON.stringify(summary), JSON.stringify(auditTrail)
  ]);

  createNotificationRecord(empEmail, 'DTR_GENERATED',
    'Your DTR for ' + (cutOff === '1st' ? '1st' : '2nd') + ' cut-off of ' +
    new Date(year, month-1, 1).toLocaleString('default', { month: 'long' }) + ' ' + year + ' has been generated.',
    dtrId, 'dtrId');

  return _json({ success: true, message: 'DTR generated', dtrId: dtrId });
}

function getGeneratedDTRById(dtrId, requesterEmail) {
  var sheet = initGeneratedDTRSheet();
  var rows  = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) !== String(dtrId)) continue;
    var empEmail = String(rows[i][2] || '').trim().toLowerCase();
    var reqLower = requesterEmail ? requesterEmail.toLowerCase() : '';
    var isAdmin  = isAdminRole(reqLower);
    var isOwner  = reqLower && reqLower === empEmail;
    if (!isAdmin && !isOwner) return _json({ success: false, message: 'Unauthorized' });

    var days = [], summary = {}, audit = [];
    try { days    = JSON.parse(String(rows[i][21] || '[]')); } catch(e) {}
    try { summary = JSON.parse(String(rows[i][22] || '{}')); } catch(e) {}
    try { audit   = JSON.parse(String(rows[i][23] || '[]')); } catch(e) {}

    var imgMap = getEmpImageMap();
    return _json({ success: true, data: {
      id: String(rows[i][0]), version: Number(rows[i][1]),
      employeeEmail: empEmail, employeeName: String(rows[i][3]),
      employeeId: String(rows[i][4] || ''), employeeImage: imgMap[empEmail] || '',
      department: String(rows[i][5]), designation: String(rows[i][6]),
      month: Number(rows[i][8]), year: Number(rows[i][9]), cutOff: String(rows[i][10]),
      coverageStart: String(rows[i][11]), coverageEnd: String(rows[i][12]),
      status: String(rows[i][13]), generatedBy: String(rows[i][14]), generatedAt: String(rows[i][15]),
      acknowledgedBy: String(rows[i][18] || ''), acknowledgedAt: String(rows[i][17] || ''),
      reopenedBy: String(rows[i][19] || ''), reopenedAt: String(rows[i][20] || ''),
      days: days, summary: summary, auditTrail: audit
    }});
  }
  return _json({ success: false, message: 'Generated DTR not found' });
}

function getGeneratedDTRListGAS(email) {
  if (!isAdminRole(email)) {
    // Employee: return only their own
    var emailLower = email.toLowerCase();
    var imgMap = getEmpImageMap();
    var sheet = initGeneratedDTRSheet();
    var rows  = sheet.getDataRange().getValues();
    var records = [];
    for (var i = 1; i < rows.length; i++) {
      var empEmail = String(rows[i][2] || '').trim().toLowerCase();
      if (empEmail !== emailLower) continue;
      records.push({
        id: String(rows[i][0]), version: Number(rows[i][1]),
        employeeEmail: empEmail, employeeName: String(rows[i][3]),
        employeeImage: imgMap[empEmail] || '',
        department: String(rows[i][5]), designation: String(rows[i][6]),
        month: Number(rows[i][8]), year: Number(rows[i][9]), cutOff: String(rows[i][10]),
        coverageStart: String(rows[i][11]), coverageEnd: String(rows[i][12]),
        status: String(rows[i][13]), generatedBy: String(rows[i][14]), generatedAt: String(rows[i][15]),
        days: [], summary: {}, auditTrail: []
      });
    }
    records.reverse();
    return _json({ success: true, records: records });
  }

  // Admin: return all
  var imgMap2 = getEmpImageMap();
  var sheet2 = initGeneratedDTRSheet();
  var rows2  = sheet2.getDataRange().getValues();
  var records2 = [];
  for (var i2 = 1; i2 < rows2.length; i2++) {
    var empEmail2 = String(rows2[i2][2] || '').trim().toLowerCase();
    var status = String(rows2[i2][13] || '').trim();
    if (status === 'Regenerated') continue;
    records2.push({
      id: String(rows2[i2][0]), version: Number(rows2[i2][1]),
      employeeEmail: empEmail2, employeeName: String(rows2[i2][3]),
      employeeImage: imgMap2[empEmail2] || '',
      department: String(rows2[i2][5]), designation: String(rows2[i2][6]),
      month: Number(rows2[i2][8]), year: Number(rows2[i2][9]), cutOff: String(rows2[i2][10]),
      coverageStart: String(rows2[i2][11]), coverageEnd: String(rows2[i2][12]),
      status: status, generatedBy: String(rows2[i2][14]), generatedAt: String(rows2[i2][15]),
      days: [], summary: {}, auditTrail: []
    });
  }
  records2.reverse();
  return _json({ success: true, records: records2 });
}

function updateDTRDayField(data) {
  if (!data || !data.dtrId || !data.date || !data.userEmail || !data.field)
    return _json({ success: false, message: 'Missing parameters' });

  var sheet = initGeneratedDTRSheet();
  var rows  = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) !== String(data.dtrId)) continue;

    var empEmail = String(rows[i][2] || '').trim().toLowerCase();
    var reqLower = data.userEmail.toLowerCase();
    var isAdmin  = isAdminRole(reqLower);
    var isOwner  = reqLower === empEmail;
    if (!isAdmin && !isOwner) return _json({ success: false, message: 'Unauthorized' });

    // Check locked
    var status = String(rows[i][13] || '').trim();
    if (status === 'Acknowledged') return _json({ success: false, message: 'DTR is locked (acknowledged).' });

    var days = [];
    try { days = JSON.parse(String(rows[i][21] || '[]')); } catch(e) {}
    var audit = [];
    try { audit = JSON.parse(String(rows[i][23] || '[]')); } catch(e) {}

    var found = false;
    var updatedDay = null;
    for (var d = 0; d < days.length; d++) {
      if (days[d].date === data.date) {
        found = true;
        var origVal = String(days[d][data.field] || '');
        days[d][data.field] = data.value;
        updatedDay = days[d];

        // If field is numeric
        if (data.field === 'lateHours' || data.field === 'lateMinutes' || data.field === 'totalHoursWorked' || data.field === 'actualOT' || data.field === 'approvedOT' || data.field === 'validatedOT') {
          days[d][data.field] = Number(data.value) || 0;
          updatedDay = days[d];
        }

        var now = Utilities.formatDate(new Date(), 'Asia/Manila', "yyyy-MM-dd'T'HH:mm:ss'+08:00'");
        audit.push({
          id: Utilities.getUuid(), date: data.date, field: data.field,
          originalValue: origVal, updatedValue: String(data.value),
          modifiedBy: data.userEmail, modifiedAt: now,
          remarks: data.remarks || ''
        });
        break;
      }
    }

    if (!found) return _json({ success: false, message: 'Day not found in DTR' });

    // Recompute summary
    var summary = recomputeDTRSummary(days);

    // Update status to Under Validation if still Generated
    if (status === 'Generated') {
      sheet.getRange(i + 1, 14).setValue('Under Validation');
    }

    sheet.getRange(i + 1, 22).setValue(JSON.stringify(days));
    sheet.getRange(i + 1, 23).setValue(JSON.stringify(summary));
    sheet.getRange(i + 1, 24).setValue(JSON.stringify(audit));

    return _json({ success: true, message: 'Day updated', day: updatedDay });
  }
  return _json({ success: false, message: 'DTR not found' });
}

function recomputeDTRSummary(days) {
  var s = { presentDays: 0, absentDays: 0, holidays: 0, restDays: 0, leaveDays: 0,
    officialBusinessDays: 0, wfhDays: 0, totalHoursWorked: 0, totalLateHours: 0,
    totalLateMinutes: 0, totalApprovedOT: 0, totalActualOT: 0, totalValidatedOT: 0, mealEligibleDays: 0 };
  for (var i = 0; i < days.length; i++) {
    var c = days[i].attendanceClassification || '';
    if (c === 'Present' || c === 'Late') s.presentDays++;
    else if (c === 'Absent') s.absentDays++;
    else if (c === 'Holiday') s.holidays++;
    else if (c === 'Rest Day') s.restDays++;
    else if (c === 'Approved Leave') s.leaveDays++;
    else if (c === 'Official Business') s.officialBusinessDays++;
    else if (c === 'Work From Home') s.wfhDays++;
    else if (c === 'Half Day') s.presentDays += 0.5;
    s.totalHoursWorked += (days[i].totalHoursWorked || 0);
    s.totalLateHours += (days[i].lateHours || 0);
    s.totalLateMinutes += (days[i].lateMinutes || 0);
    s.totalApprovedOT += (days[i].approvedOT || 0);
    s.totalActualOT += (days[i].actualOT || 0);
    s.totalValidatedOT += (days[i].validatedOT != null ? days[i].validatedOT : (days[i].approvedOT || 0));
    if (days[i].mealEligibility) s.mealEligibleDays++;
  }
  s.totalHoursWorked = Math.round(s.totalHoursWorked * 100) / 100;
  // Normalize minutes to hours
  s.totalLateHours += Math.floor(s.totalLateMinutes / 60);
  s.totalLateMinutes = s.totalLateMinutes % 60;
  return s;
}

function sendDTRForReview(dtrId, adminEmail) {
  if (!dtrId || !adminEmail) return _json({ success: false, message: 'Missing parameters' });
  if (!isAdminRole(adminEmail)) return _json({ success: false, message: 'Unauthorized' });

  var sheet = initGeneratedDTRSheet();
  var rows  = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) !== String(dtrId)) continue;
    var status = String(rows[i][13] || '').trim();
    if (status === 'Acknowledged') return _json({ success: false, message: 'DTR already acknowledged, cannot send for review.' });

    var now = Utilities.formatDate(new Date(), 'Asia/Manila', "yyyy-MM-dd'T'HH:mm:ss'+08:00'");
    sheet.getRange(i + 1, 14).setValue('Ready for Review');
    sheet.getRange(i + 1, 17).setValue(now); // Sent At

    var audit = [];
    try { audit = JSON.parse(String(rows[i][23] || '[]')); } catch(e) {}
    audit.push({ id: Utilities.getUuid(), date: '', field: 'status', originalValue: status, updatedValue: 'Ready for Review', modifiedBy: adminEmail, modifiedAt: now, remarks: 'Sent for employee review' });
    sheet.getRange(i + 1, 24).setValue(JSON.stringify(audit));

    var empEmail = String(rows[i][2] || '').trim().toLowerCase();
    createNotificationRecord(empEmail, 'DTR_READY_FOR_REVIEW', 'Your DTR is ready for your review and acknowledgement.', dtrId, 'dtrId');
    return _json({ success: true, message: 'DTR sent for review' });
  }
  return _json({ success: false, message: 'DTR not found' });
}

function acknowledgeDTRNew(dtrId, employeeEmail) {
  if (!dtrId || !employeeEmail) return _json({ success: false, message: 'Missing parameters' });
  var reqLower = employeeEmail.trim().toLowerCase();

  var sheet = initGeneratedDTRSheet();
  var rows  = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) !== String(dtrId)) continue;
    var empEmail = String(rows[i][2] || '').trim().toLowerCase();
    var isAdmin  = isAdminRole(reqLower);
    var isOwner  = reqLower === empEmail;
    if (!isAdmin && !isOwner) return _json({ success: false, message: 'Unauthorized' });

    var status = String(rows[i][13] || '').trim();
    if (status === 'Acknowledged') return _json({ success: false, message: 'Already acknowledged' });

    var now = Utilities.formatDate(new Date(), 'Asia/Manila', "yyyy-MM-dd'T'HH:mm:ss'+08:00'");
    sheet.getRange(i + 1, 14).setValue('Acknowledged');
    sheet.getRange(i + 1, 18).setValue(now); // Acknowledged At
    sheet.getRange(i + 1, 19).setValue(employeeEmail); // Acknowledged By

    var audit = [];
    try { audit = JSON.parse(String(rows[i][23] || '[]')); } catch(e) {}
    audit.push({ id: Utilities.getUuid(), date: '', field: 'status', originalValue: status, updatedValue: 'Acknowledged', modifiedBy: employeeEmail, modifiedAt: now, remarks: '' });
    sheet.getRange(i + 1, 24).setValue(JSON.stringify(audit));

    // Notify admin
    if (!isAdmin) {
      createNotificationRecord(ADMIN_EMAIL, 'DTR_ACKNOWLEDGED', String(rows[i][3]) + ' acknowledged their DTR.', dtrId, 'dtrId');
    }
    return _json({ success: true, message: 'DTR acknowledged', acknowledgedAt: now });
  }
  return _json({ success: false, message: 'DTR not found' });
}

function reopenDTRRecord(dtrId, adminEmail, reason) {
  if (!dtrId || !adminEmail) return _json({ success: false, message: 'Missing parameters' });
  if (!isAdminRole(adminEmail)) return _json({ success: false, message: 'Unauthorized' });

  var sheet = initGeneratedDTRSheet();
  var rows  = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) !== String(dtrId)) continue;
    var status = String(rows[i][13] || '').trim();
    if (status !== 'Acknowledged') return _json({ success: false, message: 'Only acknowledged DTRs can be reopened.' });

    var now = Utilities.formatDate(new Date(), 'Asia/Manila', "yyyy-MM-dd'T'HH:mm:ss'+08:00'");
    sheet.getRange(i + 1, 14).setValue('Reopened');
    sheet.getRange(i + 1, 20).setValue(adminEmail); // Reopened By
    sheet.getRange(i + 1, 21).setValue(now); // Reopened At
    // Clear acknowledged fields
    sheet.getRange(i + 1, 18).setValue('');
    sheet.getRange(i + 1, 19).setValue('');

    var audit = [];
    try { audit = JSON.parse(String(rows[i][23] || '[]')); } catch(e) {}
    audit.push({ id: Utilities.getUuid(), date: '', field: 'status', originalValue: 'Acknowledged', updatedValue: 'Reopened', modifiedBy: adminEmail, modifiedAt: now, remarks: reason || 'Reopened by admin' });
    sheet.getRange(i + 1, 24).setValue(JSON.stringify(audit));

    var empEmail = String(rows[i][2] || '').trim().toLowerCase();
    createNotificationRecord(empEmail, 'DTR_REOPENED', 'Your DTR has been reopened by admin. Please review again.', dtrId, 'dtrId');
    return _json({ success: true, message: 'DTR reopened' });
  }
  return _json({ success: false, message: 'DTR not found' });
}

function createNotificationRecord(toEmail, type, message, refId, refField) {
  var sheet = getNotificationsSheet();
  var now = Utilities.formatDate(new Date(), 'Asia/Manila', "yyyy-MM-dd'T'HH:mm:ss+08:00");
  // 8-col format: [id, email, type, msg, refId, refField, isRead, createdAt]
  // The getNotifications reader detects this by checking col5 is not boolean-like
  sheet.appendRow([Utilities.getUuid(), toEmail, type, message, refId || '', refField || '', 'false', now]);
}

// ══════════════════════════════════════════════════════════════════
//  MEAL ALLOWANCE
// ══════════════════════════════════════════════════════════════════

var MA_DEFAULTS = {
  MEAL_ALLOWANCE_ENABLED:   'true',
  MEAL_ALLOWANCE_2_ENABLED: 'true',
  MEAL_ALLOWANCE_MIN_HOURS_1: '0',
  MEAL_ALLOWANCE_MIN_HOURS_2: '8',
  MEAL_ALLOWANCE_MAX_COUNT:   '2'
};

function getMealAllowanceSetting(key) {
  var val = getSetting(key);
  return val !== null ? val : MA_DEFAULTS[key];
}

function getMealAllowanceConfig() {
  return {
    enabled:       getMealAllowanceSetting('MEAL_ALLOWANCE_ENABLED')   === 'true',
    secondEnabled: getMealAllowanceSetting('MEAL_ALLOWANCE_2_ENABLED') === 'true',
    minHours1:     parseFloat(getMealAllowanceSetting('MEAL_ALLOWANCE_MIN_HOURS_1')) || 0,
    minHours2:     parseFloat(getMealAllowanceSetting('MEAL_ALLOWANCE_MIN_HOURS_2')) || 8,
    maxCount:      parseInt(getMealAllowanceSetting('MEAL_ALLOWANCE_MAX_COUNT'), 10) || 2
  };
}

function saveMealAllowanceSettings(data, requesterEmail) {
  if (!requesterEmail || requesterEmail.toLowerCase() !== ADMIN_EMAIL) {
    return _json({ success: false, message: 'Unauthorized' });
  }
  var sheet = initSettingsSheet();
  var rows  = sheet.getDataRange().getValues();
  var keys = {
    enabled:       'MEAL_ALLOWANCE_ENABLED',
    secondEnabled: 'MEAL_ALLOWANCE_2_ENABLED',
    minHours1:     'MEAL_ALLOWANCE_MIN_HOURS_1',
    minHours2:     'MEAL_ALLOWANCE_MIN_HOURS_2',
    maxCount:      'MEAL_ALLOWANCE_MAX_COUNT'
  };
  var updates = {};
  updates[keys.enabled]       = String(data.enabled       !== false);
  updates[keys.secondEnabled] = String(data.secondEnabled !== false);
  updates[keys.minHours1]     = String(parseFloat(data.minHours1) || 0);
  updates[keys.minHours2]     = String(parseFloat(data.minHours2) || 8);
  updates[keys.maxCount]      = String(parseInt(data.maxCount, 10) || 2);
  for (var i = 1; i < rows.length; i++) {
    var k = String(rows[i][0]).trim();
    if (updates.hasOwnProperty(k)) {
      sheet.getRange(i + 1, 2).setValue(updates[k]);
      delete updates[k];
    }
  }
  for (var key in updates) {
    sheet.appendRow([key, updates[key]]);
  }
  return _json({ success: true, message: 'Meal Allowance settings saved', config: getMealAllowanceConfig() });
}

function initMealAllowanceSheet() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('MealAllowance');
  if (!sheet) {
    sheet = ss.insertSheet('MealAllowance');
    sheet.appendRow([
      'ID', 'Attendance ID', 'Employee Email', 'Employee Name',
      'Sequence', 'Timestamp', 'Latitude', 'Longitude', 'Accuracy',
      'Address', 'Image ID', 'Image URL', 'Remarks', 'Device Info'
    ]);
    var hdr = sheet.getRange(1, 1, 1, 14);
    hdr.setFontWeight('bold').setBackground('#7c3aed').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function submitMealAllowance(data, clientFolderId) {
  if (!data.userEmail) return _json({ success: false, message: 'Email required' });

  // -- Validate employee is currently timed-in --
  var attSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Attendance');
  if (!attSheet) return _json({ success: false, message: 'No attendance records found' });
  var attRows   = attSheet.getDataRange().getValues();
  var emailLower = String(data.userEmail).trim().toLowerCase();
  var timeInId   = null;
  var timeInTs   = null;
  for (var i = attRows.length - 1; i >= 1; i--) {
    if (String(attRows[i][3]).trim().toLowerCase() === emailLower) {
      var act = String(attRows[i][4]).trim();
      if (act === 'TIME_IN') {
        timeInId = String(attRows[i][0]);
        timeInTs = attRows[i][5];
      }
      break;
    }
  }
  if (!timeInId) return _json({ success: false, message: 'No active Time In found. Please Time In first.' });

  // -- Load config --
  var cfg = getMealAllowanceConfig();
  if (!cfg.enabled) return _json({ success: false, message: 'Meal Allowance is currently disabled.' });

  // -- Check hours worked --
  var now      = new Date();
  var timeInDate = (timeInTs instanceof Date) ? timeInTs : new Date(timeInTs);
  var hoursWorked = (now.getTime() - timeInDate.getTime()) / 3600000;

  // -- Count existing submissions for this attendance record --
  var maSheet = initMealAllowanceSheet();
  var maRows  = maSheet.getDataRange().getValues();
  var existing = [];
  for (var j = 1; j < maRows.length; j++) {
    if (String(maRows[j][1]) === timeInId && String(maRows[j][2]).toLowerCase() === emailLower) {
      existing.push({ sequence: Number(maRows[j][4]) });
    }
  }

  var nextSeq = existing.length + 1;
  if (nextSeq > cfg.maxCount) {
    return _json({ success: false, message: 'Maximum Meal Allowance submissions (' + cfg.maxCount + ') already reached.' });
  }

  // -- Check minimum hours for each sequence --
  if (nextSeq === 1 && hoursWorked < cfg.minHours1) {
    return _json({ success: false, message: 'Not yet eligible for Meal Allowance. Minimum hours required: ' + cfg.minHours1 + 'h.' });
  }
  if (nextSeq === 2) {
    if (!cfg.secondEnabled) return _json({ success: false, message: 'Second Meal Allowance is not enabled.' });
    if (hoursWorked < cfg.minHours2) {
      return _json({ success: false, message: 'Not yet eligible for Second Meal Allowance. Minimum hours required: ' + cfg.minHours2 + 'h.' });
    }
  }

  // -- Upload photo --
  var folderId = clientFolderId || getSetting('FOLDER_ID') || DEFAULT_FOLDER_ID;
  var imageUrl = '';
  var imageId  = '';
  try {
    if (data.photo && String(data.photo).indexOf('base64,') > -1) {
      var uploadResult = uploadImageToDrive({ photo: data.photo, userName: data.userName || data.userEmail, action: 'MEAL_' + nextSeq }, folderId);
      imageUrl = uploadResult.url;
      imageId  = uploadResult.id;
    }
  } catch (err) {
    Logger.log('Meal allowance drive upload error: ' + err.toString());
  }

  // -- Write record --
  var nowTs = Utilities.formatDate(now, 'Asia/Manila', "yyyy-MM-dd'T'HH:mm:ss'+08:00'");
  var id    = Utilities.getUuid();
  maSheet.appendRow([
    id, timeInId, emailLower, data.userName || emailLower,
    nextSeq, nowTs,
    data.latitude || '', data.longitude || '', data.accuracy || '',
    data.address  || '', imageId, imageUrl,
    data.remarks  || '', data.deviceInfo || ''
  ]);

  return _json({
    success:    true,
    message:    'Meal Allowance ' + nextSeq + ' submitted successfully.',
    id:         id,
    sequence:   nextSeq,
    imageId:    imageId,
    imageUrl:   imageUrl,
    hoursWorked:hoursWorked
  });
}

function getMealAllowanceStatus(email) {
  if (!email) return _json({ success: false, message: 'Email required' });
  var emailLower = String(email).trim().toLowerCase();
  var cfg        = getMealAllowanceConfig();

  // Find latest TIME_IN (not followed by TIME_OUT) from Attendance sheet
  var attSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Attendance');
  var timeInId = null;
  var timeInTs = null;
  if (attSheet && attSheet.getLastRow() > 1) {
    var attRows = attSheet.getDataRange().getValues();
    for (var i = attRows.length - 1; i >= 1; i--) {
      if (String(attRows[i][3]).trim().toLowerCase() === emailLower) {
        var act = String(attRows[i][4]).trim();
        if (act === 'TIME_IN') { timeInId = String(attRows[i][0]); timeInTs = attRows[i][5]; }
        break;
      }
    }
  }

  var hoursWorked = 0;
  if (timeInTs) {
    var tin = (timeInTs instanceof Date) ? timeInTs : new Date(timeInTs);
    hoursWorked = (new Date().getTime() - tin.getTime()) / 3600000;
  }

  // Find meal allowance submissions for this attendance record
  var submissions = [];
  if (timeInId) {
    var maSheet = initMealAllowanceSheet();
    var maRows  = maSheet.getDataRange().getValues();
    for (var j = 1; j < maRows.length; j++) {
      if (String(maRows[j][1]) === timeInId && String(maRows[j][2]).toLowerCase() === emailLower) {
        submissions.push({
          id:          String(maRows[j][0]),
          attendanceId:String(maRows[j][1]),
          employeeEmail:String(maRows[j][2]),
          employeeName: String(maRows[j][3]),
          sequence:    Number(maRows[j][4]),
          timestamp:   String(maRows[j][5]),
          latitude:    Number(maRows[j][6]),
          longitude:   Number(maRows[j][7]),
          accuracy:    Number(maRows[j][8]),
          address:     String(maRows[j][9]),
          imageId:     String(maRows[j][10]),
          imageUrl:    String(maRows[j][11]),
          remarks:     String(maRows[j][12]),
          deviceInfo:  String(maRows[j][13])
        });
      }
    }
  }

  return _json({
    success:         true,
    attendanceId:    timeInId,
    timeInTimestamp: timeInTs ? String(timeInTs) : null,
    hoursWorked:     hoursWorked,
    submissions:     submissions,
    config:          cfg
  });
}

// ══════════════════════════════════════════════════════════════════
//  WORK FROM HOME (WFH)
// ══════════════════════════════════════════════════════════════════

function initWFHSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('WorkFromHome');
  if (!sheet) {
    sheet = ss.insertSheet('WorkFromHome');
    sheet.appendRow([
      'ID','Attendance ID','Employee Email','Employee Name','Department','Designation',
      'Attendance Date','Time In','Time Out','Work Description','Planned Tasks',
      'Expected Deliverables','Additional Notes','Remarks',
      'EOD Summary','EOD Accomplishments','EOD Issues','EOD Deliverables',
      'EOD Next Day Plan','EOD Remarks','EOD Submitted At',
      'Attachments JSON','Status','Approver Email','Approver Name',
      'Approval Comments','Approved At','Revision Count',
      'Submitted At','Updated At','Audit Trail JSON','Version'
    ]);
    var hdr = sheet.getRange(1, 1, 1, 32);
    hdr.setFontWeight('bold').setBackground('#1e3a5f').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function buildWFHRecord(row, headers) {
  function col(names) {
    for (var n = 0; n < names.length; n++)
      for (var c = 0; c < headers.length; c++)
        if (String(headers[c]).trim().toLowerCase() === names[n].toLowerCase()) return c;
    return -1;
  }
  function v(names) { var c = col(names); return c === -1 ? '' : String(row[c] || ''); }
  function n(names) { var c = col(names); return c === -1 ? 0 : Number(row[c] || 0); }
  var attachRaw = v(['Attachments JSON']);
  var auditRaw  = v(['Audit Trail JSON']);
  var attachments = [];
  var audit       = [];
  try { attachments = JSON.parse(attachRaw || '[]'); } catch(e) {}
  try { audit       = JSON.parse(auditRaw  || '[]'); } catch(e) {}
  return {
    id:                   v(['ID']),
    attendanceId:         v(['Attendance ID']),
    employeeEmail:        v(['Employee Email']),
    employeeName:         v(['Employee Name']),
    department:           v(['Department']),
    designation:          v(['Designation']),
    attendanceDate:       v(['Attendance Date']),
    timeIn:               v(['Time In']),
    timeOut:              v(['Time Out']),
    workDescription:      v(['Work Description']),
    plannedTasks:         v(['Planned Tasks']),
    expectedDeliverables: v(['Expected Deliverables']),
    additionalNotes:      v(['Additional Notes']),
    remarks:              v(['Remarks']),
    eodSummary:           v(['EOD Summary']),
    eodAccomplishments:   v(['EOD Accomplishments']),
    eodIssues:            v(['EOD Issues']),
    eodDeliverables:      v(['EOD Deliverables']),
    eodNextDayPlan:       v(['EOD Next Day Plan']),
    eodRemarks:           v(['EOD Remarks']),
    eodSubmittedAt:       v(['EOD Submitted At']),
    attachments:          attachments,
    status:               v(['Status']),
    approverEmail:        v(['Approver Email']),
    approverName:         v(['Approver Name']),
    approvalComments:     v(['Approval Comments']),
    approvedAt:           v(['Approved At']),
    revisionCount:        n(['Revision Count']),
    submittedAt:          v(['Submitted At']),
    updatedAt:            v(['Updated At']),
    auditTrail:           audit,
    version:              n(['Version'])
  };
}

function findWFHRow(wfhId) {
  var sheet = initWFHSheet();
  if (sheet.getLastRow() <= 1) return null;
  var rows    = sheet.getDataRange().getValues();
  var headers = rows[0];
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0] || '') === String(wfhId)) return { sheet: sheet, rowIndex: i + 1, headers: headers, row: rows[i] };
  }
  return null;
}

function appendWFHAudit(existing, entry) {
  var trail = [];
  try { trail = JSON.parse(existing || '[]'); } catch(e) {}
  trail.push(entry);
  return JSON.stringify(trail);
}

function getWFHStatus(email) {
  if (!email) return _json({ success: false, message: 'Email required' });
  var emailLower = String(email).trim().toLowerCase();

  var attSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Attendance');
  var timeInId = null; var timeInTs = null;
  if (attSheet && attSheet.getLastRow() > 1) {
    var attRows = attSheet.getDataRange().getValues();
    for (var i = attRows.length - 1; i >= 1; i--) {
      if (String(attRows[i][3]).trim().toLowerCase() === emailLower) {
        var act = String(attRows[i][4]).trim();
        if (act === 'TIME_IN') { timeInId = String(attRows[i][0]); timeInTs = attRows[i][5]; }
        break;
      }
    }
  }

  var wfhRecord = null;
  if (timeInId) {
    var wfhSheet = initWFHSheet();
    if (wfhSheet.getLastRow() > 1) {
      var wfhRows = wfhSheet.getDataRange().getValues();
      var wfhHdrs = wfhRows[0];
      for (var j = 1; j < wfhRows.length; j++) {
        if (String(wfhRows[j][1]) === timeInId && String(wfhRows[j][2]).toLowerCase() === emailLower) {
          wfhRecord = buildWFHRecord(wfhRows[j], wfhHdrs);
          break;
        }
      }
    }
  }

  var eodRequired = wfhRecord !== null && !wfhRecord.eodSubmittedAt;
  var canTimeOut  = wfhRecord === null || !!wfhRecord.eodSubmittedAt;

  return _json({
    success: true,
    attendanceId:    timeInId,
    timeInTimestamp: timeInTs ? String(timeInTs) : null,
    wfhRecord:       wfhRecord,
    eodRequired:     eodRequired,
    canTimeOut:      canTimeOut
  });
}

function submitWFH(data) {
  if (!data || !data.email || !data.attendanceId) return _json({ success: false, message: 'Missing required fields' });
  var emailLower = String(data.email).trim().toLowerCase();
  var sheet = initWFHSheet();

  // Prevent duplicate WFH for same attendance record
  if (sheet.getLastRow() > 1) {
    var rows = sheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][1]) === String(data.attendanceId) && String(rows[i][2]).toLowerCase() === emailLower) {
        return _json({ success: false, message: 'Work From Home already registered for this attendance record' });
      }
    }
  }

  var id  = Utilities.getUuid();
  var now = Utilities.formatDate(new Date(), 'Asia/Manila', "yyyy-MM-dd'T'HH:mm:ss'+08:00'");
  var audit = JSON.stringify([{
    action: 'WFH_SUBMITTED', by: data.email, byRole: 'Employee',
    prevStatus: '', newStatus: 'Submitted', timestamp: now, comments: ''
  }]);

  sheet.appendRow([
    id, data.attendanceId, data.email, data.name || '',
    data.department || '', data.designation || '',
    data.attendanceDate || '', data.timeIn || '', '',
    data.workDescription || '', data.plannedTasks || '',
    data.expectedDeliverables || '', data.additionalNotes || '', data.remarks || '',
    '','','','','','','',
    '[]', 'Submitted', '', '', '', '', 0, now, now, audit, 1
  ]);

  // Notify employee (confirmation)
  createNotificationRecord(data.email, 'WFH_SUBMITTED',
    'Your Work From Home registration for ' + (data.attendanceDate || 'today') + ' has been submitted and is pending approval.', id, 'wfhId');

  // Notify approver
  var cfg = getSettingsForEmployee(emailLower);
  var firstApprover = cfg ? ((cfg.workflowType === 'TWO_STEP' && cfg.teamLeadEmail) ? cfg.teamLeadEmail : cfg.approverEmail) : '';
  if (!firstApprover) {
    // Fallback: notify admin if no approver configured
    firstApprover = ADMIN_EMAIL;
  }
  // Update approver column
  sheet.getRange(sheet.getLastRow(), 24).setValue(firstApprover);
  var apprName = getApproverName(firstApprover);
  sheet.getRange(sheet.getLastRow(), 25).setValue(apprName);
  createNotificationRecord(firstApprover, 'PENDING_APPROVAL',
    (data.name || data.email) + ' registered Work From Home for ' + (data.attendanceDate || 'today') + '. Planned: ' + (data.workDescription || '').substring(0, 100), id, 'wfhId');

  return _json({ success: true, message: 'Work From Home registered successfully', id: id });
}

function submitWFHEOD(data, clientFolderId) {
  try {
  if (!data || !data.wfhId || !data.email) return _json({ success: false, message: 'Missing required fields' });
  var found = findWFHRow(data.wfhId);
  if (!found) return _json({ success: false, message: 'WFH record not found' });
  if (String(found.row[2]).trim().toLowerCase() !== String(data.email).trim().toLowerCase())
    return _json({ success: false, message: 'Unauthorized' });

  var now = Utilities.formatDate(new Date(), 'Asia/Manila', "yyyy-MM-dd'T'HH:mm:ss'+08:00'");
  var folderId = clientFolderId || getSetting('FOLDER_ID') || DEFAULT_FOLDER_ID;

  // Upload attachments
  var existingRaw = String(found.row[21] || '[]');
  var attachments = [];
  try { attachments = JSON.parse(existingRaw); } catch(e) {}
  var version = Number(found.row[31] || 1);

  if (data.attachments && data.attachments.length > 0) {
    var folder;
    try { folder = DriveApp.getFolderById(folderId); } catch(e) { folder = DriveApp.getRootFolder(); }
    var monthKey = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
    var subName  = 'WFH_DOCS_' + monthKey;
    var subIter  = folder.getFoldersByName(subName);
    var subFolder = subIter.hasNext() ? subIter.next() : folder.createFolder(subName);

    for (var a = 0; a < data.attachments.length; a++) {
      var att = data.attachments[a];
      if (!att || !att.fileData) {
        return _json({ success: false, message: 'Attachment ' + (a + 1) + ' has no file data' });
      }
      var commaIdx = att.fileData.indexOf(',');
      if (commaIdx === -1) {
        return _json({ success: false, message: 'Attachment ' + (a + 1) + ' has an invalid data format' });
      }
      var header    = att.fileData.substring(0, commaIdx);
      var b64data   = att.fileData.substring(commaIdx + 1);
      var mimeMatch = header.match(/:(.*?);/);
      var mime      = (att.mimeType && att.mimeType !== 'application/octet-stream')
                        ? att.mimeType
                        : (mimeMatch ? mimeMatch[1] : 'application/octet-stream');
      try {
        var bytes = Utilities.base64Decode(b64data);
        var blob  = Utilities.newBlob(bytes, mime, att.fileName);
        var file  = subFolder.createFile(blob);
        attachments.push({
          fileId:     file.getId(),
          fileName:   att.fileName,
          fileUrl:    'https://drive.google.com/file/d/' + file.getId() + '/view',
          uploadedAt: now,
          version:    version
        });
      } catch(ae) {
        Logger.log('WFH attachment upload error: ' + ae);
        return _json({ success: false, message: 'File upload failed: ' + ae.toString().substring(0, 120) });
      }
    }
  }

  if (attachments.length === 0) return _json({ success: false, message: 'At least one supporting attachment is required' });

  var prevStatus = String(found.row[22] || 'Submitted');
  var newStatus  = 'Pending Review';
  var auditJson  = appendWFHAudit(String(found.row[30] || '[]'), {
    action: 'WFH_EOD_SUBMITTED', by: data.email, byRole: 'Employee',
    prevStatus: prevStatus, newStatus: newStatus, timestamp: now, comments: ''
  });

  var r = found.rowIndex;
  var s = found.sheet;
  s.getRange(r, 15).setValue(data.eodSummary || '');
  s.getRange(r, 16).setValue(data.eodAccomplishments || '');
  s.getRange(r, 17).setValue(data.eodIssues || '');
  s.getRange(r, 18).setValue(data.eodDeliverables || '');
  s.getRange(r, 19).setValue(data.eodNextDayPlan || '');
  s.getRange(r, 20).setValue(data.eodRemarks || '');
  s.getRange(r, 21).setValue(now);
  s.getRange(r, 22).setValue(JSON.stringify(attachments));
  s.getRange(r, 23).setValue(newStatus);
  s.getRange(r, 30).setValue(now);
  s.getRange(r, 31).setValue(auditJson);

  // Notify employee (confirmation)
  createNotificationRecord(data.email, 'WFH_SUBMITTED',
    'Your End-of-Day Report for WFH on ' + String(found.row[6] || '') + ' has been submitted. You may now clock out.', data.wfhId, 'wfhId');

  // Notify approver
  var approverEmail = String(found.row[23] || '').trim();
  if (!approverEmail) approverEmail = ADMIN_EMAIL;
  if (approverEmail) {
    createNotificationRecord(approverEmail, 'PENDING_APPROVAL',
      (String(found.row[3] || data.email)) + ' submitted End-of-Day Report for WFH on ' + String(found.row[6] || '') + '. Ready for review.', data.wfhId, 'wfhId');
  }

  return _json({ success: true, message: 'End-of-Day Report submitted successfully', attachments: attachments });
  } catch(topErr) {
    Logger.log('submitWFHEOD top-level error: ' + topErr);
    return _json({ success: false, message: 'Server error: ' + topErr.toString().substring(0, 200) });
  }
}

function resubmitWFH(data, clientFolderId) {
  if (!data || !data.wfhId || !data.email) return _json({ success: false, message: 'Missing required fields' });
  var found = findWFHRow(data.wfhId);
  if (!found) return _json({ success: false, message: 'WFH record not found' });
  var empEmail = String(found.row[2]).trim().toLowerCase();
  if (empEmail !== String(data.email).trim().toLowerCase()) return _json({ success: false, message: 'Unauthorized' });

  var status = String(found.row[22] || '');
  if (status !== 'Revision Required' && status !== 'Rejected')
    return _json({ success: false, message: 'Only Revision Required or Rejected records can be resubmitted' });

  var now      = Utilities.formatDate(new Date(), 'Asia/Manila', "yyyy-MM-dd'T'HH:mm:ss'+08:00'");
  var newStatus = 'Resubmitted';
  var version   = Number(found.row[31] || 1) + 1;
  var revCount  = Number(found.row[27] || 0) + 1;

  // Handle new attachments if any
  var existingRaw = String(found.row[21] || '[]');
  var attachments = [];
  try { attachments = JSON.parse(existingRaw); } catch(e) {}

  if (data.attachments && data.attachments.length > 0) {
    var folderId = clientFolderId || getSetting('FOLDER_ID') || DEFAULT_FOLDER_ID;
    var folder;
    try { folder = DriveApp.getFolderById(folderId); } catch(e) { folder = DriveApp.getRootFolder(); }
    var monthKey  = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
    var subName   = 'WFH_DOCS_' + monthKey;
    var subIter   = folder.getFoldersByName(subName);
    var subFolder = subIter.hasNext() ? subIter.next() : folder.createFolder(subName);
    for (var a = 0; a < data.attachments.length; a++) {
      var att = data.attachments[a];
      if (!att || !att.fileData) return _json({ success: false, message: 'Attachment ' + (a + 1) + ' has no file data' });
      var commaIdx = att.fileData.indexOf(',');
      if (commaIdx === -1) return _json({ success: false, message: 'Attachment ' + (a + 1) + ' has an invalid data format' });
      var header    = att.fileData.substring(0, commaIdx);
      var b64data   = att.fileData.substring(commaIdx + 1);
      var mimeMatch = header.match(/:(.*?);/);
      var mime      = (att.mimeType && att.mimeType !== 'application/octet-stream')
                        ? att.mimeType
                        : (mimeMatch ? mimeMatch[1] : 'application/octet-stream');
      try {
        var bytes = Utilities.base64Decode(b64data);
        var blob  = Utilities.newBlob(bytes, mime, att.fileName);
        var file  = subFolder.createFile(blob);
        attachments.push({ fileId: file.getId(), fileName: att.fileName, fileUrl: 'https://drive.google.com/file/d/' + file.getId() + '/view', uploadedAt: now, version: version });
      } catch(ae) {
        Logger.log('WFH resubmit attachment error: ' + ae);
        return _json({ success: false, message: 'File upload failed: ' + ae.toString().substring(0, 120) });
      }
    }
  }

  var auditJson = appendWFHAudit(String(found.row[30] || '[]'), {
    action: 'WFH_RESUBMITTED', by: data.email, byRole: 'Employee',
    prevStatus: status, newStatus: newStatus, timestamp: now, comments: data.remarks || ''
  });

  var r = found.rowIndex; var s = found.sheet;
  if (data.workDescription)      s.getRange(r, 10).setValue(data.workDescription);
  if (data.plannedTasks)         s.getRange(r, 11).setValue(data.plannedTasks);
  if (data.expectedDeliverables) s.getRange(r, 12).setValue(data.expectedDeliverables);
  if (data.eodSummary)           s.getRange(r, 15).setValue(data.eodSummary);
  if (data.eodAccomplishments)   s.getRange(r, 16).setValue(data.eodAccomplishments);
  if (data.eodIssues)            s.getRange(r, 17).setValue(data.eodIssues);
  if (data.eodDeliverables)      s.getRange(r, 18).setValue(data.eodDeliverables);
  if (data.eodNextDayPlan)       s.getRange(r, 19).setValue(data.eodNextDayPlan);
  if (data.eodRemarks)           s.getRange(r, 20).setValue(data.eodRemarks);
  if (data.remarks)              s.getRange(r, 14).setValue(data.remarks);
  s.getRange(r, 22).setValue(JSON.stringify(attachments));
  s.getRange(r, 23).setValue(newStatus);
  s.getRange(r, 28).setValue(revCount);
  s.getRange(r, 30).setValue(now);
  s.getRange(r, 31).setValue(auditJson);
  s.getRange(r, 32).setValue(version);

  var approverEmail = String(found.row[23] || '').trim();
  if (!approverEmail) approverEmail = ADMIN_EMAIL;
  if (approverEmail) {
    createNotificationRecord(approverEmail, 'PENDING_APPROVAL',
      (String(found.row[3] || data.email)) + ' resubmitted WFH record for ' + String(found.row[6] || '') + ' (Revision #' + revCount + '). Awaiting your review.', data.wfhId, 'wfhId');
  }
  return _json({ success: true, message: 'WFH resubmitted successfully' });
}

function resubmitWFHEOD(data, clientFolderId) {
  try {
  if (!data || !data.wfhId || !data.email) return _json({ success: false, message: 'Missing required fields' });
  var found = findWFHRow(data.wfhId);
  if (!found) return _json({ success: false, message: 'WFH record not found' });
  if (String(found.row[2]).trim().toLowerCase() !== String(data.email).trim().toLowerCase())
    return _json({ success: false, message: 'Unauthorized' });

  var status = String(found.row[22] || '');
  if (status !== 'Revision Required' && status !== 'Pending Review')
    return _json({ success: false, message: 'EOD can only be revised when status is Revision Required or Pending Review' });

  var now      = Utilities.formatDate(new Date(), 'Asia/Manila', "yyyy-MM-dd'T'HH:mm:ss'+08:00'");
  var folderId = clientFolderId || getSetting('FOLDER_ID') || DEFAULT_FOLDER_ID;
  var version  = Number(found.row[31] || 1) + 1;

  // Handle attachment — upload new file(s) or keep existing ones
  var existingRaw = String(found.row[21] || '[]');
  var attachments = [];
  try { attachments = JSON.parse(existingRaw); } catch(e) {}

  if (data.attachments && data.attachments.length > 0) {
    // Employee chose to replace — upload new file(s), discarding old ones
    attachments = [];
    var folder;
    try { folder = DriveApp.getFolderById(folderId); } catch(e) { folder = DriveApp.getRootFolder(); }
    var monthKey  = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
    var subName   = 'WFH_DOCS_' + monthKey;
    var subIter   = folder.getFoldersByName(subName);
    var subFolder = subIter.hasNext() ? subIter.next() : folder.createFolder(subName);
    for (var a = 0; a < data.attachments.length; a++) {
      var att = data.attachments[a];
      if (!att || !att.fileData) return _json({ success: false, message: 'Attachment ' + (a + 1) + ' has no file data' });
      var commaIdx = att.fileData.indexOf(',');
      if (commaIdx === -1) return _json({ success: false, message: 'Attachment ' + (a + 1) + ' has an invalid data format' });
      var header    = att.fileData.substring(0, commaIdx);
      var b64data   = att.fileData.substring(commaIdx + 1);
      var mimeMatch = header.match(/:(.*?);/);
      var mime      = (att.mimeType && att.mimeType !== 'application/octet-stream')
                        ? att.mimeType : (mimeMatch ? mimeMatch[1] : 'application/octet-stream');
      try {
        var bytes = Utilities.base64Decode(b64data);
        var blob  = Utilities.newBlob(bytes, mime, att.fileName);
        var file  = subFolder.createFile(blob);
        attachments.push({ fileId: file.getId(), fileName: att.fileName,
          fileUrl: 'https://drive.google.com/file/d/' + file.getId() + '/view',
          uploadedAt: now, version: version });
      } catch(ae) {
        Logger.log('resubmitWFHEOD attachment error: ' + ae);
        return _json({ success: false, message: 'File upload failed: ' + ae.toString().substring(0, 120) });
      }
    }
  }
  // Empty data.attachments means employee kept existing — attachments already loaded from sheet above

  if (attachments.length === 0) return _json({ success: false, message: 'At least one supporting attachment is required' });

  var prevStatus = status;
  var newStatus  = 'Pending Review';
  var revCount   = Number(found.row[27] || 0) + 1;
  var auditJson  = appendWFHAudit(String(found.row[30] || '[]'), {
    action: 'WFH_EOD_RESUBMITTED', by: data.email, byRole: 'Employee',
    prevStatus: prevStatus, newStatus: newStatus, timestamp: now, comments: ''
  });

  var r = found.rowIndex; var s = found.sheet;
  s.getRange(r, 15).setValue(data.eodSummary || '');
  s.getRange(r, 16).setValue(data.eodAccomplishments || '');
  s.getRange(r, 17).setValue(data.eodIssues || '');
  s.getRange(r, 18).setValue(data.eodDeliverables || '');
  s.getRange(r, 19).setValue(data.eodNextDayPlan || '');
  s.getRange(r, 20).setValue(data.eodRemarks || '');
  s.getRange(r, 21).setValue(now);
  s.getRange(r, 22).setValue(JSON.stringify(attachments));
  s.getRange(r, 23).setValue(newStatus);
  s.getRange(r, 28).setValue(revCount);
  s.getRange(r, 30).setValue(now);
  s.getRange(r, 31).setValue(auditJson);
  s.getRange(r, 32).setValue(version);

  createNotificationRecord(data.email, 'WFH_SUBMITTED',
    'Your revised EOD Report for WFH on ' + String(found.row[6] || '') + ' has been resubmitted successfully.', data.wfhId, 'wfhId');

  var approverEmail = String(found.row[23] || '').trim();
  if (!approverEmail) approverEmail = ADMIN_EMAIL;
  if (approverEmail) {
    createNotificationRecord(approverEmail, 'PENDING_APPROVAL',
      String(found.row[3] || data.email) + ' resubmitted revised EOD Report for WFH on ' + String(found.row[6] || '') + '. Ready for review.', data.wfhId, 'wfhId');
  }

  return _json({ success: true, message: 'EOD Report resubmitted successfully', attachments: attachments });
  } catch(topErr) {
    Logger.log('resubmitWFHEOD top-level error: ' + topErr);
    return _json({ success: false, message: 'Server error: ' + topErr.toString().substring(0, 200) });
  }
}

function approveWFH(wfhId, approverEmail, comments) {
  if (!wfhId || !approverEmail) return _json({ success: false, message: 'Missing parameters' });
  var found = findWFHRow(wfhId);
  if (!found) return _json({ success: false, message: 'WFH record not found' });
  var now      = Utilities.formatDate(new Date(), 'Asia/Manila', "yyyy-MM-dd'T'HH:mm:ss'+08:00'");
  var prevStatus = String(found.row[22] || '');
  var newStatus  = 'Approved';
  var auditJson  = appendWFHAudit(String(found.row[30] || '[]'), {
    action: 'WFH_APPROVED', by: approverEmail, byRole: 'Approver',
    prevStatus: prevStatus, newStatus: newStatus, timestamp: now, comments: comments || ''
  });
  var r = found.rowIndex; var s = found.sheet;
  s.getRange(r, 23).setValue(newStatus);
  s.getRange(r, 24).setValue(approverEmail);
  s.getRange(r, 25).setValue(getApproverName(approverEmail));
  s.getRange(r, 26).setValue(comments || '');
  s.getRange(r, 27).setValue(now);
  s.getRange(r, 30).setValue(now);
  s.getRange(r, 31).setValue(auditJson);
  var empEmail = String(found.row[2] || '');
  if (empEmail) createNotificationRecord(empEmail, 'WFH_APPROVED',
    'Your WFH submission for ' + String(found.row[6] || '') + ' has been Approved by ' + getApproverName(approverEmail) + (comments ? '. Comments: ' + comments : ''), wfhId, 'wfhId');
  return _json({ success: true, message: 'WFH approved successfully' });
}

function rejectWFH(wfhId, approverEmail, reason) {
  if (!wfhId || !approverEmail || !reason) return _json({ success: false, message: 'Missing parameters' });
  var found = findWFHRow(wfhId);
  if (!found) return _json({ success: false, message: 'WFH record not found' });
  var now      = Utilities.formatDate(new Date(), 'Asia/Manila', "yyyy-MM-dd'T'HH:mm:ss'+08:00'");
  var prevStatus = String(found.row[22] || '');
  var newStatus  = 'Rejected';
  var auditJson  = appendWFHAudit(String(found.row[30] || '[]'), {
    action: 'WFH_REJECTED', by: approverEmail, byRole: 'Approver',
    prevStatus: prevStatus, newStatus: newStatus, timestamp: now, comments: reason
  });
  var r = found.rowIndex; var s = found.sheet;
  s.getRange(r, 23).setValue(newStatus);
  s.getRange(r, 26).setValue(reason);
  s.getRange(r, 27).setValue(now);
  s.getRange(r, 30).setValue(now);
  s.getRange(r, 31).setValue(auditJson);
  var empEmail = String(found.row[2] || '');
  if (empEmail) createNotificationRecord(empEmail, 'WFH_REJECTED',
    'Your WFH submission for ' + String(found.row[6] || '') + ' has been Rejected. Reason: ' + reason, wfhId, 'wfhId');
  return _json({ success: true, message: 'WFH rejected' });
}

function requestWFHRevision(wfhId, approverEmail, comments) {
  if (!wfhId || !approverEmail || !comments) return _json({ success: false, message: 'Missing parameters' });
  var found = findWFHRow(wfhId);
  if (!found) return _json({ success: false, message: 'WFH record not found' });
  var now      = Utilities.formatDate(new Date(), 'Asia/Manila', "yyyy-MM-dd'T'HH:mm:ss'+08:00'");
  var prevStatus = String(found.row[22] || '');
  var newStatus  = 'Revision Required';
  var auditJson  = appendWFHAudit(String(found.row[30] || '[]'), {
    action: 'WFH_REVISION_REQUESTED', by: approverEmail, byRole: 'Approver',
    prevStatus: prevStatus, newStatus: newStatus, timestamp: now, comments: comments
  });
  var r = found.rowIndex; var s = found.sheet;
  s.getRange(r, 23).setValue(newStatus);
  s.getRange(r, 26).setValue(comments);
  s.getRange(r, 30).setValue(now);
  s.getRange(r, 31).setValue(auditJson);
  var empEmail = String(found.row[2] || '');
  if (empEmail) createNotificationRecord(empEmail, 'WFH_REVISION_REQUESTED',
    'Revision requested on your WFH for ' + String(found.row[6] || '') + '. Comments: ' + comments, wfhId, 'wfhId');
  return _json({ success: true, message: 'Revision requested' });
}

function getWFHHistory(email) {
  if (!email) return _json({ success: false, message: 'Email required' });
  var emailLower = String(email).trim().toLowerCase();
  var sheet = initWFHSheet();
  if (sheet.getLastRow() <= 1) return _json({ success: true, records: [] });
  var rows = sheet.getDataRange().getValues();
  var headers = rows[0];
  var records = [];
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][2] || '').trim().toLowerCase() !== emailLower) continue;
    records.push(buildWFHRecord(rows[i], headers));
  }
  records.reverse();
  return _json({ success: true, records: records });
}

function getPendingWFHApprovals(approverEmail) {
  if (!approverEmail) return _json({ success: false, message: 'Email required' });
  var approverLower = String(approverEmail).trim().toLowerCase();
  var isAdmin = approverLower === ADMIN_EMAIL;
  var sheet = initWFHSheet();
  if (sheet.getLastRow() <= 1) return _json({ success: true, records: [] });
  var rows = sheet.getDataRange().getValues();
  var headers = rows[0];
  var records = [];
  var reviewable = ['Submitted','Pending Review','Resubmitted'];
  for (var i = 1; i < rows.length; i++) {
    var status = String(rows[i][22] || '').trim();
    if (reviewable.indexOf(status) === -1) continue;
    var recApprover = String(rows[i][23] || '').trim().toLowerCase();
    if (!isAdmin && recApprover !== approverLower) {
      var empEmail = String(rows[i][2] || '').trim().toLowerCase();
      var cfg = getSettingsForEmployee(empEmail);
      if (!cfg) continue;
      var tl   = cfg.teamLeadEmail;
      var appr = cfg.approverEmail;
      var wf   = cfg.workflowType;
      var ok = false;
      if (wf === 'TWO_STEP') {
        if ((status === 'Submitted' || status === 'Resubmitted') && tl === approverLower) ok = true;
        if (status === 'Pending Review' && appr === approverLower) ok = true;
      } else {
        if (appr === approverLower) ok = true;
      }
      if (!ok) continue;
    }
    records.push(buildWFHRecord(rows[i], headers));
  }
  return _json({ success: true, records: records });
}

// ══════════════════════════════════════════════════════════════════
//  OVERTIME FILING MODULE
// ══════════════════════════════════════════════════════════════════

function initOTSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('OvertimeFiling');
  if (!sheet) {
    sheet = ss.insertSheet('OvertimeFiling');
    sheet.appendRow([
      'ID', 'Employee Email', 'Employee Name', 'Department', 'Designation',
      'OT Date', 'OT Type',
      'Pre-Shift Start', 'Pre-Shift End',
      'Post-Shift Start', 'Post-Shift End',
      'Total Requested Hours', 'Reason',
      'Attachment URL', 'Attachment ID',
      'Status', 'Approver Email', 'Approver Name',
      'Approved Hours', 'Approved At',
      'Return Remarks', 'Rejection Reason',
      'Submitted At', 'Created At',
      'Audit Trail JSON'
    ]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function computeOTHours(start, end) {
  if (!start || !end) return 0;
  var s = new Date(start), e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
  var diff = (e.getTime() - s.getTime()) / (1000 * 3600);
  return Math.max(0, Math.round(diff * 100) / 100);
}

function submitOTRequest(data) {
  if (!data || !data.employeeEmail || !data.otDate || !data.otType)
    return _json({ success: false, message: 'Missing required fields' });
  var sheet = initOTSheet();
  var now = Utilities.formatDate(new Date(), 'Asia/Manila', "yyyy-MM-dd'T'HH:mm:ss+08:00");
  var id = Utilities.getUuid();
  var totalHours = 0;
  if (data.otType === 'Pre-Shift')
    totalHours += computeOTHours(data.preShiftStart, data.preShiftEnd);
  if (data.otType === 'Post-Shift')
    totalHours += computeOTHours(data.postShiftStart, data.postShiftEnd);
  var status = data.isDraft ? 'Draft' : 'Submitted';
  var audit = [{ action: status === 'Draft' ? 'CREATED_DRAFT' : 'SUBMITTED', by: data.employeeEmail, at: now, remarks: '' }];
  // Look up approver
  var approverEmail = '';
  var approverName = '';
  var approverCfgRaw = getApproverSettings(data.employeeEmail);
  try {
    var approverCfgJson = JSON.parse(approverCfgRaw.getContent());
    if (approverCfgJson.success && approverCfgJson.settings) {
      approverEmail = approverCfgJson.settings.approverEmail || '';
      approverName  = approverCfgJson.settings.approverName  || '';
    }
  } catch(e) {}
  // Upload attachment to Drive if provided
  var docId = '', docUrl = '';
  if (data.attachmentUrl && String(data.attachmentUrl).indexOf('base64,') > -1) {
    try {
      var folderId2 = getSetting('FOLDER_ID') || DEFAULT_FOLDER_ID;
      var otFolder;
      try { otFolder = DriveApp.getFolderById(folderId2); } catch(fe) { otFolder = DriveApp.getRootFolder(); }
      var monthKey2  = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
      var subName2   = 'OT_DOCS_' + monthKey2;
      var subIter2   = otFolder.getFoldersByName(subName2);
      var subFolder2 = subIter2.hasNext() ? subIter2.next() : otFolder.createFolder(subName2);
      var parts2     = data.attachmentUrl.split(',');
      var mime2      = parts2[0].match(/:(.*?);/)[1];
      var ext2       = mime2.split('/')[1] || 'bin';
      var ts2        = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');
      var safeName2  = (data.employeeName || data.employeeEmail || 'user').replace(/[^a-zA-Z0-9]/g, '_');
      var blob2      = Utilities.newBlob(Utilities.base64Decode(parts2[1]), mime2, 'OT_' + safeName2 + '_' + ts2 + '.' + ext2);
      var file2      = subFolder2.createFile(blob2);
      docId  = file2.getId();
      docUrl = 'https://drive.google.com/file/d/' + file2.getId() + '/view';
    } catch(e2) { Logger.log('OT doc upload error: ' + e2.toString()); }
  }
  sheet.appendRow([
    id, data.employeeEmail, data.employeeName || '', data.department || '', data.designation || '',
    data.otDate, data.otType,
    data.preShiftStart || '', data.preShiftEnd || '',
    data.postShiftStart || '', data.postShiftEnd || '',
    totalHours, data.reason || '',
    docUrl, docId,
    status, approverEmail, approverName,
    '', '', '', '', status !== 'Draft' ? now : '', now,
    JSON.stringify(audit)
  ]);
  if (status === 'Submitted') {
    createNotificationRecord(approverEmail, 'OT_REQUIRES_APPROVAL', (data.employeeName || data.employeeEmail) + ' filed an OT request for ' + data.otDate + '.', id, 'otId');
    createNotificationRecord(data.employeeEmail, 'OT_SUBMITTED', 'Your OT request for ' + data.otDate + ' has been submitted.', id, 'otId');
  }
  return _json({ success: true, message: status === 'Draft' ? 'OT draft saved' : 'OT request submitted', otId: id });
}

function updateOTDraft(data) {
  if (!data || !data.otId || !data.email) return _json({ success: false, message: 'Missing parameters' });
  var sheet = initOTSheet();
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) !== String(data.otId)) continue;
    var email = String(rows[i][1]).trim().toLowerCase();
    if (email !== data.email.toLowerCase()) return _json({ success: false, message: 'Unauthorized' });
    var status = String(rows[i][15]);
    if (status !== 'Draft' && status !== 'Returned for Revision')
      return _json({ success: false, message: 'OT request cannot be edited in status: ' + status });
    var now = Utilities.formatDate(new Date(), 'Asia/Manila', "yyyy-MM-dd'T'HH:mm:ss+08:00");
    var totalHours = 0;
    var otType = data.otType || String(rows[i][6]);
    if (otType === 'Pre-Shift')  totalHours += computeOTHours(data.preShiftStart  || String(rows[i][7]),  data.preShiftEnd   || String(rows[i][8]));
    if (otType === 'Post-Shift') totalHours += computeOTHours(data.postShiftStart || String(rows[i][9]),  data.postShiftEnd  || String(rows[i][10]));
    var rowRef = sheet.getRange(i + 1, 1, 1, 25);
    var vals = rowRef.getValues()[0];
    // Upload new attachment if a fresh base64 is provided
    var updDocUrl = String(vals[13] || ''), updDocId = String(vals[14] || '');
    if (data.attachmentUrl && String(data.attachmentUrl).indexOf('base64,') > -1) {
      try {
        var folderId3 = getSetting('FOLDER_ID') || DEFAULT_FOLDER_ID;
        var otFolder3;
        try { otFolder3 = DriveApp.getFolderById(folderId3); } catch(fe3) { otFolder3 = DriveApp.getRootFolder(); }
        var monthKey3  = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
        var subName3   = 'OT_DOCS_' + monthKey3;
        var subIter3   = otFolder3.getFoldersByName(subName3);
        var subFolder3 = subIter3.hasNext() ? subIter3.next() : otFolder3.createFolder(subName3);
        var parts3     = data.attachmentUrl.split(',');
        var mime3      = parts3[0].match(/:(.*?);/)[1];
        var ext3       = mime3.split('/')[1] || 'bin';
        var ts3        = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');
        var safeName3  = (String(rows[i][2]) || data.email || 'user').replace(/[^a-zA-Z0-9]/g, '_');
        var blob3      = Utilities.newBlob(Utilities.base64Decode(parts3[1]), mime3, 'OT_' + safeName3 + '_' + ts3 + '.' + ext3);
        var file3      = subFolder3.createFile(blob3);
        updDocId  = file3.getId();
        updDocUrl = 'https://drive.google.com/file/d/' + file3.getId() + '/view';
      } catch(e3) { Logger.log('OT doc update upload error: ' + e3.toString()); }
    }
    var newStatus = data.submit ? 'Submitted' : status;
    var audit = [];
    try { audit = JSON.parse(String(rows[i][24] || '[]')); } catch(e) {}
    audit.push({ action: data.submit ? 'SUBMITTED' : 'UPDATED', by: data.email, at: now, remarks: data.remarks || '' });
    vals[5]  = data.otDate        || vals[5];
    vals[6]  = data.otType        || vals[6];
    vals[7]  = data.preShiftStart || vals[7];
    vals[8]  = data.preShiftEnd   || vals[8];
    vals[9]  = data.postShiftStart|| vals[9];
    vals[10] = data.postShiftEnd  || vals[10];
    vals[11] = totalHours;
    vals[12] = data.reason        || vals[12];
    vals[13] = updDocUrl;
    vals[14] = updDocId;
    vals[15] = newStatus;
    vals[22] = newStatus === 'Submitted' && !vals[22] ? now : vals[22];
    vals[24] = JSON.stringify(audit);
    rowRef.setValues([vals]);
    if (data.submit) {
      var approverEmail2 = String(rows[i][16]);
      createNotificationRecord(approverEmail2, 'OT_REQUIRES_APPROVAL', (String(rows[i][2]) || data.email) + ' filed an OT request for ' + (data.otDate || String(rows[i][5])) + '.', data.otId, 'otId');
      createNotificationRecord(data.email, 'OT_SUBMITTED', 'Your OT request for ' + (data.otDate || String(rows[i][5])) + ' has been submitted.', data.otId, 'otId');
    }
    return _json({ success: true, message: data.submit ? 'OT request submitted' : 'OT draft updated' });
  }
  return _json({ success: false, message: 'OT request not found' });
}

function approveOTRequest(otId, approverEmail, approvedHours) {
  if (!otId || !approverEmail) return _json({ success: false, message: 'Missing parameters' });
  var sheet = initOTSheet();
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) !== String(otId)) continue;
    var status = String(rows[i][15]);
    if (status !== 'Submitted' && status !== 'Pending Approval')
      return _json({ success: false, message: 'Cannot approve OT in status: ' + status });
    var now = Utilities.formatDate(new Date(), 'Asia/Manila', "yyyy-MM-dd'T'HH:mm:ss+08:00");
    var audit = [];
    try { audit = JSON.parse(String(rows[i][24] || '[]')); } catch(e) {}
    var hrs = approvedHours != null ? Number(approvedHours) : Number(rows[i][11]);
    audit.push({ action: 'APPROVED', by: approverEmail, at: now, remarks: 'Approved hours: ' + hrs });
    sheet.getRange(i + 1, 16).setValue('Approved');
    sheet.getRange(i + 1, 19).setValue(hrs);
    sheet.getRange(i + 1, 20).setValue(now);
    sheet.getRange(i + 1, 25).setValue(JSON.stringify(audit));
    var empEmail = String(rows[i][1]);
    createNotificationRecord(empEmail, 'OT_APPROVED', 'Your OT request for ' + String(rows[i][5]) + ' has been approved (' + hrs + ' hrs).', otId, 'otId');
    return _json({ success: true, message: 'OT request approved' });
  }
  return _json({ success: false, message: 'OT request not found' });
}

function returnOTRequest(otId, approverEmail, remarks) {
  if (!otId || !approverEmail) return _json({ success: false, message: 'Missing parameters' });
  var sheet = initOTSheet();
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) !== String(otId)) continue;
    var status = String(rows[i][15]);
    if (status !== 'Submitted' && status !== 'Pending Approval')
      return _json({ success: false, message: 'Cannot return OT in status: ' + status });
    var now = Utilities.formatDate(new Date(), 'Asia/Manila', "yyyy-MM-dd'T'HH:mm:ss+08:00");
    var audit = [];
    try { audit = JSON.parse(String(rows[i][24] || '[]')); } catch(e) {}
    audit.push({ action: 'RETURNED', by: approverEmail, at: now, remarks: remarks || '' });
    sheet.getRange(i + 1, 16).setValue('Returned for Revision');
    sheet.getRange(i + 1, 21).setValue(remarks || '');
    sheet.getRange(i + 1, 25).setValue(JSON.stringify(audit));
    var empEmail = String(rows[i][1]);
    createNotificationRecord(empEmail, 'OT_RETURNED', 'Your OT request for ' + String(rows[i][5]) + ' was returned for revision. Remarks: ' + (remarks || ''), otId, 'otId');
    return _json({ success: true, message: 'OT request returned for revision' });
  }
  return _json({ success: false, message: 'OT request not found' });
}

function rejectOTRequest(otId, approverEmail, reason) {
  if (!otId || !approverEmail) return _json({ success: false, message: 'Missing parameters' });
  var sheet = initOTSheet();
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) !== String(otId)) continue;
    var now = Utilities.formatDate(new Date(), 'Asia/Manila', "yyyy-MM-dd'T'HH:mm:ss+08:00");
    var audit = [];
    try { audit = JSON.parse(String(rows[i][24] || '[]')); } catch(e) {}
    audit.push({ action: 'REJECTED', by: approverEmail, at: now, remarks: reason || '' });
    sheet.getRange(i + 1, 16).setValue('Rejected');
    sheet.getRange(i + 1, 22).setValue(reason || '');
    sheet.getRange(i + 1, 25).setValue(JSON.stringify(audit));
    var empEmail = String(rows[i][1]);
    createNotificationRecord(empEmail, 'OT_REJECTED', 'Your OT request for ' + String(rows[i][5]) + ' was rejected. Reason: ' + (reason || ''), otId, 'otId');
    return _json({ success: true, message: 'OT request rejected' });
  }
  return _json({ success: false, message: 'OT request not found' });
}

function cancelOTRequest(otId, employeeEmail) {
  if (!otId || !employeeEmail) return _json({ success: false, message: 'Missing parameters' });
  var sheet = initOTSheet();
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) !== String(otId)) continue;
    var email = String(rows[i][1]).trim().toLowerCase();
    if (email !== employeeEmail.toLowerCase() && !isAdminRole(employeeEmail))
      return _json({ success: false, message: 'Unauthorized' });
    var status = String(rows[i][15]);
    if (status === 'Approved' || status === 'Cancelled')
      return _json({ success: false, message: 'Cannot cancel OT in status: ' + status });
    var now = Utilities.formatDate(new Date(), 'Asia/Manila', "yyyy-MM-dd'T'HH:mm:ss+08:00");
    var audit = [];
    try { audit = JSON.parse(String(rows[i][24] || '[]')); } catch(e) {}
    audit.push({ action: 'CANCELLED', by: employeeEmail, at: now, remarks: '' });
    sheet.getRange(i + 1, 16).setValue('Cancelled');
    sheet.getRange(i + 1, 25).setValue(JSON.stringify(audit));
    createNotificationRecord(ADMIN_EMAIL, 'OT_CANCELLED', (String(rows[i][2]) || email) + ' cancelled their OT request for ' + String(rows[i][5]) + '.', otId, 'otId');
    return _json({ success: true, message: 'OT request cancelled' });
  }
  return _json({ success: false, message: 'OT request not found' });
}

function buildOTRecord(row) {
  var audit = [];
  try { audit = JSON.parse(String(row[24] || '[]')); } catch(e) {}
  return {
    id: String(row[0]), employeeEmail: String(row[1]), employeeName: String(row[2]),
    department: String(row[3]), designation: String(row[4]),
    otDate: String(row[5]), otType: String(row[6]),
    preShiftStart: String(row[7] || ''), preShiftEnd: String(row[8] || ''),
    postShiftStart: String(row[9] || ''), postShiftEnd: String(row[10] || ''),
    totalRequestedHours: Number(row[11] || 0), reason: String(row[12] || ''),
    attachmentUrl: String(row[13] || ''), attachmentId: String(row[14] || ''),
    status: String(row[15]), approverEmail: String(row[16] || ''), approverName: String(row[17] || ''),
    approvedHours: row[18] !== '' ? Number(row[18]) : null,
    approvedAt: String(row[19] || ''), returnRemarks: String(row[20] || ''),
    rejectionReason: String(row[21] || ''), submittedAt: String(row[22] || ''),
    createdAt: String(row[23] || ''), auditTrail: audit
  };
}

function getOTListGAS(email) {
  var sheet = initOTSheet();
  var rows = sheet.getDataRange().getValues();
  var imgMap = getEmpImageMap();
  var isAdmin = isAdminRole(email);
  var emailLower = email.toLowerCase();
  var records = [];
  for (var i = 1; i < rows.length; i++) {
    var rowEmail = String(rows[i][1] || '').trim().toLowerCase();
    if (!isAdmin && rowEmail !== emailLower) continue;
    var rec = buildOTRecord(rows[i]);
    rec.employeeImage = imgMap[rowEmail] || '';
    records.push(rec);
  }
  records.reverse();
  return _json({ success: true, records: records });
}

function getOTByIdGAS(otId, requesterEmail) {
  var sheet = initOTSheet();
  var rows = sheet.getDataRange().getValues();
  var imgMap = getEmpImageMap();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) !== String(otId)) continue;
    var rowEmail = String(rows[i][1]).trim().toLowerCase();
    if (rowEmail !== requesterEmail.toLowerCase() && !isAdminRole(requesterEmail))
      return _json({ success: false, message: 'Unauthorized' });
    var rec = buildOTRecord(rows[i]);
    rec.employeeImage = imgMap[rowEmail] || '';
    return _json({ success: true, data: rec });
  }
  return _json({ success: false, message: 'OT request not found' });
}

// Exposed for generateNewDTR integration
function getApprovedOTByDate(empEmail, dateKey) {
  var sheet = initOTSheet();
  var rows = sheet.getDataRange().getValues();
  var result = [];
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][1]).trim().toLowerCase() !== empEmail.toLowerCase()) continue;
    if (String(rows[i][15]) !== 'Approved') continue;
    if (String(rows[i][5]) !== dateKey) continue;
    result.push(buildOTRecord(rows[i]));
  }
  return result;
}
`;
