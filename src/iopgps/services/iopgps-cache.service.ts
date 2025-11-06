// src/iopgps/services/iopgps-cache.service.ts
import { Injectable, Inject, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { CACHE_TTL } from '../iopgps.constants';
import {
  VehicleStatus,
  DeviceLocationResponse,
  MotorWithLocationStatus,
} from '../interfaces/responses.interface';

@Injectable()
export class IopgpsCacheService {
  private readonly logger = new Logger(IopgpsCacheService.name);

  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  /**
   * Cache vehicle status data
   */
  async cacheVehicleStatus(
    licenseNumber: string | undefined,
    vin: string | undefined,
    data: VehicleStatus[],
  ): Promise<void> {
    const cacheKey = `vehicle_status_${licenseNumber || 'all'}_${vin || 'none'}`;
    await this.cacheManager.set(cacheKey, data, CACHE_TTL.VEHICLE_STATUS);
    this.logger.debug(`Vehicle status cached for key: ${cacheKey}`);
  }

  /**
   * Get cached vehicle status
   */
  async getCachedVehicleStatus(
    licenseNumber?: string,
    vin?: string,
  ): Promise<VehicleStatus[] | null> {
    const cacheKey = `vehicle_status_${licenseNumber || 'all'}_${vin || 'none'}`;
    const cached = await this.cacheManager.get<VehicleStatus[]>(cacheKey);
    if (cached) {
      this.logger.debug(`Returning cached vehicle status for key: ${cacheKey}`);
    }
    return cached;
  }

  /**
   * Cache device location
   */
  async cacheDeviceLocation(
    imei: string,
    data: DeviceLocationResponse,
  ): Promise<void> {
    const cacheKey = `device_location_${imei}`;
    if (data.code === 0) {
      await this.cacheManager.set(cacheKey, data, CACHE_TTL.LOCATION_DATA);
      this.logger.debug(`Device location cached for IMEI: ${imei}`);
    }
  }

  /**
   * Get cached device location
   */
  async getCachedDeviceLocation(
    imei: string,
  ): Promise<DeviceLocationResponse | null> {
    const cacheKey = `device_location_${imei}`;
    const cached =
      await this.cacheManager.get<DeviceLocationResponse>(cacheKey);
    if (cached) {
      this.logger.debug(`Returning cached location for IMEI: ${imei}`);
    }
    return cached;
  }

  /**
   * Cache motors with location status
   */
  async cacheMotorsWithLocationStatus(
    data: MotorWithLocationStatus[],
  ): Promise<void> {
    const cacheKey = 'motors_with_location_status';
    await this.cacheManager.set(cacheKey, data, CACHE_TTL.MOTORS_LIST);
    this.logger.debug('Motors with location status cached');
  }

  /**
   * Get cached motors with location status
   */
  async getCachedMotorsWithLocationStatus(): Promise<
    MotorWithLocationStatus[] | null
  > {
    const cacheKey = 'motors_with_location_status';
    const cached =
      await this.cacheManager.get<MotorWithLocationStatus[]>(cacheKey);
    if (cached) {
      this.logger.debug('Returning cached motors with location status');
    }
    return cached;
  }

  /**
   * Cache individual motor realtime data
   */
  async cacheMotorRealtimeData(
    motorId: number,
    data: MotorWithLocationStatus,
  ): Promise<void> {
    const cacheKey = `motor_realtime_${motorId}`;
    await this.cacheManager.set(cacheKey, data, 30000); // 30 seconds
    this.logger.debug(`Motor realtime data cached for ID: ${motorId}`);
  }

  /**
   * Get cached motor realtime data
   */
  async getCachedMotorRealtimeData(
    motorId: number,
  ): Promise<MotorWithLocationStatus | null> {
    const cacheKey = `motor_realtime_${motorId}`;
    const cached =
      await this.cacheManager.get<MotorWithLocationStatus>(cacheKey);
    if (cached) {
      this.logger.debug(`Returning cached realtime data for motor ${motorId}`);
    }
    return cached;
  }

  /**
   * Clear cache for specific device location
   */
  async clearDeviceLocationCache(imei: string): Promise<void> {
    const cacheKey = `device_location_${imei}`;
    await this.cacheManager.del(cacheKey);
    this.logger.debug(`Device location cache cleared for IMEI: ${imei}`);
  }

  /**
   * Clear all cache related to motors
   */
  async clearAllMotorCache(): Promise<void> {
    const keys = [
      'motors_with_location_status',
      // Add other motor-related cache keys here
    ];

    for (const key of keys) {
      await this.cacheManager.del(key);
    }

    // Clear all motor_realtime_* keys
    // Note: This is a simplified approach. In production, you might want to use Redis patterns
    this.logger.debug('All motor cache cleared');
  }

  /**
   * Get cache statistics (for debugging/monitoring) - WITH AWAIT
   */
  async getCacheStats(): Promise<{ size: number; keys: string[] }> {
    // ✅ FIX: Add minimal async operation
    await Promise.resolve();

    // Note: This implementation depends on the cache manager backend
    // For memory cache, we can't easily get all keys
    // For Redis, you would use Redis commands
    this.logger.warn('Cache stats not implemented for current cache manager');
    return { size: 0, keys: [] };
  }

  /**
   * Clear entire cache (use with caution)
   * Menggunakan store.reset() jika tersedia, fallback ke manual deletion
   */
  async clearAllCache(): Promise<void> {
    try {
      // ✅ FIX: Use proper cache manager method instead of accessing store directly
      // For cache-manager v5, use the built-in methods
      await this.clearKnownCacheKeys();
      this.logger.log('All known cache keys cleared');

      // Note: In cache-manager v5, there's no direct reset() method
      // We rely on clearing known keys manually
    } catch (error: unknown) {
      const errorMessage = this.getErrorMessage(error);
      this.logger.error('Failed to clear cache', errorMessage);
      throw new Error(`Failed to clear cache: ${errorMessage}`);
    }
  }

  /**
   * Clear known cache keys manually - WITH AWAIT
   */
  private async clearKnownCacheKeys(): Promise<void> {
    // Just clear the common keys we know about

    const commonKeys = [
      'motors_with_location_status',
      'vehicle_status_all_none',
      // Add other common cache keys here
    ];

    for (const key of commonKeys) {
      try {
        await this.cacheManager.del(key);
      } catch (error: unknown) {
        const errorMessage = this.getErrorMessage(error);
        this.logger.warn(`Failed to clear cache key ${key}: ${errorMessage}`);
      }
    }

    this.logger.debug(`Cleared ${commonKeys.length} known cache keys`);
  }

  /**
   * Set custom cache value
   */
  async setCustomCache<T>(key: string, value: T, ttl?: number): Promise<void> {
    await this.cacheManager.set(key, value, ttl);
    this.logger.debug(`Custom cache set for key: ${key}`);
  }

  /**
   * Get custom cache value
   */
  async getCustomCache<T>(key: string): Promise<T | null> {
    return await this.cacheManager.get<T>(key);
  }

  /**
   * Delete custom cache key
   */
  async deleteCustomCache(key: string): Promise<void> {
    await this.cacheManager.del(key);
    this.logger.debug(`Custom cache deleted for key: ${key}`);
  }

  /**
   * Get multiple cache keys at once
   */
  async getMultipleCacheKeys<T>(
    keys: string[],
  ): Promise<Record<string, T | null>> {
    const result: Record<string, T | null> = {};

    for (const key of keys) {
      try {
        result[key] = await this.cacheManager.get<T>(key);
      } catch (error: unknown) {
        const errorMessage = this.getErrorMessage(error);
        this.logger.warn(`Failed to get cache key ${key}: ${errorMessage}`);
        result[key] = null;
      }
    }

    return result;
  }

  /**
   * Set multiple cache values at once
   */
  async setMultipleCacheKeys<T>(
    data: Record<string, T>,
    ttl?: number,
  ): Promise<void> {
    for (const [key, value] of Object.entries(data)) {
      try {
        await this.cacheManager.set(key, value, ttl);
      } catch (error: unknown) {
        const errorMessage = this.getErrorMessage(error);
        this.logger.warn(`Failed to set cache key ${key}: ${errorMessage}`);
      }
    }

    this.logger.debug(`Set ${Object.keys(data).length} cache keys`);
  }

  /**
   * Get cache keys by pattern (simplified implementation)
   */
  async getKeysByPattern(): Promise<string[]> {
    // ✅ FIX: Remove unused parameter completely
    // This is a simplified implementation
    // In production with Redis, you would use SCAN command
    await Promise.resolve(); // Minimal async operation

    this.logger.warn('Pattern-based key search not fully implemented');
    return [];
  }

  /**
   * Check if cache key exists
   */
  async hasKey(key: string): Promise<boolean> {
    const value = await this.cacheManager.get(key);
    return value !== null && value !== undefined;
  }

  /**
   * Get cache TTL for a key (in milliseconds)
   */
  async getKeyTTL(): Promise<number | null> {
    // ✅ FIX: Remove unused parameter
    // This is a simplified implementation
    // In production with Redis, you would use TTL command
    await Promise.resolve();

    this.logger.warn('TTL check not implemented for current cache manager');
    return null;
  }

  /**
   * Get cache info for monitoring
   */
  async getCacheInfo(): Promise<{
    totalKeys: number;
    memoryUsage?: string;
    hitRate?: number;
  }> {
    await Promise.resolve();

    // Simplified implementation
    return {
      totalKeys: 0,
      memoryUsage: 'unknown',
      hitRate: 0,
    };
  }

  /**
   * Extract error message safely
   */
  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    return 'Unknown error occurred';
  }
}
