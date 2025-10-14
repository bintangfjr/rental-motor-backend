// src/iopgps/iopgps.constants.ts
export const IOPGPS_CONSTANTS = {
  BASE_URL: 'https://api.iopgps.com',
  AUTH_ENDPOINT: '/api/auth',
  VEHICLE_STATUS: '/api/vehicle/status/v2',
  DEVICE_LOCATION: '/api/device/location',
  DEVICE_TRACK: '/api/device/track/history',
  DEVICE_DETAIL: '/api/device/detail',
  TIMEOUT: 10000,
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
};

export const CACHE_TTL = {
  ACCESS_TOKEN: 90 * 60 * 1000, // 90 menit (1.5 jam)
  LOCATION_DATA: 5 * 60 * 1000, // 5 menit untuk cache lokasi
};

export const FALLBACK_CONFIG = {
  MAX_LOCATION_AGE: 30 * 60 * 1000, // 30 menit data lokasi masih dianggap valid
  SYNC_INTERVAL: 2 * 60 * 1000, // 2 menit interval sync
};
