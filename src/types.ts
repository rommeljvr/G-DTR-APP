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
