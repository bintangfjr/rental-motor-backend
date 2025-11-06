// src/iopgps/iopgps.constants.ts

/**
 * Constants for IOPGPS API configuration
 * Hanya berisi endpoint PRIORITAS saja
 */
export const IOPGPS_CONSTANTS = {
  // Base URL
  BASE_URL: 'https://open.iopgps.com',

  // ✅ ENDPOINT PRIORITAS SAJA - data yang sering berubah
  AUTH_ENDPOINT: '/api/auth',
  DEVICE_LOCATION: '/api/device/location', // 🚀 HIGH PRIORITY - Lokasi real-time
  VEHICLE_STATUS: '/api/vehicle/status/v2', // 🚀 HIGH PRIORITY - Status kendaraan
  DEVICE_LIST: '/api/device', // 🔶 MEDIUM PRIORITY - List device
  DEVICE_MILES: '/api/device/miles', // 🔶 MEDIUM PRIORITY - Mileage

  // ❌ DIHAPUS: DEVICE_INFO, DEVICE_TRACK - tidak diperlukan

  // API Configuration
  TIMEOUT: 10000, // 10 seconds
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000, // 1 second

  // Rate Limiting (sesuai dokumentasi IOPGPS)
  RATE_LIMIT: {
    AUTH: 2, // Max 2 calls per minute untuk auth
    OTHER: 10, // Max 10 calls per second untuk API lainnya
  },
} as const;

/**
 * Cache configuration - OPTIMIZED UNTUK DATA YANG SERING BERUBAH
 */
export const CACHE_TTL = {
  // ✅ ACCESS TOKEN - tetap
  ACCESS_TOKEN: 90 * 60 * 1000, // 90 menit

  // 🚀 HIGH PRIORITY - Data real-time (cache sangat pendek)
  LOCATION_DATA: 1 * 60 * 1000, // 1 menit - SANGAT PENDEK!
  VEHICLE_STATUS: 1 * 60 * 1000, // 1 menit - SANGAT PENDEK!

  // 🔶 MEDIUM PRIORITY - Data yang agak stabil
  DEVICE_LIST: 30 * 60 * 1000, // 30 menit
  MILEAGE_DATA: 60 * 60 * 1000, // 1 jam

  // ✅ CACHE UNTUK DATA AGGREGATE
  MOTORS_LIST: 2 * 60 * 1000, // 2 menit untuk list motors
  HEALTH_STATUS: 30 * 1000, // 30 detik untuk health check
} as const;

/**
 * Fallback configuration untuk ketika API tidak tersedia
 */
export const FALLBACK_CONFIG = {
  MAX_LOCATION_AGE: 15 * 60 * 1000, // 15 menit data lokasi masih dianggap valid
  SYNC_INTERVAL: 1 * 60 * 1000, // 1 menit interval sync - DIPENDEKAN!

  // ✅ CONFIG BARU UNTUK OPTIMISASI
  BATCH_SIZE: 10, // 10 requests per batch
  BATCH_DELAY: 1000, // 1 detik delay antara batch
  REQUEST_DELAY: 100, // 100ms delay dalam batch

  // ✅ PRIORITAS ENDPOINT DALAM SYNC
  SYNC_PRIORITY: ['DEVICE_LOCATION', 'VEHICLE_STATUS'] as const, // Sync ini dulu
} as const;

/**
 * Endpoint priorities untuk smart caching
 */
export const ENDPOINT_PRIORITIES = {
  HIGH: ['DEVICE_LOCATION', 'VEHICLE_STATUS'] as const, // Sync setiap 1 menit
  MEDIUM: ['DEVICE_LIST', 'DEVICE_MILES'] as const, // Cache 30 menit - 1 jam
} as const;

/**
 * Default values
 */
export const DEFAULT_VALUES = {
  LANGUAGE: 'en',
  PAGE_SIZE: '20',
  CURRENT_PAGE: '1',

  // ✅ DEFAULT BARU
  FORCE_REFRESH: false, // Default gunakan cache
  USE_CACHE: true, // Default aktifkan cache
  SYNC_ENABLED: true, // Auto sync enabled
} as const;

/**
 * Coordinate systems
 */
export const COORDINATE_SYSTEMS = {
  WGS84: 'wgs84', // Default coordinate system
  WGS84LL: 'wgs84ll', // WGS84 Latitude/Longitude
} as const;

// Type exports
export type CoordinateSystem =
  (typeof COORDINATE_SYSTEMS)[keyof typeof COORDINATE_SYSTEMS];

/**
 * Rate limit configuration untuk 100 motor - REALISTIC!
 */
export const RATE_LIMIT_CONFIG = {
  // ✅ KALKULASI UNTUK 2 ENDPOINT HIGH PRIORITY:
  REQUESTS_PER_SYNC: 200, // 100 motor × 2 endpoint = 200 requests
  SYNC_DURATION: 20, // 20 detik (200 requests / 10 req per detik)
  SAFETY_BUFFER: 5, // 5 detik buffer

  // ✅ MAXIMUM DAILY REQUESTS:
  DAILY_SYNC_CYCLES: 1440, // 24 jam / 1 menit = 1440 sync cycles
  DAILY_REQUESTS: 288000, // 1440 cycles × 200 requests = 288,000 requests/hari

  // ❌ PROBLEM: Melebihi typical API limit 100,000/hari!
  // ✅ SOLUSI: Implement ROTATING SYNC
} as const;

/**
 * ROTATING SYNC configuration - SOLUSI UNTUK 288k REQUESTS/HARI
 */
export const ROTATING_SYNC_CONFIG = {
  // ✅ STRATEGI: Sync endpoint secara bergantian
  ENABLED: true,
  CYCLES: {
    CYCLE_1: ['DEVICE_LOCATION'], // Cycle 1: Location saja (100 requests)
    CYCLE_2: ['VEHICLE_STATUS'], // Cycle 2: Status saja (100 requests)
    CYCLE_3: ['DEVICE_LOCATION'], // Cycle 3: Location saja (100 requests)
    CYCLE_4: ['VEHICLE_STATUS'], // Cycle 4: Status saja (100 requests)
  },

  // ✅ KALKULASI BARU DENGAN ROTATING SYNC:
  REQUESTS_PER_SYNC: 100, // 100 requests per sync (1 endpoint)
  SYNC_DURATION: 10, // 10 detik per sync
  DAILY_REQUESTS: 144000, // 1440 cycles × 100 requests = 144,000/hari

  // ✅ MASIH MELEBIHI 100k? IMPLEMENT SMART THROTTLING
  THROTTLING: {
    ENABLED: true,
    MAX_DAILY_REQUESTS: 80000, // Target 80k/hari untuk aman
    SYNC_INTERVAL_ADJUSTED: 2.16 * 60 * 1000, // ≈2 menit 10 detik
  },
} as const;
