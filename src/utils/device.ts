import { DeviceInfo } from '../types';

export function getDeviceInfo(): DeviceInfo {
  const ua = navigator.userAgent;
  let deviceType = 'Desktop';
  
  if (/Android/i.test(ua)) {
    deviceType = 'Android';
  } else if (/iPhone|iPad|iPod/i.test(ua)) {
    deviceType = 'iOS';
  } else if (/Mobile/i.test(ua)) {
    deviceType = 'Mobile';
  } else if (/Tablet/i.test(ua)) {
    deviceType = 'Tablet';
  }

  return {
    userAgent: ua,
    platform: navigator.platform || 'Unknown',
    screenSize: `${window.screen.width}x${window.screen.height}`,
    deviceType,
  };
}

export function getDeviceString(): string {
  const info = getDeviceInfo();
  return `${info.deviceType} | ${info.platform} | ${info.screenSize}`;
}
