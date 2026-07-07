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
  | 'TC_CANCELLED'
  | 'DTR_GENERATED'
  | 'DTR_REGENERATED'
  | 'DTR_ISSUE_SUBMITTED'
  | 'DTR_READY_FOR_REVIEW'
  | 'DTR_ACKNOWLEDGED'
  | 'DTR_REOPENED'
  | 'WFH_SUBMITTED'
  | 'WFH_EOD_SUBMITTED'
  | 'WFH_REVISION_REQUESTED'
  | 'WFH_APPROVED'
  | 'WFH_REJECTED'
  | 'WFH_RESUBMITTED'
  | 'WFH_PENDING_APPROVAL'
  | 'OT_SUBMITTED'
  | 'OT_REQUIRES_APPROVAL'
  | 'OT_APPROVED'
  | 'OT_RETURNED'
  | 'OT_REJECTED'
  | 'OT_CANCELLED';

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  message: string;
  leaveId?: string;
  timeCorrectionId?: string;
  dtrId?: string;
  wfhId?: string;
  otId?: string;
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

// ── DTR Management ─────────────────────────────────────────────────

export type DTRStatus =
  | 'Draft'
  | 'Generated'
  | 'Sent to Employee'
  | 'Acknowledged'
  | 'Returned for Review'
  | 'Regenerated'
  | 'Finalized';

export type DTRCutOff = '1st' | '2nd';

export type AttendanceStatus =
  | 'Present'
  | 'Late'
  | 'Absent'
  | 'Half Day'
  | 'Official Business'
  | 'Holiday'
  | 'Rest Day'
  | 'Approved Leave'
  | 'Missing Time In'
  | 'Missing Time Out';

export type DTRIssueType =
  | 'Missing Time In'
  | 'Missing Time Out'
  | 'Incorrect Schedule'
  | 'Incorrect Leave'
  | 'Wrong Attendance Status'
  | 'Missing Photo'
  | 'Incorrect Location'
  | 'Other';

export interface DTRDayRecord {
  date: string;
  dayOfWeek: string;
  timeIn?: string;
  timeOut?: string;
  timeOutDate?: string;
  workPeriodLabel?: string;
  workingHours?: number;
  status: AttendanceStatus;
  address?: string;
  latitude?: number;
  longitude?: number;
  timeInImageUrl?: string;
  timeInImageId?: string;
  timeOutImageUrl?: string;
  timeOutImageId?: string;
  timeInTimestamp?: string;
  timeOutTimestamp?: string;
  deviceUsed?: string;
  remarks?: string;
}

export interface DTRSummary {
  totalWorkingDays: number;
  daysPresent: number;
  daysAbsent: number;
  approvedLeave: number;
  lateCount: number;
  undertimeCount: number;
  missingTimeIn: number;
  missingTimeOut: number;
  totalHoursWorked: number;
}

export interface DTRIssue {
  id: string;
  dtrId: string;
  employeeEmail: string;
  employeeName: string;
  issueType: DTRIssueType;
  comments: string;
  submittedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface DTRAuditEntry {
  action: string;
  performedBy: string;
  performedAt: string;
  note?: string;
}

// ── Meal Allowance ─────────────────────────────────────────────────

export interface MealAllowanceConfig {
  enabled: boolean;
  secondEnabled: boolean;
  minHours1: number;
  minHours2: number;
  maxCount: number;
}

export interface MealAllowanceRecord {
  id: string;
  attendanceId: string;
  employeeEmail: string;
  employeeName: string;
  sequence: number;
  imageId: string;
  imageUrl: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  address: string;
  timestamp: string;
  remarks: string;
  deviceInfo: string;
}

export interface MealAllowanceStatus {
  attendanceId: string | null;
  timeInTimestamp: string | null;
  hoursWorked: number;
  submissions: MealAllowanceRecord[];
  config: MealAllowanceConfig;
}

// ── Work From Home ────────────────────────────────────────────────

export type WFHStatus =
  | 'Draft'
  | 'Submitted'
  | 'Pending Review'
  | 'Revision Required'
  | 'Resubmitted'
  | 'Approved'
  | 'Rejected'
  | 'Closed';

export interface WFHAuditEntry {
  action: string;
  by: string;
  byRole: string;
  prevStatus: string;
  newStatus: string;
  timestamp: string;
  comments?: string;
  deviceInfo?: string;
}

export interface WFHAttachment {
  fileId: string;
  fileName: string;
  fileUrl: string;
  uploadedAt: string;
  version: number;
}

export interface WFHRecord {
  id: string;
  attendanceId: string;
  employeeEmail: string;
  employeeName: string;
  department: string;
  designation: string;
  attendanceDate: string;
  timeIn: string;
  timeOut?: string;
  workDescription: string;
  plannedTasks: string;
  expectedDeliverables: string;
  additionalNotes?: string;
  remarks?: string;
  eodSummary?: string;
  eodAccomplishments?: string;
  eodIssues?: string;
  eodDeliverables?: string;
  eodNextDayPlan?: string;
  eodRemarks?: string;
  eodSubmittedAt?: string;
  attachments: WFHAttachment[];
  status: WFHStatus;
  approverEmail?: string;
  approverName?: string;
  approvalComments?: string;
  approvedAt?: string;
  revisionCount: number;
  submittedAt: string;
  updatedAt: string;
  auditTrail: WFHAuditEntry[];
  version: number;
}

export interface WFHStatusResult {
  attendanceId: string | null;
  timeInTimestamp: string | null;
  wfhRecord: WFHRecord | null;
  eodRequired: boolean;
  canTimeOut: boolean;
}

export interface DTRRecord {
  id: string;
  version: number;
  employeeEmail: string;
  employeeName: string;
  employeeNumber?: string;
  employeeImage?: string;
  department: string;
  designation: string;
  branch?: string;
  month: number;
  year: number;
  cutOff: DTRCutOff;
  coverageStart: string;
  coverageEnd: string;
  status: DTRStatus;
  generatedBy: string;
  generatedAt: string;
  sentAt?: string;
  viewedAt?: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  acknowledgedRole?: string;
  days: DTRDayRecord[];
  summary: DTRSummary;
  issues?: DTRIssue[];
  auditTrail?: DTRAuditEntry[];
}

// ── Generated DTR (New Workflow) ─────────────────────────────────────

export type GeneratedDTRStatus =
  | 'Generated'
  | 'Under Validation'
  | 'Ready for Review'
  | 'Acknowledged'
  | 'Reopened';

export type AttendanceClassification =
  | 'Present'
  | 'Late'
  | 'Absent'
  | 'Holiday'
  | 'Rest Day'
  | 'Approved Leave'
  | 'Official Business'
  | 'Work From Home'
  | 'Half Day';

export interface OriginalRecordSnapshot {
  timeIn?: string;
  timeOut?: string;
  timeInTimestamp?: string;
  timeOutTimestamp?: string;
  latitude?: number;
  longitude?: number;
  address?: string;
  deviceInfo?: string;
  timeInImageId?: string;
  timeInImageUrl?: string;
  timeOutImageId?: string;
  timeOutImageUrl?: string;
}

export interface GeneratedDTRDay {
  date: string;
  dayOfWeek: string;

  // Working copy (editable during validation)
  timeIn?: string;
  timeOut?: string;
  totalHoursWorked: number;
  actualOT: number;
  approvedOT: number;
  validatedOT: number;
  mealEligibility: boolean;
  attendanceClassification: AttendanceClassification;
  attendanceRemarks: string;

  // Manual late (editable)
  lateHours: number;
  lateMinutes: number;

  // Original record snapshot (read-only reference)
  originalRecord: OriginalRecordSnapshot;

  // Source references
  sourceAttendanceIds: string[];
  sourceLeaveId?: string;
  sourceWFHId?: string;
  sourceOBId?: string;
  sourceOTId?: string;
  sourceMealAllowanceIds: string[];

  // Linked details for display
  mealAllowances: LinkedMealAllowance[];
  timeCorrections: LinkedTimeCorrection[];
  leaves: LinkedLeave[];
  wfh: LinkedWFH[];
  overtimes: LinkedOT[];

  // Validation metadata
  lastModifiedBy?: string;
  lastModifiedAt?: string;
}

export interface LinkedMealAllowance {
  id: string;
  sequence: number;
  imageUrl?: string;
  imageId?: string;
  address?: string;
  timestamp: string;
  remarks?: string;
}

export interface LinkedTimeCorrection {
  id: string;
  status: string;
  reason: string;
  originalTimeIn: string;
  originalTimeOut: string;
  correctedTimeIn: string;
  correctedTimeOut: string;
  documentUrl?: string;
}

export interface LinkedLeave {
  id: string;
  leaveType: string;
  status: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason?: string;
}

export interface LinkedWFH {
  id: string;
  status: string;
  workDescription: string;
  eodSummary?: string;
  eodSubmittedAt?: string;
  attachments?: WFHAttachment[];
}

export interface GeneratedDTRSummary {
  presentDays: number;
  absentDays: number;
  holidays: number;
  restDays: number;
  leaveDays: number;
  officialBusinessDays: number;
  wfhDays: number;
  totalHoursWorked: number;
  totalLateHours: number;
  totalLateMinutes: number;
  totalApprovedOT: number;
  totalActualOT: number;
  totalValidatedOT: number;
  mealEligibleDays: number;
}

// ── Overtime Filing ───────────────────────────────────────────────

export type OTType = 'Pre-Shift' | 'Post-Shift';

export type OTStatus =
  | 'Draft'
  | 'Submitted'
  | 'Pending Approval'
  | 'Returned for Revision'
  | 'Approved'
  | 'Rejected'
  | 'Cancelled';

export interface OTAuditEntry {
  action: string;
  by: string;
  at: string;
  remarks?: string;
}

export interface OTRequest {
  id: string;
  employeeEmail: string;
  employeeName: string;
  employeeImage?: string;
  department: string;
  designation: string;
  otDate: string;
  otType: OTType;
  preShiftStart?: string;
  preShiftEnd?: string;
  postShiftStart?: string;
  postShiftEnd?: string;
  totalRequestedHours: number;
  reason: string;
  attachmentUrl?: string;
  attachmentId?: string;
  status: OTStatus;
  approverEmail?: string;
  approverName?: string;
  approvedHours?: number;
  approvedAt?: string;
  returnRemarks?: string;
  rejectionReason?: string;
  submittedAt?: string;
  createdAt: string;
  auditTrail: OTAuditEntry[];
}

export interface LinkedOT {
  id: string;
  otDate: string;
  otType: OTType;
  status: OTStatus;
  preShiftStart?: string;
  preShiftEnd?: string;
  postShiftStart?: string;
  postShiftEnd?: string;
  totalRequestedHours: number;
  approvedHours?: number;
  reason: string;
  approverEmail?: string;
  approverName?: string;
  approvedAt?: string;
  attachmentUrl?: string;
}

export interface GeneratedDTRAuditEntry {
  id: string;
  date: string;
  field: string;
  originalValue: string;
  updatedValue: string;
  modifiedBy: string;
  modifiedAt: string;
  remarks?: string;
}

export interface GeneratedDTR {
  id: string;
  version: number;
  employeeEmail: string;
  employeeName: string;
  employeeId?: string;
  employeeImage?: string;
  department: string;
  designation: string;
  month: number;
  year: number;
  cutOff: DTRCutOff;
  coverageStart: string;
  coverageEnd: string;
  status: GeneratedDTRStatus;
  generatedBy: string;
  generatedAt: string;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  reopenedBy?: string;
  reopenedAt?: string;
  days: GeneratedDTRDay[];
  summary: GeneratedDTRSummary;
  auditTrail: GeneratedDTRAuditEntry[];
}
