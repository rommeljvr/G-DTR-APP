export interface Employee {
  name: string;
  email: string;
  role: string;
  department: string;
  designation: string;
  image?: string;
  hourlyWage?: number;
}

export interface User {
  email: string;
  name: string;
  picture: string;
  id: string;
  // Employee fields from validation
  employee?: Employee;
}

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
  address: string;
  timestamp: string;
  formattedDate: string;
  formattedTime: string;
}

export interface AttendanceRecord {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  action: 'TIME_IN' | 'TIME_OUT';
  timestamp: string;
  date: string;
  time: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  address: string;
  photo: string;
  imageId?: string;
  imageUrl?: string;
  deviceInfo: string;
  // Employee info
  department?: string;
  designation?: string;
}

export interface DeviceInfo {
  userAgent: string;
  platform: string;
  screenSize: string;
  deviceType: string;
}

export type AppScreen = 'login' | 'dashboard' | 'camera' | 'history' | 'setup';

export type LeaveType = 'Vacation Leave' | 'Sick Leave' | 'Birthday Leave' | 'Emergency Leave';
export type LeaveMode = 'Full Day' | 'Half Day';
export type HalfDayPeriod = 'AM' | 'PM';
export type PaymentStatus = 'Paid' | 'Unpaid';

export interface LeaveEntry {
  date: string;
  mode: LeaveMode;
  halfDayPeriod?: HalfDayPeriod;
  days: number;
}

export interface LeaveCredits {
  vacationLeave: number;
  sickLeave: number;
  birthdayLeave: number;
}

export interface LeaveApplication {
  id: string;
  employeeName: string;
  email: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  mode: LeaveMode;
  halfDayPeriod?: HalfDayPeriod;
  entries: LeaveEntry[];
  totalDays: number;
  paymentStatus: PaymentStatus;
  reason: string;
  docId?: string;
  documentUrl?: string;
  status: 'Pending' | 'Acknowledged' | 'Approved' | 'Rejected' | 'Cancelled';
  submittedAt: string;
  rejectionReason?: string;
  teamLeadEmail?: string;
  approverEmail?: string;
  workflowType?: 'DIRECT' | 'TWO_STEP';
  approvalHistory?: LeaveApprovalRecord[];
}

export type WorkflowType = 'DIRECT' | 'TWO_STEP';

export interface ApproverSettings {
  employeeEmail: string;
  employeeName: string;
  teamLeadEmail: string;
  approverEmail: string;
  workflowType: WorkflowType;
}

export interface LeaveApprovalRecord {
  id: string;
  leaveId: string;
  approverEmail: string;
  approverName: string;
  action: 'Acknowledge' | 'Approve' | 'Reject';
  reason?: string;
  timestamp: string;
}

export type NotificationType =
  | 'LEAVE_FILED'
  | 'LEAVE_SUBMITTED'
  | 'LEAVE_ACKNOWLEDGED'
  | 'LEAVE_APPROVED'
  | 'LEAVE_REJECTED'
  | 'PENDING_APPROVAL'
  | 'TC_FILED'
  | 'TC_ACKNOWLEDGED'
  | 'TC_APPROVED'
  | 'TC_REJECTED'
  | 'TC_CANCELLED';

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  message: string;
  leaveId?: string;
  timeCorrectionId?: string;
  isRead: boolean;
  createdAt: string;
}

// ── Time Correction Filing ─────────────────────────────────────────

export type TimeCorrectionStatus = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';

export interface TimeCorrectionFiling {
  id: string;
  employeeName: string;
  email: string;
  department: string;
  designation: string;
  attendanceDate: string;
  attendanceRecordId: string;
  originalTimeIn: string;
  originalTimeOut: string;
  correctedTimeIn: string;
  correctedTimeOut: string;
  reason: string;
  docId?: string;
  documentUrl?: string;
  status: TimeCorrectionStatus;
  submittedAt: string;
  approverEmail?: string;
  rejectionReason?: string;
  approvalHistory?: TimeCorrectionApprovalRecord[];
}

export interface TimeCorrectionApprovalRecord {
  id: string;
  timeCorrectionId: string;
  approverEmail: string;
  approverName: string;
  action: 'Approve' | 'Reject' | 'Cancel';
  reason?: string;
  timestamp: string;
}
