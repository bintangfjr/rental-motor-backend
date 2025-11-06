// src/iopgps/services/rate-limit.service.ts
import { Injectable, Logger } from '@nestjs/common';

// Type-safe rate limit info
interface RateLimitInfo {
  lastCall: string;
  secondsSinceLastCall: number;
  canMakeCall: boolean;
}

interface RateLimitConfig {
  calls: number;
  period: number;
}

interface RateLimitData {
  auth: RateLimitConfig;
  other: RateLimitConfig;
}

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);

  // Track last call times untuk different endpoints
  private lastCallTimes: Map<string, number> = new Map();

  // Rate limits sesuai dokumentasi IOPGPS
  private readonly rateLimits: RateLimitData = {
    auth: { calls: 2, period: 60000 }, // 2 calls per minute
    other: { calls: 10, period: 1000 }, // 10 calls per second
  };

  /**
   * Check rate limit untuk endpoint tertentu
   */
  checkRateLimit(endpointType: 'auth' | 'other', endpoint: string): void {
    const now = Date.now();
    const limit = this.rateLimits[endpointType];
    const key = `${endpointType}:${endpoint}`;

    const lastCallTime = this.lastCallTimes.get(key) || 0;
    const timeSinceLastCall = now - lastCallTime;

    const minInterval = limit.period / limit.calls;

    if (timeSinceLastCall < minInterval) {
      const waitTime = Math.ceil((minInterval - timeSinceLastCall) / 1000);
      throw new Error(
        `Rate limit exceeded for ${endpoint}. Please wait ${waitTime} seconds.`,
      );
    }

    this.lastCallTimes.set(key, now);
  }

  /**
   * Get rate limit info untuk debugging - TYPE SAFE VERSION
   */
  getRateLimitInfo(): Record<string, RateLimitInfo> {
    const info: Record<string, RateLimitInfo> = {};

    for (const [key, lastCallTime] of this.lastCallTimes.entries()) {
      const timeSinceLastCall = Date.now() - lastCallTime;

      // ✅ FIX: Type-safe property assignment
      info[key] = {
        lastCall: new Date(lastCallTime).toISOString(),
        secondsSinceLastCall: Math.floor(timeSinceLastCall / 1000),
        canMakeCall: timeSinceLastCall > 1000, // 1 second minimum
      };
    }

    return info;
  }

  /**
   * Get specific endpoint rate limit status
   */
  getEndpointStatus(
    endpointType: 'auth' | 'other',
    endpoint: string,
  ): RateLimitInfo {
    const key = `${endpointType}:${endpoint}`;
    const lastCallTime = this.lastCallTimes.get(key) || 0;
    const timeSinceLastCall = Date.now() - lastCallTime;
    const limit = this.rateLimits[endpointType];
    const minInterval = limit.period / limit.calls;

    return {
      lastCall: new Date(lastCallTime).toISOString(),
      secondsSinceLastCall: Math.floor(timeSinceLastCall / 1000),
      canMakeCall: timeSinceLastCall >= minInterval,
    };
  }

  /**
   * Calculate wait time untuk endpoint tertentu
   */
  calculateWaitTime(endpointType: 'auth' | 'other', endpoint: string): number {
    const key = `${endpointType}:${endpoint}`;
    const lastCallTime = this.lastCallTimes.get(key) || 0;
    const timeSinceLastCall = Date.now() - lastCallTime;
    const limit = this.rateLimits[endpointType];
    const minInterval = limit.period / limit.calls;

    if (timeSinceLastCall >= minInterval) {
      return 0;
    }

    return Math.ceil((minInterval - timeSinceLastCall) / 1000);
  }

  /**
   * Check if can make call tanpa throw error
   */
  canMakeCall(endpointType: 'auth' | 'other', endpoint: string): boolean {
    const key = `${endpointType}:${endpoint}`;
    const lastCallTime = this.lastCallTimes.get(key) || 0;
    const timeSinceLastCall = Date.now() - lastCallTime;
    const limit = this.rateLimits[endpointType];
    const minInterval = limit.period / limit.calls;

    return timeSinceLastCall >= minInterval;
  }

  /**
   * Record call tanpa check limit (untuk manual tracking)
   */
  recordCall(endpointType: 'auth' | 'other', endpoint: string): void {
    const key = `${endpointType}:${endpoint}`;
    this.lastCallTimes.set(key, Date.now());
  }

  /**
   * Get rate limit configuration
   */
  getRateLimitConfig(): RateLimitData {
    return { ...this.rateLimits };
  }

  /**
   * Clear rate limit counters
   */
  clearRateLimit(): void {
    this.lastCallTimes.clear();
    this.logger.debug('Rate limit counters cleared');
  }

  /**
   * Clear specific endpoint counter
   */
  clearEndpoint(endpointType: 'auth' | 'other', endpoint: string): void {
    const key = `${endpointType}:${endpoint}`;
    this.lastCallTimes.delete(key);
    this.logger.debug(`Rate limit counter cleared for ${key}`);
  }

  /**
   * Get all tracked endpoints
   */
  getTrackedEndpoints(): string[] {
    return Array.from(this.lastCallTimes.keys());
  }
}
