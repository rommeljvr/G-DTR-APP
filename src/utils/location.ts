import { LocationData } from '../types';

export function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this device'));
      return;
    }
    
    // Check if running on HTTP (not HTTPS) - GPS requires HTTPS on mobile
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
      reject(new Error('GPS requires HTTPS. Access via https:// or use localhost'));
      return;
    }
    
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    });
  });
}

export async function reverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`,
      {
        headers: {
          'Accept-Language': 'en',
        },
      }
    );
    if (!response.ok) throw new Error('Geocoding failed');
    const data = await response.json();
    return data.display_name || `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
  } catch {
    return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
  }
}

export function getMapImageUrl(lat: number, lon: number): string {
  // Using OpenStreetMap static map via a free tile service
  const zoom = 16;
  // Use a static map approach with OpenStreetMap tiles
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lon}&zoom=${zoom}&size=300x200&markers=${lat},${lon},red-pushpin`;
}

export async function validateAddressCoordinates(
  lat: number,
  lon: number,
  address: string
): Promise<{ valid: boolean; mismatch: boolean; verifiedAddress: string }> {
  const verifiedAddress = await reverseGeocode(lat, lon);
  const mismatch = verifiedAddress !== address;
  if (mismatch) {
    console.warn(
      `[DTR] Address-coordinate mismatch detected.\n` +
      `  Coordinates : ${lat.toFixed(6)}, ${lon.toFixed(6)}\n` +
      `  Original    : ${address}\n` +
      `  Verified    : ${verifiedAddress}`
    );
  }
  return { valid: !mismatch, mismatch, verifiedAddress };
}

export async function getLocationData(): Promise<LocationData> {
  const position = await getCurrentPosition();
  const { latitude, longitude, accuracy } = position.coords;
  const address = await reverseGeocode(latitude, longitude);
  const now = new Date();

  return {
    latitude,
    longitude,
    accuracy,
    address,
    timestamp: now.toISOString(),
    formattedDate: now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
    formattedTime: now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }),
  };
}
