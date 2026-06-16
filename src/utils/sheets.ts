import { AttendanceRecord, Employee } from '../types';
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
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

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
  if (!sheet || sheet.getLastRow() <= 1) return _json({ success: true, lastAction: null });

  var rows = sheet.getDataRange().getValues();
  for (var i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][3]).trim().toLowerCase() === String(email).trim().toLowerCase()) {
      return _json({
        success: true,
        lastAction: {
          action:      rows[i][4],
          timestamp:   rows[i][5],
          date:        rows[i][6],
          time:        rows[i][7],
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
      records.push({
        id:          rows[i][0],
        action:      rows[i][4],
        timestamp:   rows[i][5],
        date:        rows[i][6],
        time:        rows[i][7],
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
  var sheet = ss.getSheetByName('Employees');
  if (!sheet) {
    sheet = ss.insertSheet('Employees');
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
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    var url = 'https://drive.google.com/uc?export=view&id=' + file.getId();

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
      docId:         cDocId  !== -1 ? String(row[cDocId]  || '') : '',
      docUrl:        docUrlVal,
      status:        cStatus !== -1 ? String(row[cStatus] || 'Pending') : 'Pending',
      submittedAt:   cFiled  !== -1 ? String(row[cFiled]  || '') : ''
    });
  }

  // Sort newest first
  records.sort(function(a, b) {
    return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime();
  });

  return _json({ success: true, records: records });
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
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

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
`;
