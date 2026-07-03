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
}): Promise<{ success: boolean; message: string; dtrId?: string }> {
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
  email: string, adminEmail?: string
): Promise<{ success: boolean; records: DTRRecord[] }> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return { success: false, records: [] };
  try {
    const params = new URLSearchParams({ action: 'getDTRList', email });
    if (adminEmail) params.set('adminEmail', adminEmail);
    else params.set('adminEmail', '');
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
): Promise<{ success: boolean; message: string }> {
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
  if (action === 'getDTRList')       return email ? getDTRList(email, p.adminEmail || '') : _json({ success: false, message: 'Email required' });
  if (action === 'getDTRById')       return p.dtrId ? getDTRById(p.dtrId, email) : _json({ success: false, message: 'dtrId required' });
  if (action === 'getEmployeesForDTR') return (email && email.toLowerCase() === ADMIN_EMAIL) ? getEmployeeList() : _json({ success: false, message: 'Unauthorized' });
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
      // Legacy rows had 8 cols: [id,email,type,msg,refId,refField,isRead,createdAt]
      // Detect by checking if col 5 is a boolean-like value vs a string label like 'dtrId'
      var col5   = rows[i][5];
      var isLegacy8Col = (col5 !== 'true' && col5 !== 'false' && col5 !== true && col5 !== false && String(col5).length > 0);
      var isReadVal  = isLegacy8Col ? rows[i][6] : col5;
      var createdVal = isLegacy8Col ? rows[i][7] : rows[i][6];
      results.push({
        id:                 rows[i][0],
        userId:             rows[i][1],
        type:               nType,
        message:            rows[i][3],
        leaveId:            nType.indexOf('LEAVE_') === 0 || nType === 'PENDING_APPROVAL' ? refId : '',
        timeCorrectionId:   nType.indexOf('TC_') === 0 ? refId : '',
        dtrId:              nType.indexOf('DTR_') === 0 ? refId : '',
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

  // Pull attendance records for this employee.
  // We load one extra calendar day beyond endDay to catch overnight TIME_OUTs.
  var attSheet = ss.getSheetByName('Attendance');
  var attRows  = attSheet ? attSheet.getDataRange().getValues() : [];

  // Helper: format a Date to M/D/YYYY key
  function dateKey(d) {
    return (d.getMonth()+1) + '/' + d.getDate() + '/' + d.getFullYear();
  }

  // endDayDate is the last coverage date; nextDay is endDay+1 for overnight look-ahead
  var endDayDate = new Date(year, month - 1, endDay);
  var nextDayDate = new Date(year, month - 1, endDay + 1);
  var nextDayKey  = dateKey(nextDayDate);

  var empAttMap = {}; // dateKey -> { timeIn: entry|null, timeOut: entry|null }
  // Also keep a separate bucket for records on the day AFTER coverage end (overnight)
  var nextDayBucket = { timeIn: null, timeOut: null };

  for (var ai = 1; ai < attRows.length; ai++) {
    var rowEmail  = String(attRows[ai][3] || '').trim().toLowerCase();
    if (rowEmail !== empEmail) continue;

    // Use actual timestamp for tsMs — most reliable for ordering
    var tsRaw = attRows[ai][5];
    var tsMs  = tsRaw instanceof Date ? tsRaw.getTime() : new Date(String(tsRaw || '')).getTime();
    if (isNaN(tsMs)) continue;

    // Derive the calendar date from col 6 (Date column)
    var rawDate = attRows[ai][6];
    var dateStr = rawDate instanceof Date
      ? dateKey(rawDate)
      : String(rawDate || '').trim();
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) {
      // Fall back: derive date from timestamp
      var tsDate = new Date(tsMs);
      dateStr = dateKey(tsDate);
      d = tsDate;
    }

    var action = String(attRows[ai][4] || '').trim();
    var entry  = {
      time:      String(attRows[ai][7]  || ''),
      timestamp: String(attRows[ai][5] instanceof Date
        ? Utilities.formatDate(attRows[ai][5], 'Asia/Manila', "yyyy-MM-dd'T'HH:mm:ss'+08:00'")
        : (attRows[ai][5] || '')),
      latitude:  Number(attRows[ai][8]  || 0),
      longitude: Number(attRows[ai][9]  || 0),
      address:   String(attRows[ai][11] || ''),
      imageId:   String(attRows[ai][15] || ''),
      imageUrl:  String(attRows[ai][16] || ''),
      tsMs:      tsMs
    };

    // Check if this row falls within coverage range (including endDay+1 for overnight)
    var inCoverage = (d.getFullYear() === year && (d.getMonth()+1) === month
                      && d.getDate() >= startDay && d.getDate() <= endDay);
    var isNextDay  = (dateStr === nextDayKey);

    if (inCoverage) {
      if (!empAttMap[dateStr]) empAttMap[dateStr] = { timeIn: null, timeOut: null };
      if (action === 'TIME_IN') {
        // Keep earliest TIME_IN
        if (!empAttMap[dateStr].timeIn || tsMs < empAttMap[dateStr].timeIn.tsMs)
          empAttMap[dateStr].timeIn = entry;
      } else if (action === 'TIME_OUT') {
        // Keep latest TIME_OUT
        if (!empAttMap[dateStr].timeOut || tsMs > empAttMap[dateStr].timeOut.tsMs)
          empAttMap[dateStr].timeOut = entry;
      }
    } else if (isNextDay && action === 'TIME_OUT') {
      // Candidate overnight TIME_OUT — keep the latest one on the next day
      if (!nextDayBucket.timeOut || tsMs > nextDayBucket.timeOut.tsMs)
        nextDayBucket.timeOut = entry;
    }
  }

  // Overnight shift resolution:
  // For every coverage date that has TIME_IN but NO TIME_OUT,
  // check if the next calendar day has an unmatched TIME_OUT and assign it.
  for (var dk in empAttMap) {
    var slot = empAttMap[dk];
    if (slot.timeIn && !slot.timeOut) {
      var slotDate = new Date(dk);
      var slotNext = new Date(slotDate.getFullYear(), slotDate.getMonth(), slotDate.getDate() + 1);
      var slotNextKey = dateKey(slotNext);
      // Check nextDayBucket (last coverage day) or the next day's own slot
      var candidate = null;
      if (slotNextKey === nextDayKey && nextDayBucket.timeOut) {
        candidate = nextDayBucket.timeOut;
      } else if (empAttMap[slotNextKey] && empAttMap[slotNextKey].timeOut) {
        // Only use it if the next day has no TIME_IN of its own (unambiguous overnight)
        if (!empAttMap[slotNextKey].timeIn) {
          candidate = empAttMap[slotNextKey].timeOut;
          empAttMap[slotNextKey].timeOut = null; // consumed
        }
      }
      if (candidate && candidate.tsMs > slot.timeIn.tsMs) {
        slot.timeOut = candidate;
      }
    }
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

  // Build day records
  var days = [];
  var summary = {
    totalWorkingDays: 0, daysPresent: 0, daysAbsent: 0,
    approvedLeave: 0, lateCount: 0, undertimeCount: 0,
    missingTimeIn: 0, missingTimeOut: 0, totalHoursWorked: 0
  };
  var dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  for (var day = startDay; day <= endDay; day++) {
    var dt    = new Date(year, month - 1, day);
    var dow   = dt.getDay();
    var dKey  = month + '/' + day + '/' + year;
    var isRestDay = (dow === 0 || dow === 6);
    var att   = empAttMap[dKey] || {};
    var isLeave = approvedLeaveDates[dKey] || false;

    var status, workHours = 0;
    if (isRestDay) {
      status = 'Rest Day';
    } else if (isLeave) {
      status = 'Approved Leave';
      summary.approvedLeave++;
    } else if (!att.timeIn && !att.timeOut) {
      status = 'Absent';
      summary.daysAbsent++;
      summary.totalWorkingDays++;
    } else {
      summary.totalWorkingDays++;
      summary.daysPresent++;
      if (!att.timeIn) { status = 'Missing Time In'; summary.missingTimeIn++; }
      else if (!att.timeOut) { status = 'Missing Time Out'; summary.missingTimeOut++; }
      else {
        // Compute hours
        var tin  = new Date(att.timeIn.timestamp);
        var tout = new Date(att.timeOut.timestamp);
        if (!isNaN(tin.getTime()) && !isNaN(tout.getTime())) {
          workHours = (tout.getTime() - tin.getTime()) / 3600000;
          summary.totalHoursWorked += workHours;
        }
        // Late check (after 8:00 AM)
        var tinHr = tin.getHours ? tin.getHours() : 0;
        var tinMin = tin.getMinutes ? tin.getMinutes() : 0;
        if (tinHr > 8 || (tinHr === 8 && tinMin > 0)) summary.lateCount++;
        status = 'Present';
      }
    }

    days.push({
      date:             dKey,
      dayOfWeek:        dayNames[dow],
      timeIn:           att.timeIn  ? att.timeIn.time  : '',
      timeOut:          att.timeOut ? att.timeOut.time  : '',
      workingHours:     Math.round(workHours * 100) / 100,
      status:           status,
      address:          att.timeIn  ? att.timeIn.address : '',
      latitude:         att.timeIn  ? att.timeIn.latitude  : 0,
      longitude:        att.timeIn  ? att.timeIn.longitude : 0,
      timeInImageUrl:   att.timeIn  ? att.timeIn.imageUrl  : '',
      timeInImageId:    att.timeIn  ? att.timeIn.imageId   : '',
      timeOutImageUrl:  att.timeOut ? att.timeOut.imageUrl : '',
      timeOutImageId:   att.timeOut ? att.timeOut.imageId  : '',
      timeInTimestamp:  att.timeIn  ? att.timeIn.timestamp  : '',
      timeOutTimestamp: att.timeOut ? att.timeOut.timestamp : '',
      remarks:          ''
    });
  }
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

  var now   = Utilities.formatDate(new Date(), 'Asia/Manila', "yyyy-MM-dd'T'HH:mm:ss'+08:00'");
  var dtrId = Utilities.getUuid();
  var auditTrail = [{ action: 'Generated', performedBy: adminEmail, performedAt: now }];

  var sheet = initDTRSheet();
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
  var adminLowerR = adminEmail.toLowerCase();
  var isAdminR = adminLowerR === ADMIN_EMAIL;
  if (!isAdminR) {
    var empSheetR = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Employee');
    var empRowsR  = empSheetR ? empSheetR.getDataRange().getValues() : [];
    for (var eiR = 1; eiR < empRowsR.length; eiR++) {
      if (String(empRowsR[eiR][0] || '').trim().toLowerCase() === adminLowerR) {
        var roleR = String(empRowsR[eiR][3] || '').trim().toLowerCase();
        if (roleR === 'admin' || roleR === 'superadmin') { isAdminR = true; break; }
      }
    }
  }
  if (!isAdminR) return _json({ success: false, message: 'Unauthorized' });
  var sheet = initDTRSheet();
  var rows  = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) !== String(dtrId)) continue;
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

function getDTRList(email, adminEmail) {
  var sheet = initDTRSheet();
  var rows  = sheet.getDataRange().getValues();
  var adminLower = adminEmail ? adminEmail.toLowerCase() : '';
  var isAdmin = adminLower === ADMIN_EMAIL;
  if (!isAdmin && adminLower) {
    var empSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Employee');
    var empRows  = empSheet ? empSheet.getDataRange().getValues() : [];
    for (var ei = 1; ei < empRows.length; ei++) {
      if (String(empRows[ei][0] || '').trim().toLowerCase() === adminLower) {
        var role = String(empRows[ei][3] || '').trim().toLowerCase();
        if (role === 'admin' || role === 'superadmin') { isAdmin = true; break; }
      }
    }
  }
  var records = [];
  for (var i = 1; i < rows.length; i++) {
    var empEmail = String(rows[i][2] || '').trim().toLowerCase();
    if (!isAdmin && empEmail !== email.toLowerCase()) continue;
    records.push({
      id:            String(rows[i][0]),
      version:       Number(rows[i][1]),
      employeeEmail: empEmail,
      employeeName:  String(rows[i][3]),
      department:    String(rows[i][5]),
      designation:   String(rows[i][6]),
      month:         Number(rows[i][8]),
      year:          Number(rows[i][9]),
      cutOff:        String(rows[i][10]),
      coverageStart: String(rows[i][11]),
      coverageEnd:   String(rows[i][12]),
      status:        String(rows[i][13]),
      generatedBy:   String(rows[i][14]),
      generatedAt:   String(rows[i][15]),
      sentAt:        String(rows[i][16] || ''),
      acknowledgedAt:String(rows[i][18] || ''),
      acknowledgedBy:String(rows[i][19] || '')
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
    var isAdmin  = reqLower === ADMIN_EMAIL;
    if (!isAdmin && reqLower) {
      var empSheet2 = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Employee');
      var empRows2  = empSheet2 ? empSheet2.getDataRange().getValues() : [];
      for (var ei2 = 1; ei2 < empRows2.length; ei2++) {
        if (String(empRows2[ei2][0] || '').trim().toLowerCase() === reqLower) {
          var role2 = String(empRows2[ei2][3] || '').trim().toLowerCase();
          if (role2 === 'admin' || role2 === 'superadmin') { isAdmin = true; break; }
        }
      }
    }
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

    return _json({ success: true, record: {
      id:            String(rows[i][0]),
      version:       Number(rows[i][1]),
      employeeEmail: empEmail,
      employeeName:  String(rows[i][3]),
      employeeNumber:String(rows[i][4]),
      department:    String(rows[i][5]),
      designation:   String(rows[i][6]),
      branch:        String(rows[i][7] || ''),
      month:         Number(rows[i][8]),
      year:          Number(rows[i][9]),
      cutOff:        String(rows[i][10]),
      coverageStart: String(rows[i][11]),
      coverageEnd:   String(rows[i][12]),
      status:        String(rows[i][13]),
      generatedBy:   String(rows[i][14]),
      generatedAt:   String(rows[i][15]),
      sentAt:        String(rows[i][16] || ''),
      viewedAt:      String(rows[i][17] || ''),
      acknowledgedAt:String(rows[i][18] || ''),
      acknowledgedBy:String(rows[i][19] || ''),
      days:          days,
      summary:       summary,
      issues:        issues,
      auditTrail:    audit
    }});
  }
  return _json({ success: false, message: 'DTR not found' });
}

function acknowledgeDTR(dtrId, employeeEmail) {
  if (!dtrId || !employeeEmail) return _json({ success: false, message: 'Missing parameters' });
  var sheet = initDTRSheet();
  var rows  = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) !== String(dtrId)) continue;
    var empEmail = String(rows[i][2] || '').trim().toLowerCase();
    if (empEmail !== employeeEmail.toLowerCase()) return _json({ success: false, message: 'Unauthorized' });
    if (rows[i][18]) return _json({ success: false, message: 'DTR already acknowledged' });
    var now = Utilities.formatDate(new Date(), 'Asia/Manila', "yyyy-MM-dd'T'HH:mm:ss'+08:00'");
    sheet.getRange(i + 1, 14).setValue('Acknowledged');
    sheet.getRange(i + 1, 19).setValue(now);
    sheet.getRange(i + 1, 20).setValue(String(rows[i][3]));
    var audit = [];
    try { audit = JSON.parse(String(rows[i][22] || '[]')); } catch(e) {}
    audit.push({ action: 'Acknowledged', performedBy: employeeEmail, performedAt: now });
    sheet.getRange(i + 1, 23).setValue(JSON.stringify(audit));
    // Notify admin
    createNotificationRecord(ADMIN_EMAIL, 'DTR_GENERATED',
      String(rows[i][3]) + ' acknowledged their DTR for cut-off ' + String(rows[i][10]) + '.', dtrId, 'dtrId');
    return _json({ success: true, message: 'DTR acknowledged' });
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

function createNotificationRecord(toEmail, type, message, refId, refField) {
  var sheet = getNotificationsSheet();
  var now = Utilities.formatDate(new Date(), 'Asia/Manila', "yyyy-MM-dd'T'HH:mm:ss+08:00");
  sheet.appendRow([Utilities.getUuid(), toEmail, type, message, refId || '', 'false', now]);
}
`;
