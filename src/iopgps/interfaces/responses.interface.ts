// src/iopgps/interfaces/responses.interface.ts

/**
 * Base response interface for all IOPGPS API responses
 */
export interface BaseIopgpsResponse {
  code: number;
  result?: string;
  message?: string;
}

/**
 * Authentication response
 */
export interface IopgpsAuthResponse extends BaseIopgpsResponse {
  accessToken?: string;
  expiresIn?: number;
}

/**
 * Vehicle status response
 */
export interface VehicleStatusResponse extends BaseIopgpsResponse {
  data?: VehicleStatus[];
}

/**
 * Individual vehicle status
 */
export interface VehicleStatus {
  imei: string;
  licenseNumber: string;
  vin?: string;
  lat: number;
  lng: number;
  speed: number;
  direction: number;
  gpsTime: number;
  location: string;
  status: string;
  acc?: string;
  online?: string;
  locType?: string;
  mileage?: number;
  totalMileage?: number;
}

/**
 * Device location response
 */
export interface DeviceLocationResponse extends BaseIopgpsResponse {
  lng?: string;
  lat?: string;
  address?: string;
  gpsTime?: number;
  speed?: number;
  direction?: number;
  locType?: string;
}

// Alias untuk compatibility dengan kode yang sudah ada
export type DeviceLocation = DeviceLocationResponse;

/**
 * Device detail response
 */
export interface DeviceDetailResponse extends BaseIopgpsResponse {
  data?: DeviceDetail;
}

/**
 * Device detail information
 */
export interface DeviceDetail {
  imei: string;
  name?: string;
  deviceMobile?: string;
  useStatus?: number;
  endTime?: number;
  note?: string;
  vehicleBean?: VehicleInfo;
  deviceBrief?: DeviceBrief;
}

/**
 * Vehicle information
 */
export interface VehicleInfo {
  vin?: string;
  licenseNumber?: string;
  carOwner?: string;
  contactUser?: string;
  contactTel?: string;
  contractNumber?: string;
  carType?: string;
  color?: string;
  carBrand?: string;
  carSeries?: string;
  dateOfMake?: number;
}

/**
 * Device brief information
 */
export interface DeviceBrief {
  imei: string;
  name?: string;
  endTime?: number;
  deviceMobile?: string;
  saleTime?: number;
  useStatus?: number;
  note?: string;
}

/**
 * Device track history response
 */
export interface DeviceTrackResponse extends BaseIopgpsResponse {
  data?: TrackPoint[];
}

/**
 * Individual track point
 */
export interface TrackPoint {
  imei: string;
  lat: number;
  lng: number;
  speed: number;
  direction: number;
  gpsTime: number;
  locType: string;
  address?: string;
  mileage?: number;
}

/**
 * Mileage statistics response
 */
export interface MileageResponse extends BaseIopgpsResponse {
  runTime?: number;
  miles?: number;
  totalMiles?: number;
}

/**
 * Device alarm records response
 */
export interface AlarmResponse extends BaseIopgpsResponse {
  details?: AlarmRecord[];
}

/**
 * Individual alarm record
 */
export interface AlarmRecord {
  imei: string;
  alarmType: string;
  alarmTime: number;
  lat: number;
  lng: number;
  speed: number;
  direction: number;
  address?: string;
}

/**
 * Device list paginated response
 */
export interface DeviceListResponse extends BaseIopgpsResponse {
  data?: DeviceListItem[];
  page?: PaginationInfo;
}

/**
 * Device list item
 */
export interface DeviceListItem {
  imei: string;
  name?: string;
  licenseNumber?: string;
  carOwner?: string;
  contactTel?: string;
  online?: string;
  locTime?: number;
  lat?: number;
  lng?: number;
  speed?: number;
  direction?: number;
  address?: string;
  useStatus?: number;
}

/**
 * Pagination information
 */
export interface PaginationInfo {
  currentPage: number;
  pageSize: number;
  totalCount: number;
  totalPage: number;
}

/**
 * Account tree response
 */
export interface AccountTreeResponse extends BaseIopgpsResponse {
  accountId: number;
  account: string;
  userName: string;
  parentAccountId?: number;
  childAccounts?: AccountTreeNode[];
}

/**
 * Account tree node
 */
export interface AccountTreeNode {
  accountId: number;
  account: string;
  userName: string;
  parentAccountId?: number;
  childAccounts?: AccountTreeNode[];
}

/**
 * Fence information
 */
export interface FenceResponse extends BaseIopgpsResponse {
  fenceBeanList?: FenceInfo[];
}

/**
 * Individual fence information
 */
export interface FenceInfo {
  fenceId: number;
  fenceName: string;
  imei: string;
  type: number;
  triggerType: number;
  setting: string;
  oneTime: number;
  createTime: number;
  status: number;
}

/**
 * Command execution response
 */
export interface CommandResponse extends BaseIopgpsResponse {
  details?: CommandResult[];
}

/**
 * Individual command result
 */
export interface CommandResult {
  imei: string;
  uuid: string;
  result: string;
  sendTime: number;
}

/**
 * Device status statistics response
 */
export interface DeviceStatusStatsResponse extends BaseIopgpsResponse {
  staticNum?: number;
  moveNum?: number;
  offlineNum?: number;
  unusedNum?: number;
  total?: number;
}

// Configuration interfaces
export interface IopgpsConfig {
  appid: string;
  secretKey: string;
  baseUrl: string;
  timeout: number;
  maxRetries: number;
}

export interface CacheConfig {
  ttl: number;
  max: number;
  checkperiod?: number;
}

export interface SyncConfig {
  interval: number;
  batchSize: number;
  maxLocationAge: number;
}

export interface IopgpsHealth {
  service: 'healthy' | 'degraded' | 'unhealthy';
  token: boolean;
  api: boolean;
  database: boolean;
  lastSync?: Date;
  stats: {
    totalMotors: number;
    withImei: number;
    synced: number;
    failed: number;
  };
}

// Response interfaces for our backend integration

/**
 * Enhanced motor response with GPS status
 */
export interface MotorWithGpsStatus {
  id: number;
  plat_nomor: string;
  merk: string;
  model: string;
  status: string;
  lat?: number;
  lng?: number;
  last_update?: Date;
  imei?: string;
  no_gsm?: string;
  gps_status: 'realtime' | 'cached' | 'no_data' | 'no_imei' | 'error';
  location_source: 'iopgps' | 'database' | 'manual';
  battery_level?: number;
  signal_strength?: number;
}

/**
 * Mileage response for frontend
 */
export interface MileageData {
  imei: string;
  startTime: number;
  endTime: number;
  runTime: number; // in seconds
  distance: number; // in kilometers
  averageSpeed: number; // km/h
  period: {
    start: Date;
    end: Date;
  };
}

/**
 * Track history response for frontend
 */
export interface TrackHistoryData {
  imei: string;
  period: {
    start: Date;
    end: Date;
  };
  points: TrackPoint[];
  summary: {
    totalDistance: number;
    totalDuration: number;
    averageSpeed: number;
    maxSpeed: number;
    stops: number;
  };
}

/**
 * Health check response
 */
export interface IopgpsHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  tokenValid: boolean;
  apiAccessible: boolean;
  databaseConnected: boolean;
  lastSync?: Date;
  connectedDevices: number;
  totalDevices: number;
  responseTime?: number;
}

/**
 * Sync operation result
 */
export interface SyncResult {
  success: number;
  failed: number;
  total: number;
  duration: number;
  timestamp: Date;
  errors?: string[];
}

/**
 * Error responses
 */
export interface IopgpsError {
  code: number;
  message: string;
  details?: any;
  timestamp: Date;
  requestId?: string;
}

// Utility types for frontend consumption

/**
 * Simplified location data for maps
 */
export interface SimpleLocation {
  imei: string;
  plat_nomor: string;
  lat: number;
  lng: number;
  last_update: Date;
  speed?: number;
  direction?: number;
  status: string;
  gps_status: string;
}

/**
 * Motor GPS status summary
 */
export interface MotorGpsSummary {
  total: number;
  online: number;
  offline: number;
  no_imei: number;
  moving: number;
  parked: number;
  lastUpdated: Date;
}

/**
 * Device status for dashboard
 */
export interface DashboardGpsStatus {
  totalMotors: number;
  withImei: number;
  onlineNow: number;
  needAttention: number;
  recentUpdates: MotorWithGpsStatus[];
}

// Enum for consistent status values

export enum GpsStatus {
  REALTIME = 'realtime',
  CACHED = 'cached',
  NO_DATA = 'no_data',
  NO_IMEI = 'no_imei',
  ERROR = 'error',
}

export enum LocationSource {
  IOPGPS = 'iopgps',
  DATABASE = 'database',
  MANUAL = 'manual',
}

export enum VehicleStatusEnum {
  TERSEDIA = 'tersedia',
  DISEWA = 'disewa',
  PERBAIKAN = 'perbaikan',
}

export enum GpsDeviceStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
  SLEEP = 'sleep',
  UNKNOWN = 'unknown',
}

// Response wrapper for consistent API responses

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  timestamp: Date;
  metadata?: {
    page?: number;
    limit?: number;
    total?: number;
    source?: 'iopgps' | 'database' | 'cache';
    cached?: boolean;
  };
}

/**
 * Response for bulk operations
 */
export interface BulkOperationResult {
  total: number;
  success: number;
  failed: number;
  results: {
    imei: string;
    success: boolean;
    message?: string;
    error?: string;
  }[];
}
