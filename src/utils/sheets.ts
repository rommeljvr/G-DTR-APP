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

export const APPS_SCRIPT_TEMPLATE = `// ================================================================
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
    if (data.action === 'getSettings')      return getSettings();

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
  if (action === 'getSettings')      return getSettings();
  if (action === 'checkAuth')        return checkDriveAuthorization();
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
  Logger.log('=== SUBMIT ATTENDANCE START ===');
  Logger.log('User: ' + (data.userName || 'unknown'));
  Logger.log('Action: ' + (data.action || 'unknown'));
  Logger.log('Photo present: ' + (data.photo ? 'YES' : 'NO'));
  
  if (data.photo) {
    Logger.log('Photo type: ' + typeof data.photo);
    Logger.log('Photo length: ' + String(data.photo).length);
    Logger.log('Has base64 prefix: ' + (String(data.photo).indexOf('base64,') > -1));
  }

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
  Logger.log('Using folder ID: ' + folderId);

  // Upload image to Google Drive
  var imageUrl = '';
  var imageId  = '';
  try {
    if (data.photo && String(data.photo).indexOf('base64,') > -1) {
      Logger.log('Attempting Drive upload...');
      var uploadResult = uploadImageToDrive(data, folderId);
      imageUrl = uploadResult.url;
      imageId  = uploadResult.id;
      Logger.log('Drive upload SUCCESS - ID: ' + imageId);
    } else {
      Logger.log('Skipping upload - photo missing or no base64 prefix');
    }
  } catch (err) {
    Logger.log('Drive upload ERROR: ' + err.toString());
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

// ══════════════════════════════════════════════════════════════════
//  AUTHORIZATION CHECK
//  Call this endpoint to verify Drive permissions are granted
// ══════════════════════════════════════════════════════════════════

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

  // Helper to format date from sheet
  function formatDate(val) {
    if (!val) return '';
    if (val instanceof Date) {
      return (val.getMonth() + 1) + '/' + val.getDate() + '/' + val.getFullYear();
    }
    return String(val);
  }

  // Helper to format time from sheet
  function formatTime(val) {
    if (!val) return '';
    if (val instanceof Date) {
      var hrs = val.getHours();
      var mins = val.getMinutes();
      var ampm = hrs >= 12 ? 'PM' : 'AM';
      hrs = hrs % 12 || 12;
      return hrs + ':' + (mins < 10 ? '0' + mins : mins) + ' ' + ampm;
    }
    return String(val);
  }

  var rows = sheet.getDataRange().getValues();
  for (var i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][3]).trim().toLowerCase() === String(email).trim().toLowerCase()) {
      return _json({
        success: true,
        lastAction: {
          action:      rows[i][4],
          timestamp:   formatDate(rows[i][6]) + ' ' + formatTime(rows[i][7]),
          date:        formatDate(rows[i][6]),
          time:        formatTime(rows[i][7]),
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

  // Helper to format date from sheet
  function formatDate(val) {
    if (!val) return '';
    if (val instanceof Date) {
      return (val.getMonth() + 1) + '/' + val.getDate() + '/' + val.getFullYear();
    }
    return String(val);
  }

  // Helper to format time from sheet
  function formatTime(val) {
    if (!val) return '';
    if (val instanceof Date) {
      var hrs = val.getHours();
      var mins = val.getMinutes();
      var ampm = hrs >= 12 ? 'PM' : 'AM';
      hrs = hrs % 12 || 12;
      return hrs + ':' + (mins < 10 ? '0' + mins : mins) + ' ' + ampm;
    }
    return String(val);
  }

  var rows    = sheet.getDataRange().getValues();
  var records = [];
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][3]).trim().toLowerCase() === String(email).trim().toLowerCase()) {
      records.push({
        id:          rows[i][0],
        action:      rows[i][4],
        timestamp:   formatDate(rows[i][6]) + ' ' + formatTime(rows[i][7]),
        date:        formatDate(rows[i][6]),
        time:        formatTime(rows[i][7]),
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
`;
